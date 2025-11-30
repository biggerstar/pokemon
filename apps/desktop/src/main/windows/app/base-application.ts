import { globalEnv } from "@/global/global-env";
import { app, BrowserWindow, globalShortcut, powerSaveBlocker } from "electron";
import os from "node:os";
import process from "node:process";

export abstract class BaseApplication<WindowType extends BrowserWindow> {
  public abstract createMainWindow(): Promise<void>;

  public abstract win: WindowType | null;

  public initApplication() {
    if (!app.requestSingleInstanceLock()) { // 当前程序是否取得单例锁，防止多个实例启动，取不到直接退出程序
      app.quit();
      process.exit(0);
    }

    globalEnv.disableSecurityWarnings();

    powerSaveBlocker.start('prevent-app-suspension') // 阻止进入休眠

    // 禁用 Windows 7 的 GPU 加速
    if (os.release().startsWith('6.1')) app.disableHardwareAcceleration();

    // 为Windows 10+通知设置应用程序名称
    if (process.platform === 'win32') app.setAppUserModelId(app.getName());
  }

  public initAppWindow() {
    app.whenReady().then(() => this.createMainWindow());

    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
    })

    app.on('window-all-closed', async () => {
      this.win = null;
      // if (process.platform !== 'darwin') 
      app.quit();
    });

    app.on('second-instance', () => {
      if (this.win && !this.win.isDestroyed()) {
        // 如果用户试图打开另一个窗口，则专注于主窗口
        if (this.win.isMinimized()) this.win.restore();
        this.win.focus();
      }
    });

    app.on('activate', () => {
      if (this.win && !this.win.isDestroyed()) {
        this.win.show();
        this.win.focus();
      } else {
        this.createMainWindow().then();
      }
    });
  }
}
