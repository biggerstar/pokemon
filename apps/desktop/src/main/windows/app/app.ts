import { BaseHashRouterBrowserWindow } from "@/main/interface";
import { BaseApplication } from "@/main/windows/app/base-application";
import os from 'node:os';
import process from "node:process";

export class MainWindow extends BaseApplication<BaseHashRouterBrowserWindow> {
  /** 主窗口对象引用 */
  public win: BaseHashRouterBrowserWindow | null = null;
  private loadingWindow: BaseHashRouterBrowserWindow | null = null;
  public DEFAULT_MAIN_WINDOW_WIDTH = 1600;
  public DEFAULT_MAIN_WINDOW_HEIGHT = 900;
  private __nextResetDefaultWindowSize = true;

  public async createMainWindow() {
    this.win = new BaseHashRouterBrowserWindow({
      title: 'Main Window',
      frame: false,
      width: this.DEFAULT_MAIN_WINDOW_WIDTH,
      height: this.DEFAULT_MAIN_WINDOW_HEIGHT,
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
      this.win.setMinimumSize(this.DEFAULT_MAIN_WINDOW_WIDTH, this.DEFAULT_MAIN_WINDOW_HEIGHT);
      this.win.setSize(this.DEFAULT_MAIN_WINDOW_WIDTH, this.DEFAULT_MAIN_WINDOW_HEIGHT);
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
