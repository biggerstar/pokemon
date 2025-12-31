import { globalEnv } from '@/global/global-env';
import { globalMainPathParser } from '@/global/global-main-path-parser';
import { BrowserWindow, Notification, screen, session } from 'electron';
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
  private windowSize: { width: number; height: number } = { width: 1200, height: 800 };
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
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
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
    console.log(`[TaskQueue] 账号 ${mail} 重试次数: ${current + 1}/${this.maxRetryCount}`);
  }

  private resetRetryCount(mail: string): void {
    this.retryCountMap.delete(mail);
  }

  // 暴露 resetRetryCount 供外部调用（用于窗口关闭时重置）
  public resetRetryCountPublic(mail: string): void {
    this.resetRetryCount(mail);
  }

  /**
   * 请求关闭窗口
   * @param accountMail 账号邮箱
   * @param shouldCountRetry 是否算作一次重试
   */
  public async requestCloseWindow(
    accountMail: string | undefined,
    shouldCountRetry: boolean,
  ): Promise<void> {
    console.log(`[TaskQueue] 收到关闭窗口请求: ${accountMail}, shouldCountRetry: ${shouldCountRetry}`);
    
    // 如果 accountMail 为 undefined，尝试从当前 webContents 查找对应的账号
    let mail = accountMail;
    if (!mail) {
      // 尝试从 IPC 事件中获取 webContents，然后查找对应的账号
      // 注意：这里需要从 IPC 事件中获取 webContents，但当前方法没有这个参数
      // 所以我们需要另一种方式：从所有运行的任务中查找
      console.warn(`[TaskQueue] accountMail 为 undefined，尝试从运行中的任务查找`);
      // 如果只有一个运行中的任务，使用它
      if (this.runningTasks.size === 1) {
        mail = Array.from(this.runningTasks.keys())[0];
        console.log(`[TaskQueue] 找到唯一运行中的任务: ${mail}`);
      } else {
        console.error(`[TaskQueue] 无法确定要关闭的窗口，当前运行的任务数: ${this.runningTasks.size}`);
        return;
      }
    }
    
    const taskInfo = this.runningTasks.get(mail);
    if (!taskInfo) {
      console.warn(`[TaskQueue] 账号 ${mail} 的窗口不存在，无法关闭。当前运行的任务:`, Array.from(this.runningTasks.keys()));
      return;
    }

    // 防止重复处理：如果窗口正在关闭中，直接返回
    if (taskInfo.isClosing) {
      console.log(`[TaskQueue] 账号 ${mail} 的窗口正在关闭中，忽略重复的关闭请求`);
      return;
    }

    const window = taskInfo.window;
    if (window.isDestroyed()) {
      console.warn(`[TaskQueue] 账号 ${mail} 的窗口已销毁`);
      return;
    }

    // 标记窗口正在关闭中，防止重复处理
    taskInfo.isClosing = true;

    // 如果应该计数重试，先检查是否已达到最大重试次数
    if (shouldCountRetry) {
      const currentRetryCount = this.getRetryCount(mail);
      // 如果已经达到最大重试次数，不再增加，直接关闭窗口
      if (currentRetryCount >= this.maxRetryCount) {
        console.log(
          `[TaskQueue] 账号 ${mail} 已达到最大重试次数 ${this.maxRetryCount}，不再重试，直接关闭窗口`,
        );
      } else {
        this.incrementRetryCount(mail);
        const retryCount = this.getRetryCount(mail);
        console.log(
          `[TaskQueue] 账号 ${mail} 请求关闭窗口（算作重试），当前重试次数: ${retryCount}/${this.maxRetryCount}`,
        );
      }
      
      // 确保状态是 ERROR（如果还没有设置）
      if (AppDataSource.isInitialized) {
        try {
          const repo = AppDataSource.getRepository(AccountEntity);
          const currentAccount = await repo.findOne({
            where: { mail },
          });
          if (currentAccount) {
            const errorStatusText = currentAccount.statusText || '任务失败';
            if (currentAccount.status !== TaskStatus.ERROR) {
              await this.updateAccountStatus(
                mail,
                TaskStatus.ERROR,
                errorStatusText,
              );
              console.log(`[TaskQueue] 已确保状态为 ERROR: ${mail}, 错误信息: ${errorStatusText}`);
            } else {
              console.log(`[TaskQueue] 状态已经是 ERROR: ${mail}, 错误信息: ${currentAccount.statusText}`);
            }
            // 等待状态更新完成，确保数据库状态已更新
            await new Promise(resolve => setImmediate(resolve));
          }
        } catch (error) {
          console.error(`[TaskQueue] 确保状态为 ERROR 失败:`, error);
        }
      }
    } else {
      // 任务成功完成，清理所有相关缓存
      this.resetRetryCount(mail);
      console.log(`[TaskQueue] 账号 ${mail} 请求关闭窗口（任务成功），已清理重试次数缓存`);
      
      // 确保状态是 DONE（如果还没有设置）
      if (AppDataSource.isInitialized) {
        try {
          const repo = AppDataSource.getRepository(AccountEntity);
          const currentAccount = await repo.findOne({
            where: { mail },
          });
          if (currentAccount && currentAccount.status !== TaskStatus.DONE) {
            await this.updateAccountStatus(
              mail,
              TaskStatus.DONE,
              currentAccount.statusText || '任务完成',
            );
            console.log(`[TaskQueue] 已确保状态为 DONE: ${mail}`);
          }
          // 等待状态更新完成，确保数据库状态已更新
          await new Promise(resolve => setImmediate(resolve));
        } catch (error) {
          console.error(`[TaskQueue] 确保状态为 DONE 失败:`, error);
        }
      }
    }
    
    // 关闭窗口（在状态更新完成后）
    console.log(`[TaskQueue] 开始关闭窗口: ${mail}, shouldCountRetry: ${shouldCountRetry}`);
    console.log(`[TaskQueue] 窗口状态: isDestroyed=${window.isDestroyed()}, isClosable=${window.isClosable()}`);
    
    try {
      // 确保窗口可以关闭
      if (!window.isClosable()) {
        window.setClosable(true);
        console.log(`[TaskQueue] 已设置窗口为可关闭: ${mail}`);
      }
      
      // 直接调用 close()，如果失败则使用 destroy()
      window.close();
      console.log(`[TaskQueue] 已调用 window.close()，等待窗口关闭...`);
      
      // 立即检查窗口是否已关闭，如果没有则强制关闭
      setImmediate(() => {
        if (!window.isDestroyed()) {
          console.warn(`[TaskQueue] 窗口未立即关闭，尝试强制关闭: ${mail}`);
          try {
            window.destroy();
            console.log(`[TaskQueue] 已通过 destroy() 强制关闭窗口: ${mail}`);
          } catch (error) {
            console.error(`[TaskQueue] destroy() 失败:`, error);
          }
        } else {
          console.log(`[TaskQueue] 窗口已成功关闭: ${mail}`);
        }
      });
    } catch (error) {
      console.error(`[TaskQueue] 调用 window.close() 失败:`, error);
      // 如果 close() 失败，直接销毁
      try {
        window.destroy();
        console.log(`[TaskQueue] 已通过 destroy() 关闭窗口: ${mail}`);
      } catch (destroyError) {
        console.error(`[TaskQueue] destroy() 也失败:`, destroyError);
      }
    }
  }

  public addTasks(accounts: AccountEntity[]): void {
    if (!accounts || accounts.length === 0) {
      console.log(`[TaskQueue] 没有任务需要添加`);
      return;
    }
    
    const noneAccounts = accounts.filter((acc) => acc.status === TaskStatus.NONE);
    if (noneAccounts.length === 0) {
      console.log(`[TaskQueue] 没有状态为 NONE 的任务需要添加，输入的任务状态:`, accounts.map(acc => `${acc.mail}: ${acc.status}`));
      return;
    }
    
    // 过滤掉已经在运行中或正在关闭的任务
    const validAccounts = noneAccounts.filter((acc) => {
      const taskInfo = this.runningTasks.get(acc.mail);
      if (taskInfo) {
        // 如果任务正在运行中或正在关闭，跳过
        if (!taskInfo.window.isDestroyed() || taskInfo.isClosing) {
          console.log(`[TaskQueue] 跳过任务 ${acc.mail}，因为窗口正在运行中或正在关闭`);
          return false;
        }
      }
      return true;
    });
    
    if (validAccounts.length === 0) {
      console.log(`[TaskQueue] 所有任务都已运行中或正在关闭，无需添加`);
      return;
    }
    
    // 对于新任务（重试次数为 0 的 NONE 状态任务），重置重试次数
    // 这样可以区分新任务和重试任务
    for (const account of validAccounts) {
      const retryCount = this.getRetryCount(account.mail);
      // 如果重试次数为 0，说明是新任务，确保重试次数为 0（可能之前有残留）
      if (retryCount === 0) {
        this.resetRetryCount(account.mail);
      }
    }
    
    console.log(`[TaskQueue] 准备添加 ${validAccounts.length} 个任务到队列:`, validAccounts.map(acc => acc.mail));
    this.taskQueue.push(...validAccounts);
    console.log(`[TaskQueue] 已添加 ${validAccounts.length} 个任务到队列，当前队列长度: ${this.taskQueue.length}, isProcessing: ${this.isProcessing}, runningTasks: ${this.runningTasks.size}`);
    
    // 使用 setImmediate 确保 isProcessing 标志的检查是原子的
    setImmediate(() => {
      if (!this.isProcessing) {
        console.log(`[TaskQueue] 启动队列处理`);
        this.processQueue();
      } else {
        console.log(`[TaskQueue] 队列正在处理中，任务将在下次循环中被处理`);
      }
    });
  }

  private async processQueue(): Promise<void> {
    // 使用双重检查锁定模式，确保 isProcessing 标志的原子性
    if (this.isProcessing) {
      console.log(`[TaskQueue] 队列正在处理中，跳过重复启动`);
      return;
    }
    this.isProcessing = true;
    
    // 再次检查，防止在设置标志后又有新的任务添加
    try {
      console.log(`[TaskQueue] 开始处理队列，当前队列长度: ${this.taskQueue.length}, 运行中任务数: ${this.runningTasks.size}`);
      while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
        this.cleanupCompletedTasks();
        while (
          this.runningTasks.size < this.maxConcurrency &&
          this.taskQueue.length > 0
        ) {
          const account = this.taskQueue.shift();
          if (account) {
            // 再次检查任务是否已经在运行中或正在关闭
            const existingTask = this.runningTasks.get(account.mail);
            if (existingTask && (!existingTask.window.isDestroyed() || existingTask.isClosing)) {
              console.log(`[TaskQueue] 跳过任务 ${account.mail}，因为窗口正在运行中或正在关闭`);
              continue;
            }
            console.log(`[TaskQueue] 从队列中取出任务: ${account.mail}`);
            await this.startTask(account);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log(`[TaskQueue] 队列处理完成，当前队列长度: ${this.taskQueue.length}, 运行中任务数: ${this.runningTasks.size}`);
    } finally {
      // 确保即使出错也重置标志
      this.isProcessing = false;
    }
  }

  private async startTask(account: AccountEntity): Promise<void> {
    try {
      const position = this.calculateWindowPosition(this.runningTasks.size);
      const window = await this.createTaskWindow(account, position);

      // 存储窗口ID到账号mail的映射
      this.windowToAccountMap.set(window.id, account.mail);

      // 设置 5 分钟超时定时器
      const timeoutTimer = setTimeout(async () => {
        if (globalEnv.isDev) return;
        try {
          // 检查窗口是否已销毁或正在关闭中
          const currentTaskInfo = this.runningTasks.get(account.mail);
          if (!currentTaskInfo || window.isDestroyed() || currentTaskInfo.isClosing) {
            console.log(`[TaskQueue] 超时定时器触发，但窗口已销毁或正在关闭中: ${account.mail}`);
            return;
          }

          // 检查任务状态
          if (AppDataSource.isInitialized) {
            const repo = AppDataSource.getRepository(AccountEntity);
            const updatedAccount = await repo.findOne({
              where: { mail: account.mail },
            });

            // 如果任务还没完成（不是 DONE 或 ERROR），则关闭窗口
            if (
              updatedAccount &&
              updatedAccount.status !== TaskStatus.DONE &&
              updatedAccount.status !== TaskStatus.ERROR
            ) {
              console.log(
                `[TaskQueue] 任务超时（5分钟），关闭窗口: ${account.mail}`,
              );

              // 更新状态为错误
              await this.updateAccountStatus(
                account.mail,
                TaskStatus.ERROR,
                '任务超时（5分钟）',
              );

              // 关闭窗口（会触发 requestCloseWindow）
              if (!window.isDestroyed() && !currentTaskInfo.isClosing) {
                window.close();
              }
            }
          }
        } catch (error) {
          console.error(`[TaskQueue] 超时处理失败:`, error);
        }
      }, 5 * 60 * 1000); // 5 分钟

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
      await this.updateAccountStatus(
        account.mail,
        TaskStatus.ERROR,
        `启动失败: ${error.message}`,
      );
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
      // 清理超时定时器
      if (taskInfo.timeoutTimer) {
        clearTimeout(taskInfo.timeoutTimer);
      }
      // 窗口已关闭，清理任务信息
      this.runningTasks.delete(accountMail);
      const windowId = taskInfo.window.id;
      if (this.windowToAccountMap.has(windowId)) {
        this.windowToAccountMap.delete(windowId);
      }
      // 重置重试计数
      this.resetRetryCount(accountMail);
      console.log(`[TaskQueue] 检测到窗口已关闭，已清理任务并重置重试计数: ${accountMail}`);
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

    const window = new BrowserWindow({
      width: this.windowSize.width,
      height: this.windowSize.height,
      x: position.x,
      y: position.y,
      minWidth: 800,
      minHeight: 600,
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

    // 读取用户配置的开发者工具设置
    const enableDevToolsConfig = (await getConfigValue('enable_dev_tools')) === 'true';
    // 只有在配置允许且是开发环境时才打开开发者工具
    if (globalEnv.isDev && enableDevToolsConfig) {
      window.webContents.openDevTools({ mode: 'right' });
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
            const randomIndex = Math.floor(Math.random() * enabledProxies.length);
            proxyString = enabledProxies[randomIndex]?.proxy;
            console.log(`[createTaskWindow] 从代理池随机选择代理: ${proxyString}`);
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
            preload: globalMainPathParser.resolvePreload('browser.cjs').toString(),
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
        console.log(`[createTaskWindow] chrome-error 已处理，跳过: ${accountMail}`);
        return;
      }
      
      // 检查窗口是否还存在
      const currentTaskInfo = this.runningTasks.get(accountMail);
      if (!currentTaskInfo || currentTaskInfo.window.isDestroyed() || currentTaskInfo.isClosing) {
        console.log(`[createTaskWindow] 窗口已关闭或正在关闭，跳过 chrome-error 处理: ${accountMail}`);
        return;
      }
      
      chromeErrorHandled = true;
      console.log(`[createTaskWindow] 检测到 chrome-error 页面 (${source}): ${url}, 账号: ${accountMail}`);
      
      // 更新任务状态为 ERROR
      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const currentAccount = await repo.findOne({ where: { mail: accountMail } });
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
    
    const failLoadListener = async (_event: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string) => {
      if (validatedURL && validatedURL.includes('chrome-error://chromewebdata')) {
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
    
    const clearAllTimers = () => {
      if (!statusCheckIntervalCleared) {
        statusCheckIntervalCleared = true;
        clearInterval(statusCheckInterval);
        clearTimeout(timeoutTimer);
      }
    };
    
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
        if (updatedAccount.status === TaskStatus.DONE || updatedAccount.status === TaskStatus.ERROR) {
          // 检查窗口是否正在关闭中，避免重复调用 requestCloseWindow
          const currentTaskInfo = this.runningTasks.get(accountMail);
          if (currentTaskInfo && currentTaskInfo.isClosing) {
            console.log(`[TaskQueue] setupTaskCompletionListener 检测到状态变化，但窗口正在关闭中，跳过: ${accountMail}`);
            clearAllTimers();
            return;
          }
          
          clearAllTimers();

          const shouldCountRetry = updatedAccount.status === TaskStatus.ERROR;
          if (Notification.isSupported()) {
            const title = shouldCountRetry ? '任务失败' : '任务完成';
            const body = shouldCountRetry
              ? `账号 ${accountMail} 的任务失败: ${updatedAccount.statusText || '未知错误'} (重试 ${this.getRetryCount(accountMail)}/${this.maxRetryCount})`
              : `账号 ${accountMail} 的任务已完成`;
            new Notification({ title, body, silent: false }).show();
          }

          console.log(`[TaskQueue] setupTaskCompletionListener 检测到 ${updatedAccount.status}，调用 requestCloseWindow: ${accountMail}`);
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

    let closedHandlerExecuted = false; // 防止 closed 事件被重复处理
    window.on('closed', async () => {
      // 防止重复处理 closed 事件
      if (closedHandlerExecuted) {
        console.warn(`[TaskQueue] 窗口关闭事件已处理，跳过重复处理: ${accountMail}`);
        return;
      }
      closedHandlerExecuted = true;
      
      console.log(`[TaskQueue] 窗口关闭事件触发: ${accountMail}`);

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
        console.warn(
          `[TaskQueue] 访问窗口 ${windowId} 的 webContents 时出错:`,
          error,
        );
      }

      // 清理代理信息和事件监听器（即使 webContents 已销毁）
      proxyInfoMap.delete(sessionKey);
      if (webContentsId !== undefined) {
        const listener = loginEventListeners.get(webContentsId);
        if (listener) {
          loginEventListeners.delete(webContentsId);
        }
      }

      // 防止重复处理：检查任务是否已经被处理
      const currentTaskInfo = this.runningTasks.get(account.mail);
      if (!currentTaskInfo || currentTaskInfo.window.id !== windowId) {
        console.warn(`[TaskQueue] 窗口 ${windowId} 的任务信息已不存在或不匹配，跳过处理: ${account.mail}`);
        return;
      }

      // 注意：即使 isClosing 为 true，也要执行重试逻辑
      // isClosing 只是防止 requestCloseWindow 被重复调用，不应该阻止 closed 事件的重试逻辑
      // 因为重试逻辑必须在窗口关闭后执行

      // 处理重试逻辑：只要不是 DONE 和手动关闭，都必须重试
      let shouldRetry = false;
      if (AppDataSource.isInitialized) {
        try {
          // 使用数据库事务确保状态更新的原子性
          const repo = AppDataSource.getRepository(AccountEntity);
          const updatedAccount = await repo.findOne({
            where: { mail: account.mail },
          });
          if (updatedAccount) {
            const retryCount = this.getRetryCount(account.mail);

            // 如果状态是 DONE，清理所有相关缓存，不重试
            if (updatedAccount.status === TaskStatus.DONE) {
              // 清理重试次数缓存
              this.resetRetryCount(account.mail);
              // 从 runningTasks 中删除（如果还存在）
              const taskInfo = this.runningTasks.get(account.mail);
              if (taskInfo) {
                // 清理超时定时器
                if (taskInfo.timeoutTimer) {
                  clearTimeout(taskInfo.timeoutTimer);
                }
                this.runningTasks.delete(account.mail);
              }
              // 从 windowToAccountMap 中删除
              if (this.windowToAccountMap.has(windowId)) {
                this.windowToAccountMap.delete(windowId);
              }
              console.log(`[TaskQueue] 窗口关闭（任务成功），已清理所有缓存: ${account.mail}`);
            }
            // 判断是否是手动关闭：如果 isClosing 为 false 或 undefined，说明是手动关闭
            // 如果 isClosing 为 true，说明是通过 requestCloseWindow 关闭的，是程序关闭
            const isManualClose = !currentTaskInfo.isClosing;
            
            if (isManualClose) {
              // 手动关闭：重置为 NONE 状态，状态文本显示"手动停止"
              updatedAccount.status = TaskStatus.NONE;
              updatedAccount.statusText = '手动停止';
              await repo.save(updatedAccount);
              console.log(`[TaskQueue] 窗口关闭（手动关闭），已重置为 NONE 状态，状态文本: 手动停止: ${account.mail}`);
              
              // 清理重试次数缓存
              this.resetRetryCount(account.mail);
            }
            // 如果不是手动关闭（程序关闭），需要根据重试次数决定是否重试
            else {
              // 如果重试次数 >= maxRetryCount，不重试，保持当前状态（确保状态是 ERROR）
              if (retryCount >= this.maxRetryCount) {
                // 确保状态是 ERROR，以便前端显示错误信息
                if (updatedAccount.status !== TaskStatus.ERROR) {
                  updatedAccount.status = TaskStatus.ERROR;
                  updatedAccount.statusText = updatedAccount.statusText || '任务失败（已达到最大重试次数）';
                  await repo.save(updatedAccount);
                }
                console.log(
                  `[TaskQueue] 窗口关闭，重试次数 ${retryCount}/${this.maxRetryCount} 已达上限，保持 ERROR 状态: ${account.mail}`,
                );
              }
              // 如果重试次数 < maxRetryCount，需要重试
              else {
                // 先确保状态是 ERROR（如果还没有设置），并保留错误信息
              const errorStatusText = updatedAccount.statusText || '任务失败';
              if (updatedAccount.status !== TaskStatus.ERROR) {
                updatedAccount.status = TaskStatus.ERROR;
                updatedAccount.statusText = errorStatusText;
                await repo.save(updatedAccount);
                console.log(`[TaskQueue] 已确保状态为 ERROR: ${account.mail}, 错误信息: ${errorStatusText}`);
                // 等待状态更新完成，确保前端能看到错误状态
                await new Promise(resolve => setImmediate(resolve));
              }
              
              // 为了重试，需要重置状态为 NONE（addTasks 只接受 NONE 状态的任务）
              // 但是，在重置之前，状态已经是 ERROR，前端应该能看到错误信息
              updatedAccount.status = TaskStatus.NONE;
              updatedAccount.statusText = '';
              await repo.save(updatedAccount);
              console.log(
                `[TaskQueue] 窗口关闭（需要重试），重试次数 ${retryCount}/${this.maxRetryCount}，已重置任务状态为 NONE: ${account.mail}`,
              );
              
              // 在调用 addTasks 之前，先从 runningTasks 中删除任务
              // 这样 addTasks 就不会因为任务还在 runningTasks 中而被过滤掉
              const retryTaskInfo = this.runningTasks.get(account.mail);
              if (retryTaskInfo && retryTaskInfo.window.id === windowId) {
                // 清理超时定时器
                if (retryTaskInfo.timeoutTimer) {
                  clearTimeout(retryTaskInfo.timeoutTimer);
                }
                this.runningTasks.delete(account.mail);
                console.log(`[TaskQueue] 已从 runningTasks 中删除任务（准备重试）: ${account.mail}`);
              }
              
                shouldRetry = true;
                this.addTasks([updatedAccount]);
              }
            }
          }
        } catch (error) {
          console.error(`[TaskQueue] 窗口关闭时处理失败:`, error);
        }
      }

      // 从 runningTasks 中删除任务（确保只删除一次，且是当前窗口）
      // 注意：如果任务需要重试，已经在上面删除了，这里需要检查是否还存在
      const finalTaskInfo = this.runningTasks.get(account.mail);
      if (finalTaskInfo && finalTaskInfo.window.id === windowId) {
        // 清理超时定时器
        if (finalTaskInfo.timeoutTimer) {
          clearTimeout(finalTaskInfo.timeoutTimer);
        }
        this.runningTasks.delete(account.mail);
        console.log(`[TaskQueue] 已从 runningTasks 中删除任务: ${account.mail}`);
      }
      
      // 从 windowToAccountMap 中删除（确保只删除一次，且映射正确）
      const mappedMail = this.windowToAccountMap.get(windowId);
      if (mappedMail === account.mail) {
        this.windowToAccountMap.delete(windowId);
        console.log(`[TaskQueue] 已从 windowToAccountMap 中删除映射: ${windowId} -> ${account.mail}`);
      }
      
      this.recalculateWindowPositions();
      
      // 如果任务需要重试，确保队列处理继续运行
      if (shouldRetry && !this.isProcessing && this.taskQueue.length > 0) {
        this.processQueue();
      }
      
      console.log(`[TaskQueue] 窗口 ${windowId} (${account.mail}) 关闭处理完成`);
    });
  }

  private async completeTask(
    accountMail: string,
    status: TaskStatus,
    statusText: string,
  ): Promise<void> {
    await this.updateAccountStatus(accountMail, status, statusText);
    this.runningTasks.delete(accountMail);
    this.recalculateWindowPositions();
  }

  private async updateAccountStatus(
    accountMail: string,
    status: TaskStatus,
    statusText: string,
  ): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) return;

      // 使用事务确保状态更新的原子性，防止并发更新导致的状态不一致
      await AppDataSource.transaction(async (transactionalEntityManager) => {
        const repo = transactionalEntityManager.getRepository(AccountEntity);
        const account = await repo.findOne({ where: { mail: accountMail } });
        if (account) {
          account.status = status;
          account.statusText = statusText;
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
      // 清理已经完全关闭的窗口（无论是否在关闭处理中）
      // 如果窗口已销毁，说明已经关闭，应该清理
      if (taskInfo.window.isDestroyed()) {
        // 清理所有定时器
        if (taskInfo.timeoutTimer) {
          clearTimeout(taskInfo.timeoutTimer);
        }
        if (taskInfo.statusCheckInterval) {
          clearInterval(taskInfo.statusCheckInterval);
        }
        toDelete.push(accountMail);
        const windowId = taskInfo.window.id;
        if (this.windowToAccountMap.has(windowId)) {
          this.windowToAccountMap.delete(windowId);
        }
        // 清理重试计数（如果窗口已销毁，说明任务已结束）
        this.resetRetryCount(accountMail);
        console.log(`[TaskQueue] cleanupCompletedTasks 清理已关闭的窗口: ${accountMail}`);
      }
    }
    // 批量删除，避免在迭代过程中修改 Map
    for (const accountMail of toDelete) {
      this.runningTasks.delete(accountMail);
    }
  }

  public async stopAllTasks(): Promise<void> {
    this.taskQueue = [];
    const accountMails: string[] = [];
    this.runningTasks.forEach((taskInfo) => {
      // 清理所有定时器
      if (taskInfo.timeoutTimer) {
        clearTimeout(taskInfo.timeoutTimer);
      }
      if (taskInfo.statusCheckInterval) {
        clearInterval(taskInfo.statusCheckInterval);
      }
      if (!taskInfo.window.isDestroyed()) {
        // 只关闭窗口，让 closed 事件处理清理工作
        // 不要在这里直接访问 webContents，避免在窗口关闭过程中访问已销毁的对象
        taskInfo.window.close();
      }
      accountMails.push(taskInfo.account.mail);
      // 清理重试计数
      this.resetRetryCount(taskInfo.account.mail);
    });
    this.runningTasks.clear();
    this.windowToAccountMap.clear();
    this.retryCountMap.clear(); // 清理所有重试计数
    this.isProcessing = false;

    if (AppDataSource.isInitialized && accountMails.length > 0) {
      await this.resetTasksStatus(accountMails);
    }
  }

  public async resetAllRunningTasksStatus(): Promise<void> {
    const accountMails: string[] = [];
    this.runningTasks.forEach((taskInfo) => {
      accountMails.push(taskInfo.account.mail);
    });

    if (AppDataSource.isInitialized && accountMails.length > 0) {
      await this.resetTasksStatus(accountMails);
    }
  }

  private async resetTasksStatus(accountMails: string[]): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      for (const accountMail of accountMails) {
        const account = await repo.findOne({ where: { mail: accountMail } });
        if (
          account &&
          account.status !== TaskStatus.DONE &&
          account.status !== TaskStatus.ERROR
        ) {
          account.status = TaskStatus.NONE;
          account.statusText = '';
          await repo.save(account);
        }
      }
    } catch (error) {
      console.error('[TaskQueue] 重置任务状态失败:', error);
    }
  }

  public async resetAllNonDoneTasksStatus(): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) {
        console.warn('[TaskQueue] 数据库未初始化，跳过重置任务状态');
        return;
      }

      const repo = AppDataSource.getRepository(AccountEntity);
      const accounts = await repo.find();
      let resetCount = 0;

      for (const account of accounts) {
        if (
          account.status !== TaskStatus.DONE &&
          account.status !== TaskStatus.ERROR
        ) {
          account.status = TaskStatus.NONE;
          account.statusText = '';
          await repo.save(account);
          resetCount++;
        }
      }

      if (resetCount > 0) {
        console.log(
          `[TaskQueue] 已重置 ${resetCount} 个非 DONE/ERROR 状态的任务为 NONE`,
        );
      }
    } catch (error) {
      console.error('[TaskQueue] 重置所有非 DONE 任务状态失败:', error);
    }
  }

  public async stopSelectedTasks(accountMails: string[]): Promise<number> {
    let stoppedCount = 0;
    for (const accountMail of accountMails) {
      const taskInfo = this.runningTasks.get(accountMail);
      if (taskInfo) {
        // 清理所有定时器
        if (taskInfo.timeoutTimer) {
          clearTimeout(taskInfo.timeoutTimer);
        }
        if (taskInfo.statusCheckInterval) {
          clearInterval(taskInfo.statusCheckInterval);
        }
        if (!taskInfo.window.isDestroyed()) {
          // 只关闭窗口，让 closed 事件处理清理工作
          // 不要在这里直接访问 webContents，避免在窗口关闭过程中访问已销毁的对象
          taskInfo.window.close();
        }
        // 立即清理引用（closed 事件会异步触发，提前清理可以避免竞态条件）
        this.runningTasks.delete(accountMail);
        if (taskInfo.window && !taskInfo.window.isDestroyed()) {
          this.windowToAccountMap.delete(taskInfo.window.id);
        }
        // 清理重试计数
        this.resetRetryCount(accountMail);
        stoppedCount++;
      }
      const index = this.taskQueue.findIndex((acc) => acc.mail === accountMail);
      if (index !== -1) {
        this.taskQueue.splice(index, 1);
      }

      // 数据库状态重置：如果任务还没完成（不是 DONE 或 ERROR），则重置为 NONE
      if (AppDataSource.isInitialized) {
        try {
          const repo = AppDataSource.getRepository(AccountEntity);
          const account = await repo.findOne({ where: { mail: accountMail } });
          if (
            account &&
            account.status !== TaskStatus.DONE &&
            account.status !== TaskStatus.ERROR
          ) {
            account.status = TaskStatus.NONE;
            account.statusText = '';
            await repo.save(account);
          }
        } catch (error) {
          console.error(`[TaskQueue] 停止任务时重置状态失败:`, error);
        }
      }
    }
    this.recalculateWindowPositions();
    return stoppedCount;
  }

  public getQueueStatus() {
    // 计算实际打开的窗口数量（排除已关闭但未清理的窗口）
    const actualRunningCount = Array.from(this.runningTasks.values()).filter(
      (taskInfo) => !taskInfo.window.isDestroyed() && !taskInfo.isClosing
    ).length;
    
    return {
      queueLength: this.taskQueue.length,
      runningCount: actualRunningCount, // 使用实际打开的窗口数量
      maxConcurrency: this.maxConcurrency,
      isProcessing: this.isProcessing,
    };
  }
}


