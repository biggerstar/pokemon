import { globalEnv } from "@/global/global-env";
import { BaseHashRouterBrowserWindowOptions } from "@/main/interface";
import {
  gotoHashRouter,
  type GoToUrlCustomOptions,
} from "@/main/interface/window/apis";
import { setupWindowOptions } from "@/main/interface/window/base/setup-window-options";
import { attachTitlebarToWindow } from "custom-electron-titlebar/main";
import { BrowserWindow, shell } from 'electron';


function patchWindowBehavior(win: BrowserWindow, windowOptions: BaseHashRouterBrowserWindowOptions) {
  const autoShow = 'autoShow' in windowOptions ? windowOptions.autoShow : false;

  if (autoShow) {
    win.once('ready-to-show', () => {
      if (windowOptions.delayShowTime) setTimeout(() => win && win.show(), windowOptions.delayShowTime);
      else win?.show();
    });
  }

  // 使用浏览器而不是应用程序打开所有链接
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https:')) shell.openExternal(url).then();
    return {action: 'deny'};
  });

  win.on('close', (event) => {
    if (!globalEnv.isDev) {
      // 发布后版本阻止窗口关闭，隐藏到托盘
      if (windowOptions.hideOnClose) {
        event.preventDefault();
        win?.hide();
      }
    }
  });

  // 如果应用未打包，则打开 devTool
  windowOptions.openDevTools && globalEnv.isDev && win.webContents.openDevTools({mode: 'detach'});
}


export class BaseHashRouterBrowserWindow extends BrowserWindow {
  constructor(windowOptions: BaseHashRouterBrowserWindowOptions = {}) {
    super(setupWindowOptions(windowOptions));

    patchWindowBehavior(this, windowOptions)

    attachTitlebarToWindow(this);
  }

  public gotoHashRouter: (options: GoToUrlCustomOptions) => Promise<void> = gotoHashRouter
}

