import { globalMainPathParser } from '@/global/global-main-path-parser';
import { BrowserWindow, WebContentsView } from 'electron';
import { mainWindow } from '../../app/app';
import { AccountEntity } from '@/orm/entities/account';
import {
  parseProxyString,
  setupProxyForSession,
  clearProxyForSession,
  proxyInfoMap,
  loginEventListeners,
  setupPermanentCookieInterceptor,
} from './common';

// 窗口管理器 - 统一管理所有窗口配置和事件
export class WindowManager {
  private static instance: WindowManager;
  private childWindows: Map<number, BrowserWindow> = new Map();
  private currentAccount: AccountEntity | null = null;

  private constructor() {
    // 构造函数不再设置默认 webPreferences，因为需要根据账号动态设置
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  // 设置当前账号
  public setAccount(account: AccountEntity | null): void {
    this.currentAccount = account;
  }

  // 获取当前账号
  public getAccount(): AccountEntity | null {
    return this.currentAccount;
  }

  // 根据账号获取 partition
  private getPartition(account: AccountEntity | null): string {
    if (!account || !account.data?.loginId) {
      return 'persist:pokemoncenter-default';
    }
    return `persist:pokemoncenter-${account.data.loginId}`;
  }

  // 获取 webPreferences（根据当前账号动态生成）
  private getWebPreferences(): Electron.WebPreferences {
    const partition = this.getPartition(this.currentAccount);
    return {
      webSecurity: false,
      spellcheck: false,
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      preload: globalMainPathParser.resolvePreload('browser.cjs').toString(),
      partition: partition,
      // nodeIntegrationInSubFrames: true,
    };
  }

  // 创建子窗口 - 继承父配置并设置窗口开启处理器
  public createChildWindow(
    url: string,
    parentBounds?: Electron.Rectangle,
  ): BrowserWindow {
    const bounds = parentBounds || mainWindow.win.getBounds();

    const childWindow = new BrowserWindow({
      width: Math.max(1200, bounds.width - 100),
      height: Math.max(800, bounds.height - 100),
      x: bounds.x + 50,
      y: bounds.y + 50,
      minWidth: 800,
      minHeight: 600,
      show: false,
      webPreferences: this.getWebPreferences(),
    });

    // 为每个子窗口设置 windowOpenHandler - 解决嵌套问题
    this.setupWindowOpenHandler(childWindow);

    const proxyInfo = this.currentAccount?.data?.proxy
      ? parseProxyString(this.currentAccount.data.proxy)
      : null;
    const sessionKey = `child-window-${childWindow.id}`;
    setupProxyForSession(
      childWindow.webContents.session,
      proxyInfo,
      sessionKey,
      childWindow.webContents,
    );
    setupPermanentCookieInterceptor(childWindow.webContents.session);

    // 设置父子关系和事件监听
    this.setupChildWindowEvents(childWindow);

    // 加载 URL
    childWindow.loadURL(url);

    // 准备好后显示
    childWindow.once('ready-to-show', () => {
      childWindow.show();
    });

    // 保存引用
    this.childWindows.set(childWindow.id, childWindow);

    return childWindow;
  }

  // 为窗口设置 windowOpenHandler - 支持无限嵌套
  public setupWindowOpenHandler(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler((details) => {
      const { url, disposition } = details;

      console.log(`Window ${window.id} opening:`, { url, disposition });

      if (disposition === 'new-window') {
        // 递归创建子窗口，传递当前窗口的边界
        const currentBounds = window.getBounds();
        this.createChildWindow(url, currentBounds);

        return { action: 'deny' }; // 阻止默认行为，使用我们的自定义窗口
      }

      // 在当前窗口中打开
      window.webContents.loadURL(url);
      return { action: 'deny' };
    });
  }

  // 设置子窗口事件监听
  private setupChildWindowEvents(childWindow: BrowserWindow): void {
    // 窗口关闭时清理引用和代理
    childWindow.on('closed', () => {
      const windowId = childWindow.id;
      const sessionKey = `child-window-${windowId}`;
      let webContentsId: number | undefined;

      try {
        if (
          !childWindow.isDestroyed() &&
          !childWindow.webContents.isDestroyed()
        ) {
          webContentsId = childWindow.webContents.id;
          clearProxyForSession(
            childWindow.webContents.session,
            sessionKey,
            childWindow.webContents,
          );
          // 注意：不要在这里调用 destroy()，因为窗口关闭时 webContents 会自动销毁
        }
      } catch (error) {
        // 忽略访问已销毁对象的错误
        console.warn(
          `[WindowManager] 访问子窗口 ${windowId} 的 webContents 时出错:`,
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

      this.childWindows.delete(windowId);
      console.log(
        `Child window ${windowId} closed and destroyed, remaining: ${this.childWindows.size}`,
      );
    });

    // 继承主窗口的一些行为
    mainWindow.win.on('close', () => {
      if (!childWindow.isDestroyed()) {
        childWindow.close();
      }
    });

    // 可以添加更多事件监听
    this.setupAdditionalEvents(childWindow);
  }

  // 设置额外的事件监听 - 继承父窗口行为
  public setupAdditionalEvents(window: BrowserWindow): void {
    // 防止 webview 附加
    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // 可以添加更多继承的事件监听
    // 比如网络请求拦截、权限处理等
    // this.setupRequestInterception(window);
  }

  // 网络请求拦截 - 可以继承父窗口的拦截规则
  private setupRequestInterception(window: BrowserWindow): void {
    window.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const blackList = ['/stream'];

        for (const urlPart of blackList) {
          if (detail.url.includes(urlPart)) {
            callback({ cancel: true });
            return;
          }
        }
        callback({});
      },
    );

    window.webContents.session.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const { responseHeaders } = detail;
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['content-security-policy-report-only'];
        callback({ responseHeaders });
      },
    );
  }

  // 获取所有子窗口
  public getChildWindows(): BrowserWindow[] {
    return Array.from(this.childWindows.values()).filter(
      (win) => !win.isDestroyed(),
    );
  }

  // 关闭所有子窗口
  public closeAllChildWindows(): void {
    this.childWindows.forEach((window) => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    this.childWindows.clear();
  }

  // 获取默认 webPreferences（供其他地方使用）
  public getDefaultWebPreferences(): Electron.WebPreferences {
    return this.getWebPreferences();
  }
}

// 重构后的 BrowserinternetView 类
export class BrowserinternetView {
  public win: WebContentsView | null = null;
  private _loopTimer: any = null;
  private _loopReloadTimer: any = null;

  public async createWindow(isShow: boolean = true): Promise<void> {
    const url = 'about:blank';

    // 如果窗口存在且未销毁，先清理旧的代理和引用
    if (this.win && this.win.webContents) {
      if (!this.win.webContents.isDestroyed()) {
        // 窗口还存在，直接返回
        return;
      } else {
        // 窗口已销毁，清理旧的代理设置
        const oldSessionKey = `browser-view-${this.win.webContents.id}`;
        clearProxyForSession(
          this.win.webContents.session,
          oldSessionKey,
          this.win.webContents,
        );
        // 从父视图中移除
        try {
          mainWindow.win.contentView.removeChildView(this.win);
        } catch (error) {
          // 忽略移除失败的错误
        }
        this.win = null;
      }
    }

    const webPreferences = WindowManager.getInstance().getDefaultWebPreferences();

    this.win = new WebContentsView({ webPreferences });
    mainWindow.win.contentView.addChildView(this.win);
    this.win.webContents.setBackgroundThrottling(false);
    console.log('已成功创建 浏览器 窗口!');

    this.followResize(isShow);
    this.win.webContents.loadURL(url);
    this.win.webContents.setAudioMuted(true);

    const currentAccount = WindowManager.getInstance().getAccount();
    const proxyInfo = currentAccount?.data?.proxy
      ? parseProxyString(currentAccount.data.proxy)
      : null;
    const sessionKey = `browser-view-${this.win.webContents.id}`;
    setupProxyForSession(
      this.win.webContents.session,
      proxyInfo,
      sessionKey,
      this.win.webContents,
    );
    setupPermanentCookieInterceptor(this.win.webContents.session);

    // 设置窗口开启处理器 - 使用窗口管理器
    this.setupWindowOpenHandler();

    // 设置事件监听
    this.setupEventListeners();

    // 设置网络拦截
    // this.interceptRequest();
  }

  // 使用窗口管理器处理窗口开启
  private setupWindowOpenHandler(): void {
    if (!this.win) return;

    this.win.webContents.setWindowOpenHandler((details) => {
      const { url, disposition } = details;

      console.log('WebContentsView opening:', { url, disposition });

      if (disposition === 'new-window') {
        // 使用窗口管理器创建新窗口
        WindowManager.getInstance().createChildWindow(url);
        return { action: 'deny' };
      }

      // 在当前 view 中打开
      this.win!.webContents.loadURL(url);
      return { action: 'deny' };
    });
  }

  // 设置事件监听器
  private setupEventListeners(): void {
    if (!this.win) return;

    // 防止 webview 附加
    this.win.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // 监听渲染进程崩溃
    this.win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Browser] 渲染进程崩溃:', details.reason, details.exitCode);
    });

    // 监听销毁事件
    this.win.webContents.on('destroyed', () => {
      console.log('[Browser] WebContents 被销毁');
    });

    // 监听页面导航
    this.win.webContents.on('did-navigate', (_event, url) => {
      console.log('[Browser] 页面导航到:', url);
    });

    // 窗口大小变化监听
    mainWindow.win.addListener('resize', () =>
      this.followResize(this.currentShowStatus()),
    );

    // 窗口关闭监听
    mainWindow.win.addListener('close', () => {
      this.stopTask();
    });
  }

  private followResize(isShow: boolean = true, x: number = 0, y: number = 0): void {
    if (!this.win || !this.win.webContents) return;

    const bounds = mainWindow.win.getBounds();

    this.win.setVisible(isShow);

    if (isShow) {
      this.win.setBounds({
        x: x + 80,
        y: 28,
        width: bounds.width - 80,
        height: bounds.height,
      });
    }
  }

  private interceptRequest(): void {
    if (!this.win) return;

    this.win.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const { requestHeaders } = detail;
        const whiteList = [
          'ksl6nwtyby-a',
          'ksl6nwtyby-a0',
          'ksl6nwtyby-b',
          'ksl6nwtyby-c',
          'ksl6nwtyby-d',
          'ksl6nwtyby-f',
          'ksl6nwtyby-z',
        ];
        for (const key in requestHeaders) {
          if (whiteList.includes(key.toLowerCase())) {
            console.log('白名单:', key);
            continue;
          }
          if (key.toLowerCase().includes('ksl6nwtyby')) {
            console.log('删除:', key);
            delete requestHeaders[key];
          }
        }
        callback({ requestHeaders });
      },
    );

    this.win.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const blackList = ['/stream'];

        for (const urlPart of blackList) {
          if (detail.url.includes(urlPart)) {
            callback({ cancel: true });
            return;
          }
        }
        callback({});
      },
    );

    this.win.webContents.session.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const { responseHeaders } = detail;
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['content-security-policy-report-only'];
        callback({ responseHeaders });
      },
    );
  }

  public isRunning(): boolean {
    if (!this.win) return false;
    return !this.win.webContents?.isDestroyed();
  }

  public currentShowStatus(): boolean {
    if (!this.win) return false;
    if (this.win.webContents && this.win.webContents.isDestroyed()) return false;
    return this.win.getVisible();
  }

  public hideWindow(): boolean {
    if (
      this.win &&
      this.isRunning() &&
      this.win.webContents &&
      !this.win.webContents.isDestroyed()
    ) {
      try {
        this.followResize(false);
        return true;
      } catch (error) {
        console.error('浏览器隐藏窗口失败:', error);
      }
    } else {
      console.log('浏览器窗口不存在或未运行');
    }
    return false;
  }

  public showWindow(): boolean {
    if (
      this.win &&
      this.isRunning() &&
      this.win.webContents &&
      !this.win.webContents.isDestroyed()
    ) {
      try {
        this.followResize();
        return true;
      } catch (error) {
        console.error('显示TK窗口失败:', error);
      }
    } else {
      this.createWindow(true);
    }
    return true;
  }

  public async startTask(): Promise<void> {
    if (this.isRunning()) return;
    this.createWindow(false);
  }

  public stopTask(): void {
    // 清理定时器
    clearInterval(this._loopTimer);
    clearInterval(this._loopReloadTimer);

    // 关闭所有子窗口
    WindowManager.getInstance().closeAllChildWindows();

    // 清理主视图和代理
    if (this.win) {
      let webContentsId: number | undefined;
      let sessionKey: string | undefined;

      try {
        if (this.win.webContents && !this.win.webContents.isDestroyed()) {
          webContentsId = this.win.webContents.id;
          sessionKey = `browser-view-${webContentsId}`;
          clearProxyForSession(
            this.win.webContents.session,
            sessionKey,
            this.win.webContents,
          );
          // 注意：不要在这里调用 destroy()，因为 WebContentsView 关闭时会自动处理
        }
      } catch (error) {
        // 忽略访问已销毁对象的错误
        console.warn('[BrowserinternetView] 访问 webContents 时出错:', error);
      }

      // 清理代理信息和事件监听器（即使 webContents 已销毁）
      if (sessionKey) {
        proxyInfoMap.delete(sessionKey);
      }
      if (webContentsId !== undefined) {
        const listener = loginEventListeners.get(webContentsId);
        if (listener) {
          loginEventListeners.delete(webContentsId);
        }
      }

      try {
        if (this.win && !this.win.webContents?.isDestroyed()) {
          this.win.webContents.close();
        }
        mainWindow.win.contentView.removeChildView(this.win);
      } catch (error) {
        // 忽略移除失败的错误
      }
      this.win = null;
    }

    console.log('停止 TIKTOK 窗口任务');
  }

  // 新增方法：获取所有子窗口
  public getChildWindows(): BrowserWindow[] {
    return WindowManager.getInstance().getChildWindows();
  }

  // 新增方法：关闭所有子窗口
  public closeAllChildWindows(): void {
    WindowManager.getInstance().closeAllChildWindows();
  }
}

// 工具函数：创建统一配置的窗口
export function createConfiguredWindow(
  options: Partial<Electron.BrowserWindowConstructorOptions> = {},
): BrowserWindow {
  const windowManager = WindowManager.getInstance();
  const defaultWebPreferences = windowManager.getDefaultWebPreferences();

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      ...defaultWebPreferences,
      ...options.webPreferences,
    },
    ...options,
  });

  // 应用统一的窗口配置
  windowManager.setupWindowOpenHandler(window);
  windowManager.setupAdditionalEvents(window);

  return window;
}

// 从数据库获取账号并设置到 WindowManager
export async function setAccountForWindowManager(
  accountMail?: string,
): Promise<AccountEntity | null> {
  try {
    const { AppDataSource } = await import('@/orm/data-source');
    if (!AppDataSource.isInitialized) {
      console.error('数据库未初始化');
      return null;
    }

    const { AccountEntity } = await import('@/orm/entities/account');
    const repo = AppDataSource.getRepository(AccountEntity);
    let account: AccountEntity | null = null;

    if (accountMail) {
      account = await repo.findOne({ where: { mail: accountMail } });
    }

    if (account) {
      WindowManager.getInstance().setAccount(account);
      console.log('已设置账号到 WindowManager:', account.mail);

      // 如果账号有代理信息，解析并显示
      if (account.data?.proxy) {
        const proxyInfo = parseProxyString(account.data.proxy);
        if (proxyInfo) {
          console.log('账号代理信息:', {
            host: proxyInfo.host,
            port: proxyInfo.port,
            username: proxyInfo.username,
            password: '***',
          });
        }
      }
    } else {
      console.warn('未找到账号，清除 WindowManager 中的账号设置');
      WindowManager.getInstance().setAccount(null);
    }

    return account;
  } catch (error) {
    console.error('设置账号到 WindowManager 失败:', error);
    return null;
  }
}

export const browserinternetView = new BrowserinternetView();
