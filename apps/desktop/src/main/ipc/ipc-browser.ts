import { globalEnv } from "@/global/global-env";
import { ipcMain } from "electron";
import { browserinternetView } from "../windows/browser/browser";
import { openDetachWindow } from "../windows/browser/detach-window";

ipcMain.handle('show-window', () => {
  browserinternetView.showWindow();
})

ipcMain.handle('hide-window', () => {
  browserinternetView.hideWindow();
})

ipcMain.handle('is-window-show', () => {
  return browserinternetView.currentShowStatus();
})

ipcMain.handle('load-url', (_, url) => {
  if (browserinternetView.isRunning()) {
    browserinternetView.win.webContents.loadURL(url);
  }
})

ipcMain.handle('get-current-url', (_, url) => {
  if (browserinternetView.isRunning()) {
    return browserinternetView.win.webContents.getURL()
  }
  return undefined
})

ipcMain.handle('open-browser-window', (_, url: string, show: boolean = false) => {
  console.log('打开浏览器窗口:', url, '显示:', show);
  try {
    // 使用DetachWindow创建新窗口，传入show参数
    const childWindow = openDetachWindow(url, '预登录窗口', show);
    
    return { success: true, windowId: childWindow.id };
  } catch (error) {
    console.error('创建浏览器窗口失败:', error);
    return { success: false, error: error.message };
  }
})

// 判断是否为开发环境
ipcMain.handle('is-dev', () => {
  return globalEnv.isDev;
})
