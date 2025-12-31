import { ipcMain } from 'electron';
import { registerGetMail2FAHandler } from './email-verification';
import { registerAccountManagementHandlers } from './account-management';
import { registerTaskManagementHandlers } from './task-management';
import { registerCaptchaSolverHandlers } from './captcha-solver';
import { registerTaskQueueHandlers } from './task-queue';
import { registerBrowserWindowHandlers } from './browser-window';
import { registerProxyPoolHandlers } from './proxy-pool';
import { registerCaptchaConfigHandlers } from './captcha-config';

/**
 * 注册所有 Pokemon Center 相关的 IPC 处理器
 */
export function registerPokemonCenterHandlers() {
  registerGetMail2FAHandler(ipcMain);
  registerAccountManagementHandlers(ipcMain);
  registerTaskManagementHandlers(ipcMain);
  registerCaptchaSolverHandlers(ipcMain);
  registerTaskQueueHandlers(ipcMain);
  registerBrowserWindowHandlers(ipcMain);
  registerProxyPoolHandlers(ipcMain);
  registerCaptchaConfigHandlers(ipcMain);
}

