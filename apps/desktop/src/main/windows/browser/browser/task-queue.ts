import { globalEnv } from '@/global/global-env';
import { globalMainPathParser } from '@/global/global-main-path-parser';
import { BrowserWindow, screen, session } from 'electron';
import { AppDataSource } from '@/orm/data-source';
import { AccountEntity, TaskStatus } from '@/orm/entities/account';
import { ProxyPoolEntity } from '@/orm/entities/proxy-pool';
import { getConfigValue } from '@/main/ipc/pokemoncenter/captcha-config';
import {
  clearBrowserData,
  parseProxyString,
  setupProxyForSession,
  clearProxyForSession,
  resetSessionProxy,
  proxyInfoMap,
  loginEventListeners,
} from './common';

// 任务窗口信息
interface TaskWindowInfo {
  window: BrowserWindow;
  account: AccountEntity;
  startTime: number;
  timeoutTimer?: NodeJS.Timeout; // 超时定时器
  statusCheckInterval?: NodeJS.Timeout; // 状态检查定时器
  isClosing?: boolean; // 标记窗口是否正在关闭中，防止重复处理
}

// 任务队列管理器
export class TaskQueueManager {
  private static instance: TaskQueueManager;
  private taskQueue: AccountEntity[] = [];
  private runningTasks: Map<string, TaskWindowInfo> = new Map(); // key: account.mail
  private windowToAccountMap: Map<number, string> = new Map(); // window.id -> account.mail
  private maxConcurrency: number = 3;
  private isProcessing: boolean = false;
  private windowGrid: { cols: number; rows: number } = { cols: 3, rows: 2 };
  private windowSize: { width: number; height: number } = {
    width: 520,
    height: 720,
  };
  private showWindow: boolean = false;
  private enableProxy: boolean = true;
  private clearBrowserData: boolean = false;
  private maxRetryCount: number = 3;
  private retryCountMap: Map<string, number> = new Map(); // key: account.mail, value: retry count

  private constructor() {
    this.calculateWindowGrid();
  }

  public static getInstance(): TaskQueueManager {
    if (!TaskQueueManager.instance) {
      TaskQueueManager.instance = new TaskQueueManager();
    }
    return TaskQueueManager.instance;
  }

  private calculateWindowGrid(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } =
      primaryDisplay.workAreaSize;
    const maxCols = Math.floor(screenWidth / (this.windowSize.width + 20));
    const maxRows = Math.floor(screenHeight / (this.windowSize.height + 20));
    this.windowGrid = {
      cols: Math.max(2, Math.min(maxCols, 4)),
      rows: Math.max(1, Math.min(maxRows, 3)),
    };
  }

  private calculateWindowPosition(index: number): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: screenX, y: screenY } = primaryDisplay.workArea;
    const cols = Math.ceil(Math.sqrt(this.maxConcurrency));
    const offsetX = 150;
    const offsetY = 150;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = screenX + col * offsetX;
    const y = screenY + row * offsetY;
    return { x: Math.round(x), y: Math.round(y) };
  }

  private recalculateWindowPositions(): void {
    let index = 0;
    for (const [accountMail, taskInfo] of this.runningTasks.entries()) {
      if (!taskInfo.window.isDestroyed()) {
        const position = this.calculateWindowPosition(index);
        taskInfo.window.setPosition(position.x, position.y);
        index++;
      }
    }
  }

  public setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, Math.min(max, 30));
  }

  public setShowWindow(show: boolean): void {
    this.showWindow = show;
  }

  public setEnableProxy(enable: boolean): void {
    this.enableProxy = enable;
  }

  public setClearBrowserData(clear: boolean): void {
    this.clearBrowserData = clear;
  }

  public setMaxRetryCount(max: number): void {
    this.maxRetryCount = Math.max(0, Math.min(max, 10));
    console.log(`[TaskQueue] 设置最大重试次数: ${this.maxRetryCount}`);
  }

  public getMaxRetryCount(): number {
    return this.maxRetryCount;
  }

  public getCurrentConcurrency(): number {
    return this.runningTasks.size;
  }

  private getRetryCount(mail: string): number {
    return this.retryCountMap.get(mail) || 0;
  }

  private incrementRetryCount(mail: string): void {
    const current = this.getRetryCount(mail);
    this.retryCountMap.set(mail, current + 1);
  }

  private resetRetryCount(mail: string): void {
    this.retryCountMap.delete(mail);
  }

  // 暴露 resetRetryCount 供外部调用（用于窗口关闭时重置）
  public resetRetryCountPublic(mail: string): void {
    this.resetRetryCount(mail);
  }

  // 暴露 getRetryCount 供外部调用（用于调试）
  public getRetryCountPublic(mail: string): number {
    return this.getRetryCount(mail);
  }

  /**
   * 请求关闭窗口
   * @param accountMail 账号邮箱（必须提供）
   * @param shouldCountRetry 是否算作一次重试
   */
  public async requestCloseWindow(
    accountMail: string,
    shouldCountRetry: boolean,
  ): Promise<void> {
    if (!accountMail) {
      console.error('[TaskQueue] requestCloseWindow: accountMail 不能为空');
      return;
    }

    const taskInfo = this.runningTasks.get(accountMail);
    if (!taskInfo || taskInfo.window.isDestroyed()) {
      return;
    }

    // 防止重复处理
    if (taskInfo.isClosing) {
      return;
    }

    taskInfo.isClosing = true;

    // 获取当前账号状态并更新
    if (AppDataSource.isInitialized) {
      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const currentAccount = await repo.findOne({
          where: { mail: accountMail },
        });

        if (currentAccount?.status === TaskStatus.DONE) {
          this.resetRetryCount(accountMail);
        } else if (shouldCountRetry) {
          await this.updateAccountStatus(accountMail, TaskStatus.ERROR, undefined);
        } else {
          this.resetRetryCount(accountMail);
          await this.updateAccountStatus(accountMail, TaskStatus.DONE, undefined);
        }
      } catch (error) {
        console.error(`[TaskQueue] 更新账号状态失败:`, error);
      }
    }

    // 关闭窗口
    const window = taskInfo.window;
    if (!window.isClosable()) {
      window.setClosable(true);
    }

    try {
      window.close();
      setImmediate(() => {
        if (!window.isDestroyed()) {
          try {
            window.destroy();
          } catch (error) {
            console.error(`[TaskQueue] 强制关闭窗口失败: ${accountMail}`, error);
          }
        }
      });
    } catch (error) {
      try {
        window.destroy();
      } catch (destroyError) {
        console.error(`[TaskQueue] 关闭窗口失败: ${accountMail}`, destroyError);
      }
    }
  }

  public addTasks(accounts: AccountEntity[]): void {
    if (!accounts?.length) return;

    const validAccounts = accounts
      .filter((acc) => acc.status === TaskStatus.NONE)
      .filter((acc) => {
        // 检查重试次数是否超过限制
        const retryCount = this.getRetryCount(acc.mail);
        if (retryCount > this.maxRetryCount) {
          console.log(
            `[TaskQueue] 跳过任务 ${acc.mail}，重试次数 ${retryCount} 已超过最大重试次数 ${this.maxRetryCount}`,
          );
          // 超过重试次数时，重置重试计数，防止无限重试
          this.resetRetryCount(acc.mail);
          return false;
        }
        const taskInfo = this.runningTasks.get(acc.mail);
        if (taskInfo && !taskInfo.window.isDestroyed() && taskInfo.isClosing) {
          console.log(
            `[TaskQueue] 跳过任务 ${acc.mail}，窗口正在关闭中`,
          );
          return false;
        }
        return !taskInfo || taskInfo.window.isDestroyed();
      });

    if (validAccounts.length === 0) return;

    this.taskQueue.push(...validAccounts);

    setImmediate(() => {
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // 再次检查，防止在设置标志后又有新的任务添加
    try {
      while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
        this.cleanupCompletedTasks();
        while (
          this.runningTasks.size < this.maxConcurrency &&
          this.taskQueue.length > 0
        ) {
          const account = this.taskQueue.shift();
          if (account) {
            // 再次检查重试次数，防止在队列等待期间重试次数被重置后仍然启动
            const retryCount = this.getRetryCount(account.mail);
            if (retryCount > this.maxRetryCount) {
              console.log(
                `[TaskQueue] processQueue: 跳过任务 ${account.mail}，重试次数 ${retryCount} 已超过最大重试次数 ${this.maxRetryCount}`,
              );
              this.resetRetryCount(account.mail);
              continue;
            }

            const existingTask = this.runningTasks.get(account.mail);
            if (
              existingTask &&
              (!existingTask.window.isDestroyed() || existingTask.isClosing)
            ) {
              continue;
            }
            await this.startTask(account);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      // 确保即使出错也重置标志
      this.isProcessing = false;
    }
  }

  private async startTask(account: AccountEntity): Promise<void> {
    // 在启动任务前再次检查重试次数，防止超过限制的任务被启动
    const retryCount = this.getRetryCount(account.mail);
    if (retryCount > this.maxRetryCount) {
      console.log(
        `[TaskQueue] startTask: 跳过任务 ${account.mail}，重试次数 ${retryCount} 已超过最大重试次数 ${this.maxRetryCount}`,
      );
      this.resetRetryCount(account.mail);
      return;
    }

    try {
      const position = this.calculateWindowPosition(this.runningTasks.size);
      const window = await this.createTaskWindow(account, position);

      // 存储窗口ID到账号mail的映射
      this.windowToAccountMap.set(window.id, account.mail);

      // 设置 8 分钟超时定时器
      const timeoutTimer = setTimeout(
        async () => {
          if (globalEnv.isDev) return;
          try {
            const currentTaskInfo = this.runningTasks.get(account.mail);
            if (
              !currentTaskInfo ||
              window.isDestroyed() ||
              currentTaskInfo.isClosing
            ) {
              return;
            }

            if (AppDataSource.isInitialized) {
              const repo = AppDataSource.getRepository(AccountEntity);
              const updatedAccount = await repo.findOne({
                where: { mail: account.mail },
              });

              if (
                updatedAccount &&
                updatedAccount.status !== TaskStatus.DONE &&
                updatedAccount.status !== TaskStatus.ERROR
              ) {
                await this.updateAccountStatus(
                  account.mail,
                  TaskStatus.ERROR,
                  '任务超时（8分钟）',
                );
                if (!window.isDestroyed() && !currentTaskInfo.isClosing) {
                  await this.requestCloseWindow(account.mail, true);
                }
              }
            }
          } catch (error) {
            console.error(`[TaskQueue] 超时处理失败:`, error);
          }
        },
        8 * 60 * 1000,
      ); // 8 分钟

      const taskInfo: TaskWindowInfo = {
        window,
        account,
        startTime: Date.now(),
        timeoutTimer,
        statusCheckInterval: undefined, // 将在 setupTaskCompletionListener 中设置
      };

      this.runningTasks.set(account.mail, taskInfo);

      // 注意：不要在 startTask 中注册 closed 事件，因为 setupTaskCompletionListener 中已经注册了
      // 这样可以避免重复处理窗口关闭事件

      this.setupTaskCompletionListener(window, account, timeoutTimer);
    } catch (error: any) {
      // 启动失败：只更新状态为 ERROR，不更新 statusText
      // 因为只有超时和网络问题可以在后端更新 statusText
      await this.updateAccountStatus(
        account.mail,
        TaskStatus.ERROR,
        undefined,
      );
      console.error(`[TaskQueue] 启动任务失败: ${account.mail}, 错误: ${error.message}`);
    }
  }

  /**
   * 根据窗口ID获取账号mail
   */
  public getAccountMailByWindowId(windowId: number): string | undefined {
    return this.windowToAccountMap.get(windowId);
  }

  /**
   * 检查账号的窗口是否打开
   */
  public isWindowOpen(accountMail: string): boolean {
    const taskInfo = this.runningTasks.get(accountMail);
    if (!taskInfo) {
      return false;
    }
    return !taskInfo.window.isDestroyed();
  }

  /**
   * 获取所有打开的窗口账号列表
   */
  public getOpenWindowAccounts(): string[] {
    const openAccounts: string[] = [];
    for (const [accountMail, taskInfo] of this.runningTasks.entries()) {
      if (!taskInfo.window.isDestroyed()) {
        openAccounts.push(accountMail);
      }
    }
    return openAccounts;
  }

  /**
   * 如果窗口关闭，清理任务并重置重试计数
   */
  public cleanupClosedWindow(accountMail: string): void {
    const taskInfo = this.runningTasks.get(accountMail);
    if (taskInfo && taskInfo.window.isDestroyed()) {
      this.cleanupTaskInfo(taskInfo);
      this.runningTasks.delete(accountMail);
      const windowId = taskInfo.window.id;
      if (this.windowToAccountMap.has(windowId)) {
        this.windowToAccountMap.delete(windowId);
      }
      // 重置重试计数
      this.resetRetryCount(accountMail);
      console.log(
        `[TaskQueue] 检测到窗口已关闭，已清理任务并重置重试计数: ${accountMail}`,
      );
    }
  }

  private async createTaskWindow(
    account: AccountEntity,
    position: { x: number; y: number },
  ): Promise<BrowserWindow> {
    const partition = account.data?.loginId
      ? `persist:pokemoncenter-${account.data.loginId}`
      : 'persist:pokemoncenter-default';

    // 根据设置决定是否清除浏览器数据，还原成纯净状态
    if (this.clearBrowserData) {
      await clearBrowserData(partition);
    }

    // 获取 session 并重置代理（确保是全新状态）
    const targetSession = session.fromPartition(partition);
    await resetSessionProxy(targetSession);

    // 读取用户配置的开发模式设置
    const developmentModeConfig =
      (await getConfigValue('development_mode')) === 'true';

    // 根据开发者工具配置决定窗口大小
    // 如果配置中启用了开发者工具，使用当前尺寸（1200x800）
    // 如果实际打开了开发者工具，使用手机页面尺寸
    let windowWidth: number;
    let windowHeight: number;
    let minWidth: number;
    let minHeight: number;

    // 先使用当前尺寸创建窗口（未打开开发者工具时的尺寸）
    windowWidth = this.windowSize.width;
    windowHeight = this.windowSize.height;
    minWidth = 400;
    minHeight = 600;

    const window = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x: position.x,
      y: position.y,
      minWidth: minWidth,
      minHeight: minHeight,
      show: false,
      webPreferences: {
        webSecurity: false,
        spellcheck: false,
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: false,
        preload: globalMainPathParser.resolvePreload('browser.cjs').toString(),
        partition: partition,
      },
    });

    // 只有在配置允许且是开发环境时才打开开发者工具
    let devToolsOpened = false;
    if (developmentModeConfig) {
      window.webContents.openDevTools({ mode: 'right' });
      devToolsOpened = true;
    }

    // 如果实际打开了开发者工具，调整窗口大小为手机页面尺寸
    if (devToolsOpened) {
      window.setSize(1200, 800);
      window.setMinimumSize(800, 600);
    }

    // 获取代理信息
    let proxyString: string | undefined = undefined;
    if (this.enableProxy) {
      // 如果账号有指定代理，使用账号的代理
      if (account.data?.proxy) {
        proxyString = account.data.proxy;
      } else {
        // 如果账号没有指定代理，从代理池随机选择一个启用的代理
        try {
          const proxyRepo = AppDataSource.getRepository(ProxyPoolEntity);
          const enabledProxies = await proxyRepo.find({
            where: { enabled: true },
          });

          if (enabledProxies.length > 0) {
            // 随机选择一个
            const randomIndex = Math.floor(
              Math.random() * enabledProxies.length,
            );
            proxyString = enabledProxies[randomIndex]?.proxy;
            console.log(
              `[createTaskWindow] 从代理池随机选择代理: ${proxyString}`,
            );
          } else {
            console.warn('[createTaskWindow] 代理池中没有启用的代理');
          }
        } catch (error) {
          console.error('[createTaskWindow] 从代理池获取代理失败:', error);
        }
      }
    }

    const proxyInfo = proxyString ? parseProxyString(proxyString) : null;
    const sessionKey = `task-window-${window.id}`;
    if (proxyInfo) {
      setupProxyForSession(
        window.webContents.session,
        proxyInfo,
        sessionKey,
        window.webContents,
      );
    }
    window.webContents.setWindowOpenHandler((details) => {
      const { url, disposition } = details;
      if (disposition === 'new-window') {
        const childWindow = new BrowserWindow({
          width: 1200,
          height: 800,
          webPreferences: {
            spellcheck: false,
            sandbox: false,
            nodeIntegration: true,
            contextIsolation: false,
            partition: partition,
            preload: globalMainPathParser
              .resolvePreload('browser.cjs')
              .toString(),
          },
        });
        const childSessionKey = `child-${sessionKey}-${childWindow.id}`;
        if (proxyInfo) {
          setupProxyForSession(
            childWindow.webContents.session,
            proxyInfo,
            childSessionKey,
            childWindow.webContents,
          );
        }
        // 子窗口关闭时清理代理
        childWindow.on('closed', () => {
          const childWindowId = childWindow.id;
          let webContentsId: number | undefined;

          try {
            if (
              !childWindow.isDestroyed() &&
              !childWindow.webContents.isDestroyed()
            ) {
              webContentsId = childWindow.webContents.id;
              clearProxyForSession(
                childWindow.webContents.session,
                childSessionKey,
                childWindow.webContents,
              );
              // 注意：不要在这里调用 destroy()，因为窗口关闭时 webContents 会自动销毁
            }
          } catch (error) {
            // 忽略访问已销毁对象的错误
            console.warn(
              `[TaskQueue] 访问子窗口 ${childWindowId} 的 webContents 时出错:`,
              error,
            );
          }

          // 清理代理信息和事件监听器（即使 webContents 已销毁）
          proxyInfoMap.delete(childSessionKey);
          if (webContentsId !== undefined) {
            const listener = loginEventListeners.get(webContentsId);
            if (listener) {
              loginEventListeners.delete(webContentsId);
            }
          }
        });
        childWindow.loadURL(url);
        childWindow.show();
        return { action: 'deny' };
      }
      window.webContents.loadURL(url);
      return { action: 'deny' };
    });

    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // 监听 URL 导航，检测 chrome-error://chromewebdata
    // 使用闭包保存 account.mail，避免依赖窗口映射
    const accountMail = account.mail;
    let chromeErrorHandled = false; // 防止重复处理

    const handleChromeError = async (url: string, source: string) => {
      // 防止重复处理（多个事件可能同时触发）
      if (chromeErrorHandled) {
        console.log(
          `[createTaskWindow] chrome-error 已处理，跳过: ${accountMail}`,
        );
        return;
      }

      // 检查窗口是否还存在
      const currentTaskInfo = this.runningTasks.get(accountMail);
      if (
        !currentTaskInfo ||
        currentTaskInfo.window.isDestroyed() ||
        currentTaskInfo.isClosing
      ) {
        console.log(
          `[createTaskWindow] 窗口已关闭或正在关闭，跳过 chrome-error 处理: ${accountMail}`,
        );
        return;
      }

      chromeErrorHandled = true;
      console.log(
        `[createTaskWindow] 检测到 chrome-error 页面 (${source}): ${url}, 账号: ${accountMail}`,
      );

      // 更新任务状态为 ERROR
      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const currentAccount = await repo.findOne({
          where: { mail: accountMail },
        });
        if (currentAccount) {
          currentAccount.status = TaskStatus.ERROR;
          currentAccount.statusText = '网络或者代理不可用';
          await repo.save(currentAccount);
        }
      } catch (error) {
        console.error(`[createTaskWindow] 更新任务状态失败:`, error);
      }

      // 立即关闭窗口并重试
      await this.requestCloseWindow(accountMail, true);
    };

    const navigateListener = async (_event: Electron.Event, url: string) => {
      if (url && url.includes('chrome-error://chromewebdata')) {
        await handleChromeError(url, 'did-navigate');
      }
    };

    const failLoadListener = async (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
    ) => {
      if (
        validatedURL &&
        validatedURL.includes('chrome-error://chromewebdata')
      ) {
        await handleChromeError(validatedURL, 'did-fail-load');
      }
    };

    window.webContents.on('did-navigate', navigateListener);
    window.webContents.on('did-fail-load', failLoadListener);

    // 在窗口关闭时移除监听器，防止内存泄漏
    window.once('closed', () => {
      try {
        if (!window.webContents.isDestroyed()) {
          window.webContents.removeListener('did-navigate', navigateListener);
          window.webContents.removeListener('did-fail-load', failLoadListener);
          console.log(`[createTaskWindow] 已移除 URL 监听器: ${accountMail}`);
        }
      } catch (error) {
        console.warn(`[createTaskWindow] 移除 URL 监听器失败:`, error);
      }
    });

    // 设置账号信息的函数
    const setAccountMail = () => {
      window.webContents.send('set-current-account-mail', account.mail);
    };

    // 在 dom-ready 时设置（页面 DOM 准备就绪）
    window.webContents.once('dom-ready', setAccountMail);

    window.loadURL('about:blank');
    if (this.showWindow) {
      window.once('ready-to-show', () => {
        window.show();
      });
    }

    return window;
  }

  private setupTaskCompletionListener(
    window: BrowserWindow,
    account: AccountEntity,
    timeoutTimer: NodeJS.Timeout,
  ): void {
    let statusCheckIntervalCleared = false; // 防止重复清理
    const accountMail = account.mail;
    let aboutBlankTimer: NodeJS.Timeout | undefined; // about:blank 页面超时定时器
    let aboutBlankStartTime: number | undefined; // about:blank 页面开始时间

    const clearAllTimers = () => {
      if (!statusCheckIntervalCleared) {
        statusCheckIntervalCleared = true;
        clearInterval(statusCheckInterval);
        clearTimeout(timeoutTimer);
        if (aboutBlankTimer) {
          clearTimeout(aboutBlankTimer);
          aboutBlankTimer = undefined;
        }
        aboutBlankStartTime = undefined;
      }
    };

    // 监听页面导航，检测 chrome-error 和 about:blank 页面
    const handlePageNavigation = async (url: string) => {
      if (window.isDestroyed() || statusCheckIntervalCleared) return;

      const currentTaskInfo = this.runningTasks.get(accountMail);
      if (currentTaskInfo && currentTaskInfo.isClosing) return;

      // 检测 chrome-error 页面，立即关闭
      if (url.includes('chrome-error://chromewebdata/')) {
        await this.updateAccountStatus(
          accountMail,
          TaskStatus.ERROR,
          '网络或者代理不可用',
        );
        await this.requestCloseWindow(accountMail, true);
        return;
      }

      // 检测 about:blank 页面，设置20秒超时
      if (url === 'about:blank') {
        if (!aboutBlankStartTime) {
          aboutBlankStartTime = Date.now();
          aboutBlankTimer = setTimeout(async () => {
            if (window.isDestroyed() || statusCheckIntervalCleared) return;
            if (window.webContents.getURL() === 'about:blank') {
              await this.updateAccountStatus(
                accountMail,
                TaskStatus.ERROR,
                '页面加载超时（about:blank）',
              );
              await this.requestCloseWindow(accountMail, true);
            }
          }, 20 * 1000);
        }
      } else if (aboutBlankTimer) {
        // 导航到其他页面，清除 about:blank 定时器
        clearTimeout(aboutBlankTimer);
        aboutBlankTimer = undefined;
        aboutBlankStartTime = undefined;
      }
    };

    // 监听页面导航
    window.webContents.on('did-navigate', (_event, url) => {
      handlePageNavigation(url).catch((error) => {
        console.error(`[TaskQueue] 处理页面导航失败:`, error);
      });
    });

    // 检查初始URL
    const initialUrl = window.webContents.getURL();
    if (initialUrl) {
      handlePageNavigation(initialUrl).catch((error) => {
        console.error(`[TaskQueue] 处理初始URL失败:`, error);
      });
    }

    const statusCheckInterval = setInterval(async () => {
      try {
        if (!AppDataSource.isInitialized) {
          clearAllTimers();
          return;
        }
        if (window.isDestroyed()) {
          clearAllTimers();
          return;
        }
        const repo = AppDataSource.getRepository(AccountEntity);
        const updatedAccount = await repo.findOne({
          where: { mail: accountMail },
        });
        if (!updatedAccount) {
          clearAllTimers();
          return;
        }
        if (
          updatedAccount.status === TaskStatus.DONE ||
          updatedAccount.status === TaskStatus.ERROR
        ) {
          const currentTaskInfo = this.runningTasks.get(accountMail);
          if (currentTaskInfo?.isClosing) {
            clearAllTimers();
            return;
          }

          clearAllTimers();

          const shouldCountRetry = updatedAccount.status === TaskStatus.ERROR;
          await this.requestCloseWindow(accountMail, shouldCountRetry);
        }
      } catch (error) {
        console.error(`[TaskQueue] 检查任务状态失败:`, error);
        // 出错时也清理定时器，避免继续运行
        clearAllTimers();
      }
    }, 2000);

    // 将定时器引用保存到 taskInfo 中，以便在窗口关闭时清理
    const taskInfo = this.runningTasks.get(accountMail);
    if (taskInfo) {
      taskInfo.statusCheckInterval = statusCheckInterval;
    }

    let closedHandlerExecuted = false;
    window.on('closed', async () => {
      if (closedHandlerExecuted) return;
      closedHandlerExecuted = true;
      clearAllTimers();

      // 在窗口关闭时，先保存 webContents 的引用和 ID（如果还存在）
      const windowId = window.id;
      const sessionKey = `task-window-${windowId}`;
      let webContentsId: number | undefined;

      try {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          webContentsId = window.webContents.id;
          clearProxyForSession(
            window.webContents.session,
            sessionKey,
            window.webContents,
          );
          // 注意：不要在这里调用 destroy()，因为窗口关闭时 webContents 会自动销毁
        }
      } catch (error) {
        // 忽略访问已销毁对象的错误
      }
      proxyInfoMap.delete(sessionKey);
      if (webContentsId !== undefined) {
        loginEventListeners.delete(webContentsId);
      }

      const currentTaskInfo = this.runningTasks.get(account.mail);
      if (!currentTaskInfo || currentTaskInfo.window.id !== windowId) {
        return;
      }

      const isManualClose = !currentTaskInfo.isClosing;

      // 处理重试逻辑
      let shouldRetry = false;
      if (AppDataSource.isInitialized) {
        try {
          const repo = AppDataSource.getRepository(AccountEntity);
          const updatedAccount = await repo.findOne({
            where: { mail: account.mail },
          });

          if (!updatedAccount) return;

          // 如果状态是 DONE，不重试
          if (updatedAccount.status === TaskStatus.DONE) {
            this.resetRetryCount(account.mail);
            return;
          }

          if (isManualClose) {
            // 手动关闭：重置为 NONE 状态，允许更新状态日志
            updatedAccount.status = TaskStatus.NONE;
            updatedAccount.statusText = '手动停止';
            await repo.save(updatedAccount);
            this.resetRetryCount(account.mail);
          } else {
            // 程序关闭：处理重试逻辑
            if (updatedAccount.status !== TaskStatus.ERROR) {
              updatedAccount.status = TaskStatus.ERROR;
              await repo.save(updatedAccount);
            }

            this.incrementRetryCount(account.mail);
            const newRetryCount = this.getRetryCount(account.mail);
            console.log(
              `[TaskQueue] 窗口关闭（程序关闭），账号: ${account.mail}, 当前重试次数: ${newRetryCount}/${this.maxRetryCount}`,
            );

            if (newRetryCount <= this.maxRetryCount) {
              // 清理任务信息（准备重试）
              const retryTaskInfo = this.runningTasks.get(account.mail);
              if (retryTaskInfo && retryTaskInfo.window.id === windowId) {
                this.cleanupTaskInfo(retryTaskInfo);
                this.runningTasks.delete(account.mail);
                console.log(
                  `[TaskQueue] 已从 runningTasks 中删除任务（准备重试）: ${account.mail}, 重试次数: ${newRetryCount}`,
                );
              }

              // 重置状态为 NONE 并重试
              updatedAccount.status = TaskStatus.NONE;
              await repo.save(updatedAccount);
              shouldRetry = true;
              console.log(
                `[TaskQueue] 准备重试任务，账号: ${account.mail}, 重试次数: ${newRetryCount}/${this.maxRetryCount}`,
              );
              // 直接添加到队列，addTasks 会再次检查重试次数
              this.addTasks([updatedAccount]);
            } else {
              // 超过最大重试次数，不再重试
              console.log(
                `[TaskQueue] 账号 ${account.mail} 重试次数 ${newRetryCount} 已超过最大重试次数 ${this.maxRetryCount}，停止重试`,
              );
              // 重置重试次数，防止后续误判
              this.resetRetryCount(account.mail);
              // 确保状态保持为 ERROR，不重置为 NONE
              if (updatedAccount.status !== TaskStatus.ERROR) {
                updatedAccount.status = TaskStatus.ERROR;
                await repo.save(updatedAccount);
              }
            }
          }
        } catch (error) {
          console.error(`[TaskQueue] 窗口关闭时处理失败:`, error);
        }
      }

      // 清理任务信息（如果任务需要重试，已经在上面删除了）
      // 只有在任务不需要重试或已经超过重试次数时，才在这里清理
      if (!shouldRetry) {
        const finalTaskInfo = this.runningTasks.get(account.mail);
        if (finalTaskInfo && finalTaskInfo.window.id === windowId) {
          this.cleanupTaskInfo(finalTaskInfo);
          this.runningTasks.delete(account.mail);
        }
      }

      // 清理窗口映射
      if (this.windowToAccountMap.get(windowId) === account.mail) {
        this.windowToAccountMap.delete(windowId);
      }

      this.recalculateWindowPositions();

      // 如果任务需要重试，确保队列处理继续运行
      if (shouldRetry && !this.isProcessing && this.taskQueue.length > 0) {
        this.processQueue();
      }
    });
  }

  /**
   * 清理任务信息（定时器等）
   */
  private cleanupTaskInfo(taskInfo: TaskWindowInfo): void {
    if (taskInfo.timeoutTimer) {
      clearTimeout(taskInfo.timeoutTimer);
    }
    if (taskInfo.statusCheckInterval) {
      clearInterval(taskInfo.statusCheckInterval);
    }
  }

  private async updateAccountStatus(
    accountMail: string,
    status: TaskStatus,
    statusText?: string | null,
  ): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) return;

      await AppDataSource.transaction(async (transactionalEntityManager) => {
        const repo = transactionalEntityManager.getRepository(AccountEntity);
        const account = await repo.findOne({ where: { mail: accountMail } });
        if (account) {
          account.status = status;
          if (statusText !== undefined && statusText !== null && statusText !== '') {
            account.statusText = statusText;
          }
          await repo.save(account);
        }
      });
    } catch (error) {
      console.error(`[TaskQueue] 更新账号状态失败:`, error);
    }
  }

  private cleanupCompletedTasks(): void {
    const toDelete: string[] = [];
    for (const [accountMail, taskInfo] of this.runningTasks.entries()) {
      if (taskInfo.window.isDestroyed()) {
        this.cleanupTaskInfo(taskInfo);
        toDelete.push(accountMail);
        const windowId = taskInfo.window.id;
        if (this.windowToAccountMap.has(windowId)) {
          this.windowToAccountMap.delete(windowId);
        }
        this.resetRetryCount(accountMail);
      }
    }
    for (const accountMail of toDelete) {
      this.runningTasks.delete(accountMail);
    }
  }

  public async stopAllTasks(): Promise<void> {
    this.taskQueue = [];
    const accountMails = Array.from(this.runningTasks.values()).map(
      (taskInfo) => {
        this.cleanupTaskInfo(taskInfo);
        if (!taskInfo.window.isDestroyed()) {
          taskInfo.window.close();
        }
        this.resetRetryCount(taskInfo.account.mail);
        return taskInfo.account.mail;
      },
    );

    this.runningTasks.clear();
    this.windowToAccountMap.clear();
    this.retryCountMap.clear();
    this.isProcessing = false;

    if (AppDataSource.isInitialized && accountMails.length > 0) {
      await this.resetTasksStatus(accountMails, '手动停止');
    }
  }

  public async resetAllRunningTasksStatus(): Promise<void> {
    const accountMails = Array.from(this.runningTasks.values()).map(
      (taskInfo) => taskInfo.account.mail,
    );

    if (AppDataSource.isInitialized && accountMails.length > 0) {
      await this.resetTasksStatus(accountMails);
    }
  }

  private async resetTasksStatus(accountMails: string[], statusText?: string): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      await repo
        .createQueryBuilder()
        .update(AccountEntity)
        .set({ status: TaskStatus.NONE, statusText: statusText || '' })
        .where('mail IN (:...mails)', { mails: accountMails })
        .andWhere('status NOT IN (:...statuses)', {
          statuses: [TaskStatus.DONE, TaskStatus.ERROR],
        })
        .execute();
    } catch (error) {
      console.error('[TaskQueue] 批量重置任务状态失败，降级为逐个更新:', error);
      // 降级为逐个更新
      const repo = AppDataSource.getRepository(AccountEntity);
      for (const accountMail of accountMails) {
        try {
          const account = await repo.findOne({ where: { mail: accountMail } });
          if (
            account &&
            account.status !== TaskStatus.DONE &&
            account.status !== TaskStatus.ERROR
          ) {
            account.status = TaskStatus.NONE;
            account.statusText = statusText || '';
            await repo.save(account);
          }
        } catch (err) {
          console.error(`[TaskQueue] 重置任务状态失败: ${accountMail}`, err);
        }
      }
    }
  }

  public async resetAllNonDoneTasksStatus(): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) return;

      const repo = AppDataSource.getRepository(AccountEntity);
      await repo
        .createQueryBuilder()
        .update(AccountEntity)
        .set({ status: TaskStatus.NONE, statusText: '' })
        .where('status NOT IN (:...statuses)', {
          statuses: [TaskStatus.DONE, TaskStatus.ERROR],
        })
        .execute();
    } catch (error) {
      console.error('[TaskQueue] 重置所有非 DONE 任务状态失败:', error);
    }
  }

  public async stopSelectedTasks(accountMails: string[]): Promise<number> {
    const accountsToReset: string[] = [];
    let stoppedCount = 0;

    for (const accountMail of accountMails) {
      const taskInfo = this.runningTasks.get(accountMail);
      if (taskInfo) {
        this.cleanupTaskInfo(taskInfo);
        if (!taskInfo.window.isDestroyed()) {
          taskInfo.window.close();
        }
        this.runningTasks.delete(accountMail);
        if (!taskInfo.window.isDestroyed()) {
          this.windowToAccountMap.delete(taskInfo.window.id);
        }
        this.resetRetryCount(accountMail);
        stoppedCount++;
        accountsToReset.push(accountMail);
      }

      // 从队列中移除
      const index = this.taskQueue.findIndex((acc) => acc.mail === accountMail);
      if (index !== -1) {
        this.taskQueue.splice(index, 1);
      }
    }

    // 批量重置数据库状态（手动停止时允许更新状态日志）
    if (AppDataSource.isInitialized && accountsToReset.length > 0) {
      await this.resetTasksStatus(accountsToReset, '手动停止');
    }

    this.recalculateWindowPositions();
    return stoppedCount;
  }

  public getQueueStatus() {
    // 计算实际打开的窗口数量（排除已关闭但未清理的窗口）
    const actualRunningCount = Array.from(this.runningTasks.values()).filter(
      (taskInfo) => !taskInfo.window.isDestroyed() && !taskInfo.isClosing,
    ).length;

    return {
      queueLength: this.taskQueue.length,
      runningCount: actualRunningCount, // 使用实际打开的窗口数量
      maxConcurrency: this.maxConcurrency,
      isProcessing: this.isProcessing,
    };
  }
}
