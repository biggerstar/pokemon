import { BrowserWindow, ipcMain } from 'electron';

ipcMain.handle('system:open-devtools', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && !window.isDestroyed()) {
    const isOpen = window.webContents.isDevToolsOpened();
    if (isOpen) {
      window.webContents.closeDevTools();
    } else {
      window.webContents.openDevTools({ mode: 'right' });
    }
    return { success: true, isOpen: !isOpen };
  }
  return { success: false, error: '窗口不存在或已销毁' };
});

