import { globalMainPathParser } from '@/global/global-main-path-parser';
import { BrowserWindow } from 'electron';
import { WindowManager } from './browser';

export interface DetachWindowOptions {
  url: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  title?: string;
  preload?: string;
  show?: boolean; // 是否显示窗口
}

export class DetachWindow {
  private window: BrowserWindow | null = null;
  private windowId: number | null = null;

  constructor(private options: DetachWindowOptions) {
    this.options = {
      width: 1200,
      height: 800,
      ...options
    };
  }

  public create(): BrowserWindow {
    // 如果窗口已存在且未销毁，则先关闭它
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }

    // 创建新窗口配置
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: this.options.width,
      height: this.options.height,
      x: this.options.x,
      y: this.options.y,
      minWidth: 800,
      minHeight: 600,
      show: this.options.show ?? false, // 使用传入的show参数，默认为false
      title: this.options.title || '浏览器窗口',
      webPreferences: {
        spellcheck: false,
        sandbox: false,
        nodeIntegration: true,
        contextIsolation: false,
        preload: this.options.preload || globalMainPathParser.resolvePreload('detach-window.cjs').toString(),
        partition: 'persist:encommerce',
        nodeIntegrationInSubFrames: true,
      }
    };

    // 创建窗口
    this.window = new BrowserWindow(windowOptions);
    this.windowId = this.window.id;
    this.window.webContents.openDevTools({ mode: 'right' });
    // 设置窗口事件
    this.setupWindowEvents();

    // 加载URL
    this.window.loadURL(this.options.url);

    // 根据show参数决定是否显示窗口
    if (this.options.show ?? false) {
      this.window.once('ready-to-show', () => {
        this.window?.show();
      });
    }

    console.log(`创建独立窗口成功: ${this.options.url}, 窗口ID: ${this.windowId}, 显示: ${this.options.show ?? false}`);

    return this.window;
  }

  private setupWindowEvents(): void {
    if (!this.window) return;

    // 窗口关闭事件
    this.window.on('closed', () => {
      console.log(`独立窗口关闭: ${this.windowId}`);
      this.window = null;
      this.windowId = null;
    });

    // 使用窗口管理器的配置
    const windowManager = WindowManager.getInstance();

    // 设置窗口打开处理器
    (windowManager as any)['setupWindowOpenHandler'](this.window);

    // 设置额外事件监听
    (windowManager as any)['setupAdditionalEvents'](this.window);
  }

  public getWindow(): BrowserWindow | null {
    return this.window;
  }

  public getWindowId(): number | null {
    return this.windowId;
  }

  public isAlive(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  public close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public loadURL(url: string): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.loadURL(url);
    }
  }

  public getURL(): string | null {
    if (this.window && !this.window.isDestroyed()) {
      return this.window.webContents.getURL();
    }
    return null;
  }
}

// 创建独立窗口的工厂函数
export function createDetachWindow(options: DetachWindowOptions): DetachWindow {
  return new DetachWindow(options);
}

// 简化的窗口创建函数
export function openDetachWindow(url: string, title?: string, show: boolean = false): BrowserWindow {
  const detachWindow = createDetachWindow({
    url,
    title: title || '新窗口',
    show,
  });

  return detachWindow.create();
}
