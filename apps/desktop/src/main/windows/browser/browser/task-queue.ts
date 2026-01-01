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

interface TaskWindowInfo {
  window: BrowserWindow;
  account: AccountEntity;
  startTime: number;
  timeoutTimer?: NodeJS.Timeout;
  statusCheckInterval?: NodeJS.Timeout;
  aboutBlankTimer?: NodeJS.Timeout;
  isClosing: boolean;
}

export class TaskQueueManager {
  private static instance: TaskQueueManager;
  private taskQueue: AccountEntity[] = [];
  private runningTasks: Map<string, TaskWindowInfo> = new Map();
  private windowToAccountMap: Map<number, string> = new Map();
  private maxConcurrency: number = 3;
  private isProcessing: boolean = false;
  private windowSize = { width: 520, height: 720 };
  private showWindow: boolean = false;
  private enableProxy: boolean = true;
  private clearBrowserData: boolean = false;
  private maxRetryCount: number = 3;
  private retryCountMap: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): TaskQueueManager {
    if (!TaskQueueManager.instance) {
      TaskQueueManager.instance = new TaskQueueManager();
    }
    return TaskQueueManager.instance;
  }

  // ==================== 配置方法 ====================
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
  }

  public getMaxRetryCount(): number {
    return this.maxRetryCount;
  }

  public getCurrentConcurrency(): number {
    return this.runningTasks.size;
  }

  public resetRetryCountPublic(mail: string): void {
    this.retryCountMap.delete(mail);
  }

  public getRetryCountPublic(mail: string): number {
    return this.retryCountMap.get(mail) || 0;
  }

  // ==================== 任务管理 ====================
  public addTasks(accounts: AccountEntity[]): void {
    if (!accounts?.length) return;

    const validAccounts = accounts.filter((acc) => {
      // 只处理 NONE 状态的任务
      if (acc.status !== TaskStatus.NONE) {
        return false;
      }

      // 检查重试次数：超过限制的任务不允许添加到队列
      const retryCount = this.getRetryCount(acc.mail);
      if (retryCount > this.maxRetryCount) {
        console.log(
          `[TaskQueue] addTasks: 跳过任务 ${acc.mail}，重试次数 ${retryCount} 已超过最大重试次数 ${this.maxRetryCount}`,
        );
        // 重置重试计数，防止后续误判
        this.resetRetryCount(acc.mail);
        return false;
      }

      // 检查任务是否已经在运行
      const taskInfo = this.runningTasks.get(acc.mail);
      if (taskInfo) {
        // 如果窗口还在运行中且没有关闭，跳过
        if (!taskInfo.window.isDestroyed() && !taskInfo.isClosing) {
          return false;
        }
        // 窗口已销毁或正在关闭，可以添加
      }

      return true;
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

    try {
      while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
        this.cleanupCompletedTasks();

        while (
          this.runningTasks.size < this.maxConcurrency &&
          this.taskQueue.length > 0
        ) {
          const account = this.taskQueue.shift();
          if (!account) break;

          if (this.getRetryCount(account.mail) > this.maxRetryCount) {
            this.resetRetryCount(account.mail);
            continue;
          }

          const existingTask = this.runningTasks.get(account.mail);
          if (existingTask && !existingTask.window.isDestroyed()) {
            continue;
          }

          await this.startTask(account);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async startTask(account: AccountEntity): Promise<void> {
    if (this.getRetryCount(account.mail) > this.maxRetryCount) {
      this.resetRetryCount(account.mail);
      return;
    }

    try {
      const position = this.calculateWindowPosition(this.runningTasks.size);
      const window = await this.createTaskWindow(account, position);
      this.windowToAccountMap.set(window.id, account.mail);

      const timeoutTimer = this.setupTimeoutTimer(window, account);
      const taskInfo: TaskWindowInfo = {
        window,
        account,
        startTime: Date.now(),
        timeoutTimer,
        isClosing: false,
      };

      this.runningTasks.set(account.mail, taskInfo);
      this.setupTaskCompletionListener(window, account, timeoutTimer);
    } catch (error: unknown) {
      const err = error as Error;
      await this.updateAccountStatus(account.mail, TaskStatus.ERROR, undefined);
      console.error(`[TaskQueue] 启动任务失败: ${account.mail}`, err.message);
    }
  }

  // ==================== 窗口管理 ====================
  private calculateWindowPosition(index: number): { x: number; y: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: screenX, y: screenY } = primaryDisplay.workArea;
    const cols = Math.ceil(Math.sqrt(this.maxConcurrency));
    const offsetX = 150;
    const offsetY = 150;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: Math.round(screenX + col * offsetX),
      y: Math.round(screenY + row * offsetY),
    };
  }

  private recalculateWindowPositions(): void {
    let index = 0;
    for (const taskInfo of this.runningTasks.values()) {
      if (!taskInfo.window.isDestroyed()) {
        const position = this.calculateWindowPosition(index);
        taskInfo.window.setPosition(position.x, position.y);
        index++;
      }
    }
  }

  private async createTaskWindow(
    account: AccountEntity,
    position: { x: number; y: number },
  ): Promise<BrowserWindow> {
    const partition = account.data?.loginId
      ? `persist:pokemoncenter-${account.data.loginId}`
      : 'persist:pokemoncenter-default';

    if (this.clearBrowserData) {
      await clearBrowserData(partition);
    }

    const targetSession = session.fromPartition(partition);
    await resetSessionProxy(targetSession);

    const developmentModeConfig =
      (await getConfigValue('development_mode')) === 'true';

    const window = new BrowserWindow({
      width: this.windowSize.width,
      height: this.windowSize.height,
      x: position.x,
      y: position.y,
      minWidth: 400,
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

    if (developmentModeConfig) {
      window.webContents.openDevTools({ mode: 'right' });
      window.setSize(1200, 800);
      window.setMinimumSize(800, 600);
    }

    const proxyInfo = await this.getProxyInfo(account);
    const sessionKey = `task-window-${window.id}`;
    if (proxyInfo) {
      setupProxyForSession(
        window.webContents.session,
        proxyInfo,
        sessionKey,
        window.webContents,
      );
    }

    this.setupWindowOpenHandler(window, partition, proxyInfo);
    this.setupChromeErrorHandler(window, account.mail);
    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    window.webContents.once('dom-ready', () => {
      window.webContents.send('set-current-account-mail', account.mail);
    });

    window.loadURL('about:blank');
    if (this.showWindow) {
      window.once('ready-to-show', () => window.show());
    }

    return window;
  }

  private async getProxyInfo(
    account: AccountEntity,
  ): Promise<ReturnType<typeof parseProxyString> | null> {
    if (!this.enableProxy) return null;

    if (account.data?.proxy) {
      return parseProxyString(account.data.proxy);
    }

    try {
      const proxyRepo = AppDataSource.getRepository(ProxyPoolEntity);
      const enabledProxies = await proxyRepo.find({ where: { enabled: true } });
      if (enabledProxies.length > 0) {
        const randomIndex = Math.floor(Math.random() * enabledProxies.length);
        return parseProxyString(enabledProxies[randomIndex]?.proxy);
      }
    } catch (error) {
      console.error('[TaskQueue] 从代理池获取代理失败:', error);
    }

    return null;
  }

  private setupWindowOpenHandler(
    window: BrowserWindow,
    partition: string,
    proxyInfo: ReturnType<typeof parseProxyString>,
  ): void {
    window.webContents.setWindowOpenHandler((details) => {
      if (details.disposition === 'new-window') {
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

        const childSessionKey = `child-window-${childWindow.id}`;
        if (proxyInfo) {
          setupProxyForSession(
            childWindow.webContents.session,
            proxyInfo,
            childSessionKey,
            childWindow.webContents,
          );
        }

        childWindow.on('closed', () => {
          this.cleanupChildWindow(childWindow, childSessionKey);
        });

        childWindow.loadURL(details.url);
        childWindow.show();
      }
      return { action: 'deny' };
    });
  }

  private cleanupChildWindow(
    childWindow: BrowserWindow,
    sessionKey: string,
  ): void {
    try {
      if (
        !childWindow.isDestroyed() &&
        !childWindow.webContents.isDestroyed()
      ) {
        const webContentsId = childWindow.webContents.id;
        clearProxyForSession(
          childWindow.webContents.session,
          sessionKey,
          childWindow.webContents,
        );
        proxyInfoMap.delete(sessionKey);
        loginEventListeners.delete(webContentsId);
      }
    } catch (error) {
      // 忽略访问已销毁对象的错误
    }
  }

  private setupChromeErrorHandler(
    window: BrowserWindow,
    accountMail: string,
  ): void {
    let handled = false;

    const handleError = async (url: string) => {
      if (handled) return;
      const taskInfo = this.runningTasks.get(accountMail);
      if (!taskInfo || taskInfo.window.isDestroyed() || taskInfo.isClosing) {
        return;
      }

      handled = true;
      await this.updateAccountStatus(
        accountMail,
        TaskStatus.ERROR,
        '网络或者代理不可用',
      );
      await this.requestCloseWindow(accountMail, true);
    };

    const navigateListener = async (_event: Electron.Event, url: string) => {
      if (url?.includes('chrome-error://chromewebdata')) {
        await handleError(url);
      }
    };

    const failLoadListener = async (
      _event: Electron.Event,
      _errorCode: number,
      _errorDescription: string,
      validatedURL: string,
    ) => {
      if (validatedURL?.includes('chrome-error://chromewebdata')) {
        await handleError(validatedURL);
      }
    };

    window.webContents.on('did-navigate', navigateListener);
    window.webContents.on('did-fail-load', failLoadListener);

    window.once('closed', () => {
      try {
        if (!window.webContents.isDestroyed()) {
          window.webContents.removeListener('did-navigate', navigateListener);
          window.webContents.removeListener('did-fail-load', failLoadListener);
        }
      } catch (error) {
        // 忽略错误
      }
    });
  }

  // ==================== 超时处理 ====================
  private setupTimeoutTimer(
    window: BrowserWindow,
    account: AccountEntity,
  ): NodeJS.Timeout {
    return setTimeout(async () => {
      if (globalEnv.isDev) return;

      const taskInfo = this.runningTasks.get(account.mail);
      if (
        !taskInfo ||
        window.isDestroyed() ||
        taskInfo.isClosing
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
          if (!window.isDestroyed() && !taskInfo.isClosing) {
            await this.requestCloseWindow(account.mail, true);
          }
        }
      }
    }, 8 * 60 * 1000);
  }

  // ==================== 任务完成监听 ====================
  private setupTaskCompletionListener(
    window: BrowserWindow,
    account: AccountEntity,
    timeoutTimer: NodeJS.Timeout,
  ): void {
    const accountMail = account.mail;
    let timersCleared = false;
    let aboutBlankTimer: NodeJS.Timeout | undefined;

    const clearAllTimers = () => {
      if (timersCleared) return;
      timersCleared = true;
      clearTimeout(timeoutTimer);
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
      if (aboutBlankTimer) {
        clearTimeout(aboutBlankTimer);
      }
    };

    const handlePageNavigation = (url: string) => {
      if (window.isDestroyed() || timersCleared) return;

      const taskInfo = this.runningTasks.get(accountMail);
      if (taskInfo?.isClosing) return;

      if (url.includes('chrome-error://chromewebdata/')) {
        this.updateAccountStatus(
          accountMail,
          TaskStatus.ERROR,
          '网络或者代理不可用',
        ).then(() => {
          this.requestCloseWindow(accountMail, true);
        });
        return;
      }

      if (url === 'about:blank') {
        if (!aboutBlankTimer) {
          aboutBlankTimer = setTimeout(async () => {
            if (window.isDestroyed() || timersCleared) return;
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
        clearTimeout(aboutBlankTimer);
        aboutBlankTimer = undefined;
      }
    };

    window.webContents.on('did-navigate', (_event, url) => {
      handlePageNavigation(url);
    });

    const initialUrl = window.webContents.getURL();
    if (initialUrl) {
      handlePageNavigation(initialUrl);
    }

    const statusCheckInterval = setInterval(async () => {
      if (timersCleared || !AppDataSource.isInitialized || window.isDestroyed()) {
        clearAllTimers();
        return;
      }

      try {
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
          const taskInfo = this.runningTasks.get(accountMail);
          if (taskInfo?.isClosing) {
            clearAllTimers();
            return;
          }

          clearAllTimers();
          const shouldCountRetry = updatedAccount.status === TaskStatus.ERROR;
          await this.requestCloseWindow(accountMail, shouldCountRetry);
        }
      } catch (error) {
        console.error(`[TaskQueue] 检查任务状态失败:`, error);
        clearAllTimers();
      }
    }, 2000);

    const taskInfo = this.runningTasks.get(accountMail);
    if (taskInfo) {
      taskInfo.statusCheckInterval = statusCheckInterval;
      taskInfo.aboutBlankTimer = aboutBlankTimer;
    }

    let closedExecuted = false;
    window.on('closed', async () => {
      if (closedExecuted) return;
      closedExecuted = true;
      clearAllTimers();

      const windowId = window.id;
      const sessionKey = `task-window-${windowId}`;
      this.cleanupWindowResources(window, sessionKey);

      const taskInfo = this.runningTasks.get(accountMail);
      if (!taskInfo || taskInfo.window.id !== windowId) {
        // 如果任务信息不匹配，说明可能已经被处理过了，直接清理
        if (taskInfo) {
          this.cleanupTaskInfo(taskInfo);
          this.runningTasks.delete(accountMail);
        }
        return;
      }

      // 在 Windows 平台上，确保 isClosing 标志正确
      const isClosing = taskInfo.isClosing;
      
      // 先删除任务信息，防止重复处理
      this.cleanupTaskInfo(taskInfo);
      this.runningTasks.delete(accountMail);
      this.windowToAccountMap.delete(windowId);

      // 然后处理窗口关闭逻辑
      await this.handleWindowClosed(accountMail, windowId, isClosing);
      
      this.recalculateWindowPositions();
    });
  }

  private cleanupWindowResources(
    window: BrowserWindow,
    sessionKey: string,
  ): void {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        const webContentsId = window.webContents.id;
        clearProxyForSession(
          window.webContents.session,
          sessionKey,
          window.webContents,
        );
        proxyInfoMap.delete(sessionKey);
        loginEventListeners.delete(webContentsId);
      }
    } catch (error) {
      // 忽略错误
    }
  }

  private async handleWindowClosed(
    accountMail: string,
    windowId: number,
    isClosing: boolean,
  ): Promise<void> {
    if (!AppDataSource.isInitialized) return;

    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      const account = await repo.findOne({ where: { mail: accountMail } });
      if (!account) {
        // 如果账号不存在，重置重试计数
        this.resetRetryCount(accountMail);
        return;
      }

      // DONE 状态的任务不需要重试
      if (account.status === TaskStatus.DONE) {
        this.resetRetryCount(accountMail);
        return;
      }

      // 判断是手动关闭还是程序关闭
      // 在 Windows 平台上，isClosing 可能不准确，需要结合状态判断
      // 如果状态是 PROCESSING 且 isClosing 为 false，可能是手动关闭
      // 如果状态是 ERROR 或 NONE，且 isClosing 为 false，可能是程序关闭
      // 如果 isClosing 为 true，肯定是程序关闭
      const actualIsManualClose = !isClosing && account.status === TaskStatus.PROCESSING;

      if (actualIsManualClose) {
        // 手动关闭：重置状态和重试计数
        account.status = TaskStatus.NONE;
        account.statusText = '手动停止';
        await repo.save(account);
        this.resetRetryCount(accountMail);
        console.log(`[TaskQueue] 手动关闭窗口，账号: ${accountMail}`);
      } else {
        // 程序关闭：处理重试逻辑
        account.status = TaskStatus.ERROR;
        await repo.save(account);

        // 增加重试次数
        this.incrementRetryCount(accountMail);
        const retryCount = this.getRetryCount(accountMail);

        console.log(
          `[TaskQueue] 窗口关闭（程序关闭），账号: ${accountMail}, 重试次数: ${retryCount}/${this.maxRetryCount}`,
        );

        if (retryCount <= this.maxRetryCount) {
          // 可以重试：重置状态为 NONE 并添加到队列
          account.status = TaskStatus.NONE;
          await repo.save(account);
          console.log(
            `[TaskQueue] 准备重试任务，账号: ${accountMail}, 重试次数: ${retryCount}/${this.maxRetryCount}`,
          );
          // 确保任务已从 runningTasks 中删除后再添加
          this.addTasks([account]);
        } else {
          // 超过最大重试次数：重置重试计数，保持 ERROR 状态
          console.log(
            `[TaskQueue] 账号 ${accountMail} 重试次数 ${retryCount} 已超过最大重试次数 ${this.maxRetryCount}，停止重试`,
          );
          this.resetRetryCount(accountMail);
          // 确保状态保持为 ERROR
          if (account.status !== TaskStatus.ERROR) {
            account.status = TaskStatus.ERROR;
            await repo.save(account);
          }
        }
      }
    } catch (error) {
      console.error(`[TaskQueue] 处理窗口关闭失败:`, error);
      // 出错时也重置重试计数，防止无限重试
      this.resetRetryCount(accountMail);
    }
  }

  // ==================== 窗口关闭请求 ====================
  public async requestCloseWindow(
    accountMail: string,
    shouldCountRetry: boolean,
  ): Promise<void> {
    if (!accountMail) return;

    const taskInfo = this.runningTasks.get(accountMail);
    if (!taskInfo || taskInfo.window.isDestroyed() || taskInfo.isClosing) {
      return;
    }

    taskInfo.isClosing = true;

    if (AppDataSource.isInitialized) {
      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const account = await repo.findOne({ where: { mail: accountMail } });

        if (account?.status === TaskStatus.DONE) {
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

  // ==================== 工具方法 ====================
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

  private cleanupTaskInfo(taskInfo?: TaskWindowInfo): void {
    if (!taskInfo) return;
    if (taskInfo.timeoutTimer) clearTimeout(taskInfo.timeoutTimer);
    if (taskInfo.statusCheckInterval) clearInterval(taskInfo.statusCheckInterval);
    if (taskInfo.aboutBlankTimer) clearTimeout(taskInfo.aboutBlankTimer);
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
        // 注意：不要在这里重置重试计数，让 handleWindowClosed 处理
      }
    }
    for (const accountMail of toDelete) {
      this.runningTasks.delete(accountMail);
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

  // ==================== 公共查询方法 ====================
  public getAccountMailByWindowId(windowId: number): string | undefined {
    return this.windowToAccountMap.get(windowId);
  }

  public isWindowOpen(accountMail: string): boolean {
    const taskInfo = this.runningTasks.get(accountMail);
    return taskInfo !== undefined && !taskInfo.window.isDestroyed();
  }

  public getOpenWindowAccounts(): string[] {
    return Array.from(this.runningTasks.entries())
      .filter(([, taskInfo]) => !taskInfo.window.isDestroyed())
      .map(([accountMail]) => accountMail);
  }

  public cleanupClosedWindow(accountMail: string): void {
    const taskInfo = this.runningTasks.get(accountMail);
    if (taskInfo?.window.isDestroyed()) {
      this.cleanupTaskInfo(taskInfo);
      this.runningTasks.delete(accountMail);
      const windowId = taskInfo.window.id;
      if (this.windowToAccountMap.has(windowId)) {
        this.windowToAccountMap.delete(windowId);
      }
      this.resetRetryCount(accountMail);
    }
  }

  // ==================== 停止任务 ====================
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

      const index = this.taskQueue.findIndex((acc) => acc.mail === accountMail);
      if (index !== -1) {
        this.taskQueue.splice(index, 1);
      }
    }

    if (AppDataSource.isInitialized && accountsToReset.length > 0) {
      await this.resetTasksStatus(accountsToReset, '手动停止');
    }

    this.recalculateWindowPositions();
    return stoppedCount;
  }

  // ==================== 状态重置 ====================
  public async resetAllRunningTasksStatus(): Promise<void> {
    const accountMails = Array.from(this.runningTasks.values()).map(
      (taskInfo) => taskInfo.account.mail,
    );

    if (AppDataSource.isInitialized && accountMails.length > 0) {
      await this.resetTasksStatus(accountMails);
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

  private async resetTasksStatus(
    accountMails: string[],
    statusText?: string,
  ): Promise<void> {
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

  // ==================== 状态查询 ====================
  public getQueueStatus() {
    const actualRunningCount = Array.from(this.runningTasks.values()).filter(
      (taskInfo) => !taskInfo.window.isDestroyed() && !taskInfo.isClosing,
    ).length;

    return {
      queueLength: this.taskQueue.length,
      runningCount: actualRunningCount,
      maxConcurrency: this.maxConcurrency,
      isProcessing: this.isProcessing,
    };
  }
}

