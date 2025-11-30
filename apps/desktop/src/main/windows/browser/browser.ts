import { globalEnv } from "@/global/global-env";
import { globalMainPathParser } from "@/global/global-main-path-parser";
import { app, BrowserWindow, WebContentsView } from 'electron';
import os from 'os';
import { mainWindow } from "../app/app";

const macUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.88 Safari/537.36`;
const windowUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0`;

const UA = os.platform() === 'darwin' ? macUA : windowUA;
app.userAgentFallback = UA;
app.commandLine.appendArgument('lang=zh-CN');

// 窗口管理器 - 统一管理所有窗口配置和事件
class WindowManager {
  private static instance: WindowManager;
  private childWindows: Map<number, BrowserWindow> = new Map();
  private defaultWebPreferences: Electron.WebPreferences;

  private constructor() {
    this.defaultWebPreferences = {
      spellcheck: false,
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      preload: globalMainPathParser.resolvePreload('browser.cjs').toString(),
      partition: 'persist:encommerce',
      nodeIntegrationInSubFrames: true,
    };
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager();
    }
    return WindowManager.instance;
  }

  // 创建子窗口 - 继承父配置并设置窗口开启处理器
  public createChildWindow(url: string, parentBounds?: Electron.Rectangle): BrowserWindow {
    const bounds = parentBounds || mainWindow.win.getBounds();

    const childWindow = new BrowserWindow({
      width: Math.max(1200, bounds.width - 100),
      height: Math.max(800, bounds.height - 100),
      x: bounds.x + 50,
      y: bounds.y + 50,
      minWidth: 800,
      minHeight: 600,
      show: false,
      webPreferences: {
        ...this.defaultWebPreferences,
      }
    });

    // 为每个子窗口设置 windowOpenHandler - 解决嵌套问题
    this.setupWindowOpenHandler(childWindow);

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
  private setupWindowOpenHandler(window: BrowserWindow) {
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
  private setupChildWindowEvents(childWindow: BrowserWindow) {
    // 窗口关闭时清理引用
    childWindow.on('closed', () => {
      this.childWindows.delete(childWindow.id);
      console.log(`Child window ${childWindow.id} closed, remaining: ${this.childWindows.size}`);
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
  private setupAdditionalEvents(window: BrowserWindow) {
    // 防止 webview 附加
    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // 开发模式下打开开发工具
    if (globalEnv.isDev) {
      window.webContents.openDevTools();
    }

    // 可以添加更多继承的事件监听
    // 比如网络请求拦截、权限处理等
    this.setupRequestInterception(window);
  }

  // 网络请求拦截 - 可以继承父窗口的拦截规则
  private setupRequestInterception(window: BrowserWindow) {
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
      }
    );

    window.webContents.session.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const { responseHeaders } = detail;
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['content-security-policy-report-only'];
        callback({ responseHeaders });
      }
    );
  }

  // 获取所有子窗口
  public getChildWindows(): BrowserWindow[] {
    return Array.from(this.childWindows.values()).filter(win => !win.isDestroyed());
  }

  // 关闭所有子窗口
  public closeAllChildWindows() {
    this.childWindows.forEach(window => {
      if (!window.isDestroyed()) {
        window.close();
      }
    });
    this.childWindows.clear();
  }

  // 获取默认 webPreferences（供其他地方使用）
  public getDefaultWebPreferences(): Electron.WebPreferences {
    return { ...this.defaultWebPreferences };
  }
}

// 导出窗口管理器
export { WindowManager };

// 重构后的 BrowserinternetView 类
export class BrowserinternetView {
  public win: WebContentsView | null = null;
  private _clearStorageTimer: any;
  private _loopTimer: any = null;
  private _loopReloadTimer: any = null;

  public async createWindow(isShow: boolean = true) {
    const url = 'about:blank';
    if (this.win && this.win.webContents && !this.win.webContents.isDestroyed()) {
      return;
    }

    const webPreferences = WindowManager.getInstance().getDefaultWebPreferences();

    this.win = new WebContentsView({ webPreferences });
    mainWindow.win.contentView.addChildView(this.win);
    this.win.webContents.setBackgroundThrottling(false);
    console.log('已成功创建 浏览器 窗口!');

    this.followResize(isShow);
    this.win.webContents.loadURL(url);
    this.win.webContents.setAudioMuted(true);

    if (globalEnv.isDev) {
      this.win.webContents.openDevTools();
    }

    // 设置窗口开启处理器 - 使用窗口管理器
    this.setupWindowOpenHandler();

    // 设置事件监听
    this.setupEventListeners();

    // 设置网络拦截
    this.interceptRequest();
  }

  // 使用窗口管理器处理窗口开启
  private setupWindowOpenHandler() {
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
  private setupEventListeners() {
    if (!this.win) return;

    // 防止 webview 附加
    this.win.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    // 窗口大小变化监听
    mainWindow.win.addListener('resize', () => this.followResize(this.currentShowStatus()));

    // 窗口关闭监听
    mainWindow.win.addListener('close', () => {
      this.stopTask();
    });
  }

  private followResize(isShow: boolean = true, x: number = 0, y: number = 0) {
    if (!this.win || !this.win.webContents) return;

    const bounds = mainWindow.win.getBounds();

    this.win.setVisible(isShow);

    if (isShow) {
      this.win.setBounds({
        x: x + 80,
        y: 28,
        width: bounds.width - 80,
        height: bounds.height
      });
    }
  }

  private interceptRequest() {
    if (!this.win) return;

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
      }
    );

    this.win.webContents.session.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'] },
      (detail, callback) => {
        const { responseHeaders } = detail;
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['content-security-policy-report-only'];
        callback({ responseHeaders });
      }
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
    if (this.win && this.isRunning() && this.win.webContents && !this.win.webContents.isDestroyed()) {
      try {
        this.followResize(false);
        return true;
      } catch (error) {
        console.error("浏览器隐藏窗口失败:", error);
      }
    } else {
      console.log("浏览器窗口不存在或未运行");
    }
    return false;
  }

  public showWindow(): boolean {
    if (this.win && this.isRunning() && this.win.webContents && !this.win.webContents.isDestroyed()) {
      try {
        this.followResize();
        return true;
      } catch (error) {
        console.error("显示TK窗口失败:", error);
      }
    } else {
      this.createWindow(true);
    }
    return true;
  }

  private _startLoopClearStorage() {
    this._clearStorageTimer = setInterval(async () => {
      if (this.win && !this.win.webContents?.isDestroyed()) {
        try {
          const isLogined = await this.win.webContents.executeJavaScript('typeof isLogined === "function" ? isLogined() : false');
          console.log("🚀 ~ isLogined:", isLogined);

          if (isLogined) return;

          await this.win.webContents.session.clearStorageData({
            storages: ['cookies', 'localstorage', 'shadercache', 'cachestorage'],
            quotas: ['temporary', 'syncable']
          });

          console.log('定期清理：所有存储数据已清除');
        } catch (error) {
          console.error('清理存储数据时出错:', error);
        }
      }
    }, 30 * 1000);
  }

  public async startTask() {
    if (this.isRunning()) return;
    this.createWindow(false);
    // this._startLoopClearStorage();
  }

  public stopTask() {
    // 清理定时器
    clearInterval(this._loopTimer);
    clearInterval(this._clearStorageTimer);
    clearInterval(this._loopReloadTimer);

    // 关闭所有子窗口
    WindowManager.getInstance().closeAllChildWindows();

    // 清理主视图
    if (this.win && this.win.webContents) {
      this.win.webContents.close();
      mainWindow.win.contentView.removeChildView(this.win);
      this.win = null;
    }

    console.log("停止 TIKTOK 窗口任务");
  }

  // 新增方法：获取所有子窗口
  public getChildWindows(): BrowserWindow[] {
    return WindowManager.getInstance().getChildWindows();
  }

  // 新增方法：关闭所有子窗口
  public closeAllChildWindows() {
    WindowManager.getInstance().closeAllChildWindows();
  }
}

// 工具函数：创建统一配置的窗口
export function createConfiguredWindow(options: Partial<Electron.BrowserWindowConstructorOptions> = {}): BrowserWindow {
  const windowManager = WindowManager.getInstance();
  const defaultWebPreferences = windowManager.getDefaultWebPreferences();

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      ...defaultWebPreferences,
      ...options.webPreferences
    },
    ...options
  });

  // 应用统一的窗口配置
  WindowManager.getInstance()['setupWindowOpenHandler'](window);
  WindowManager.getInstance()['setupAdditionalEvents'](window);

  return window;
}

export const browserinternetView = new BrowserinternetView();

// 导出DetachWindow相关功能
export { createDetachWindow, DetachWindow, openDetachWindow, type DetachWindowOptions } from './detach-window';

