import { ipcMain, session, BrowserWindow } from 'electron';
import { AccountEntity } from '@/orm/entities/account';
import { AppDataSource } from '@/orm/data-source';
import { TaskQueueManager } from '@/main/windows/browser/browser';
import { ensureDataSourceReady, getAccountMailFromEvent } from './utils';
import { proxyInfoMap } from '@/main/windows/browser/browser/common';

export function registerBrowserWindowHandlers(ipcMain: typeof import('electron').ipcMain) {
  /**
   * 清除浏览器数据
   * @param accountMails 可选的账号邮箱数组，如果提供则只清除这些账号的浏览器数据，否则清除所有账号的浏览器数据
   */
  ipcMain.handle('clear-browser-data', async (_event, accountMails?: string[]) => {
    await ensureDataSourceReady();

    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      let accounts: AccountEntity[] = [];

      if (accountMails && accountMails.length > 0) {
        // 只清除指定账号的浏览器数据
        accounts = await repo.find({
          where: accountMails.map((mail) => ({ mail })),
        });
      } else {
        // 清除所有账号的浏览器数据
        accounts = await repo.find();
      }

      let clearedCount = 0;
      for (const account of accounts) {
        const loginId = account.data?.loginId;
        if (loginId) {
          const partition = `persist:pokemoncenter-${loginId}`;
          try {
            // 清除浏览器数据
            const targetSession = session.fromPartition(partition);

            await targetSession.clearStorageData({
              storages: [
                'cookies',
                'localstorage',
                'indexdb',
                'websql',
                'cachestorage',
                'shadercache',
                'serviceworkers',
                'filesystem',
              ],
              quotas: ['temporary'],
            });

            await targetSession.clearCache();
            await targetSession.clearHostResolverCache();

            clearedCount++;
            console.log(`[clear-browser-data] 已清除账号 ${account.mail} 的浏览器数据`);
          } catch (error: unknown) {
            const err = error as Error;
            console.error(
              `[clear-browser-data] 清除账号 ${account.mail} 的浏览器数据失败:`,
              err.message
            );
          }
        }
      }

      // 也清除默认的浏览器数据
      try {
        const defaultSession = session.fromPartition('persist:pokemoncenter-default');
        await defaultSession.clearStorageData({
          storages: [
            'cookies',
            'localstorage',
            'indexdb',
            'websql',
            'cachestorage',
            'shadercache',
            'serviceworkers',
            'filesystem',
          ],
          quotas: ['temporary'],
        });
        await defaultSession.clearCache();
        await defaultSession.clearHostResolverCache();
        console.log('[clear-browser-data] 已清除默认浏览器数据');
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[clear-browser-data] 清除默认浏览器数据失败:', err.message);
      }

      return {
        success: true,
        message: `已清除 ${clearedCount} 个账号的浏览器数据`,
        clearedCount,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[clear-browser-data] 清除浏览器数据失败:', error);
      throw new Error(`Failed to clear browser data: ${err.message}`);
    }
  });

  /**
   * 请求关闭任务窗口（安全版本：从 event.sender 自动识别窗口对应的账号）
   * @param shouldCountRetry 是否算作一次重试（默认 true）
   */
  ipcMain.handle(
    'request-close-window',
    async (event: Electron.IpcMainInvokeEvent, shouldCountRetry: boolean = true) => {
      try {
        // 从 event.sender 自动获取账号 mail（安全方式，不依赖前端传递）
        const mail = getAccountMailFromEvent(event);
        if (!mail) {
          throw new Error('无法从窗口识别账号，请确保窗口已正确关联到任务');
        }

        const taskQueue = TaskQueueManager.getInstance();
        await taskQueue.requestCloseWindow(mail, shouldCountRetry);
        return { success: true };
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[request-close-window] 请求关闭窗口失败:', error);
        throw new Error(`Failed to request close window: ${err.message}`);
      }
    }
  );

  /**
   * 获取当前窗口的实际代理信息
   * @returns 代理信息，如果没有代理则返回 null
   */
  ipcMain.handle('get-current-proxy', async (event: Electron.IpcMainInvokeEvent) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) {
        return null;
      }

      const windowId = window.id;
      const sessionKey = `task-window-${windowId}`;
      const proxyInfo = proxyInfoMap.get(sessionKey);

      if (!proxyInfo) {
        return null;
      }

      // 返回代理信息（不隐藏敏感信息）
      return {
        host: proxyInfo.host,
        port: proxyInfo.port,
        username: proxyInfo.username,
        password: proxyInfo.password,
        // 格式化显示字符串
        displayString: `${proxyInfo.host}:${proxyInfo.port}${proxyInfo.username ? ` (${proxyInfo.username})` : ''}`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[get-current-proxy] 获取代理信息失败:', error);
      return null;
    }
  });
}

