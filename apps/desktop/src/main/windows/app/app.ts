import { BaseHashRouterBrowserWindow } from "@/main/interface";
import { BaseApplication } from "@/main/windows/app/base-application";
import { screen } from "electron";
import os from 'node:os';
import process from "node:process";

export class MainWindow extends BaseApplication<BaseHashRouterBrowserWindow> {
  /** 主窗口对象引用 */
  public win: BaseHashRouterBrowserWindow | null = null;
  private loadingWindow: BaseHashRouterBrowserWindow | null = null;
  public DEFAULT_MAIN_WINDOW_WIDTH = 1600;
  public DEFAULT_MAIN_WINDOW_HEIGHT = 900;
  private readonly MIN_WINDOW_WIDTH = 800;
  private readonly MIN_WINDOW_HEIGHT = 600;
  private __nextResetDefaultWindowSize = true;

  /**
   * 根据屏幕尺寸计算窗口大小
   * 宽度占用屏幕的 80%，高度占用屏幕的 75%
   */
  private calculateWindowSize(): { width: number; height: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    
    const calculatedWidth = Math.floor(screenWidth * 0.8);
    const calculatedHeight = Math.floor(screenHeight * 0.75);
    
    // 确保计算出的尺寸不小于最小尺寸
    const width = Math.max(calculatedWidth, this.MIN_WINDOW_WIDTH);
    const height = Math.max(calculatedHeight, this.MIN_WINDOW_HEIGHT);
    
    return { width, height };
  }

  public async createMainWindow() {
    const { width, height } = this.calculateWindowSize();
    
    this.win = new BaseHashRouterBrowserWindow({
      title: 'Main Window',
      frame: false,
      width,
      height,
      minWidth: this.MIN_WINDOW_WIDTH,
      minHeight: this.MIN_WINDOW_HEIGHT,
      titleBarStyle: 'hidden',
      titleBarOverlay: true,
      show: false,
      webPreferences: {
        sandbox: false,
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: false,
      },
      autoShow: true,
      preloadCjsName: 'main',
    });
    this.win.webContents.setBackgroundThrottling(false)
    // this.win.gotoHashRouter({hash: '/'}).then();
    this.win.gotoHashRouter({ hash: '/pokemoncenter' }).then();
    // this.win.webContents.openDevTools({ mode: 'right' })
    console.log(os.arch(), process.arch);
    this.win.webContents.on('did-navigate-in-page', (_, url) => {
      const urlInfo = new URL(url);
      // console.log(urlInfo)
      if (urlInfo.hash.startsWith('#/auth/')) this.loadLoginWindow();
      else this.loadDefaultWindow();
    });

    this.win.once('ready-to-show', () => {
      this.loadingWindow?.destroy();
      this.loadingWindow = null;
    });

    this.initInterceptRequest();
  }

  public loadDefaultWindow() {
    if (!this.win) return;

    if (this.__nextResetDefaultWindowSize) {
      const { width, height } = this.calculateWindowSize();
      this.win.setMinimumSize(this.MIN_WINDOW_WIDTH, this.MIN_WINDOW_HEIGHT);
      this.win.setSize(width, height);
      this.win.setResizable(true);
      this.win.setMaximizable(true);
      this.win.center();
      this.__nextResetDefaultWindowSize = false;
    }
  }

  public loadLoginWindow() {
    if (!this.win) return;
    this.win.setMinimumSize(400, 420);
    this.win.setSize(400, 420);
    this.win.setResizable(false);
    this.win.setMaximizable(false);
    this.win.center();
    this.__nextResetDefaultWindowSize = true;
  }

  private initInterceptRequest() {
    if (!this.win) return;

    this.win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      // delete details.requestHeaders['Referer'];
      callback({ requestHeaders: details.requestHeaders });
    });
  }
}

export const mainWindow = new MainWindow();
