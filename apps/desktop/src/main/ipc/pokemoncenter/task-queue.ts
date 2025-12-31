import { ipcMain } from 'electron';
import { AccountEntity, TaskStatus } from '@/orm/entities/account';
import { ProxyPoolEntity } from '@/orm/entities/proxy-pool';
import { AppDataSource } from '@/orm/data-source';
import { TaskQueueManager } from '@/main/windows/browser/browser';
import { ensureDataSourceReady } from './utils';
import { getConfigValue } from './captcha-config';

const CONFIG_KEYS = {
  CAPMONSTER_TOKEN: 'captcha_capmonster_token',
  TWO_CAPTCHA_TOKEN: 'captcha_2captcha_token',
  DEFAULT_SERVICE: 'captcha_default_service',
} as const;

export function registerTaskQueueHandlers(ipcMain: typeof import('electron').ipcMain) {
  ipcMain.handle(
    'start-tasks',
    async (
      _event,
      accountMails: string[],
      maxConcurrency: number = 3,
      show: boolean = false,
      enableProxy: boolean = true,
      clearBrowserData: boolean = false,
      maxRetryCount: number = 3,
      addToCartTiming?: 'beforeLogin' | 'afterLogin',
      captchaService?: 'capmonster' | '2captcha'
    ) => {
      await ensureDataSourceReady();

      if (!accountMails || accountMails.length === 0) {
        return { success: false, message: '请先选择要启动的账号' };
      }

      // 验证添加购物车时机参数
      if (!addToCartTiming || (addToCartTiming !== 'beforeLogin' && addToCartTiming !== 'afterLogin')) {
        return { success: false, message: '添加购物车时机参数无效，请在前端正确配置' };
      }

      // 验证验证码服务参数
      if (!captchaService || (captchaService !== 'capmonster' && captchaService !== '2captcha')) {
        return { success: false, message: '验证码平台参数无效，请在前端正确配置' };
      }

      // 检查对应验证码平台的 token 是否配置
      const capmonsterToken = await getConfigValue(CONFIG_KEYS.CAPMONSTER_TOKEN);
      const twoCaptchaToken = await getConfigValue(CONFIG_KEYS.TWO_CAPTCHA_TOKEN);

      if (captchaService === 'capmonster') {
        if (!capmonsterToken || capmonsterToken.trim() === '') {
          return { success: false, message: 'CapMonster Token 未配置，请在软件配置中设置后重试' };
        }
      } else if (captchaService === '2captcha') {
        if (!twoCaptchaToken || twoCaptchaToken.trim() === '') {
          return { success: false, message: '2Captcha Token 未配置，请在软件配置中设置后重试' };
        }
      }

      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const accounts = await repo.find({
          where: accountMails.map((mail) => ({ mail })),
        });

        // 如果启用了代理，检查代理配置
        if (enableProxy) {
          // 检查是否有账号指定了代理
          const accountsWithProxy = accounts.filter(account => account.data?.proxy && account.data.proxy.trim() !== '');
          
          // 检查代理池中是否有启用的代理
          const proxyRepo = AppDataSource.getRepository(ProxyPoolEntity);
          const enabledProxies = await proxyRepo.find({
            where: { enabled: true },
          });

          // 如果没有任何账号指定代理，且代理池中也没有启用的代理，则无法启动
          if (accountsWithProxy.length === 0 && enabledProxies.length === 0) {
            return { 
              success: false, 
              message: '已启用代理，但选中的账号均未指定代理，且代理池中也没有启用的代理。请为账号指定代理或在代理池中添加启用的代理后重试' 
            };
          }
        }

        const taskQueue = TaskQueueManager.getInstance();

        // 检查并清理已关闭的窗口
        for (const account of accounts) {
          taskQueue.cleanupClosedWindow(account.mail);
        }

        // 筛选可以启动的账号：
        // 1. 状态为 NONE 的账号
        // 2. 状态为 PROCESSING 但窗口已关闭的账号（允许重新启动）
        const accountsToStart: AccountEntity[] = [];
        for (const account of accounts) {
          // 更新账号的添加购物车时机配置和验证码服务配置
          if (!account.data) {
            account.data = {};
          }
          account.data.addToCartTiming = addToCartTiming;
          // 使用前端指定的验证码服务
          account.data.captchaService = captchaService;
          
          if (account.status === TaskStatus.NONE) {
            await repo.save(account); // 保存更新后的配置
            accountsToStart.push(account);
          } else if (account.status === TaskStatus.PROCESSING) {
            // 检查窗口是否关闭
            if (!taskQueue.isWindowOpen(account.mail)) {
              // 窗口已关闭，允许重新启动
              account.status = TaskStatus.NONE;
              account.statusText = '';
              await repo.save(account); // 保存更新后的配置和状态
              accountsToStart.push(account);
              // 重置重试计数
              taskQueue.resetRetryCountPublic(account.mail);
              console.log(`[start-tasks] 检测到窗口已关闭，允许重新启动: ${account.mail}`);
            }
          }
        }

        if (accountsToStart.length === 0) {
          return { success: false, message: '选中的账号中没有可以启动的账号' };
        }

        taskQueue.setMaxConcurrency(maxConcurrency);
        taskQueue.setShowWindow(show);
        taskQueue.setEnableProxy(enableProxy);
        taskQueue.setClearBrowserData(clearBrowserData);
        console.log(`[start-tasks] 设置最大重试次数: ${maxRetryCount}`);
        taskQueue.setMaxRetryCount(maxRetryCount);
        console.log(`[start-tasks] 验证最大重试次数: ${taskQueue.getMaxRetryCount()}`);
        console.log(`[start-tasks] 设置添加购物车时机: ${addToCartTiming}`);
        taskQueue.addTasks(accountsToStart);

        return {
          success: true,
          message: `已启动 ${accountsToStart.length} 个任务，并发数: ${maxConcurrency}`,
          taskCount: accountsToStart.length,
          maxConcurrency,
        };
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[start-tasks] 启动任务失败:', error);
        throw new Error(`Failed to start tasks: ${err.message}`);
      }
    }
  );

  ipcMain.handle('stop-tasks', async (_event) => {
    try {
      const taskQueue = TaskQueueManager.getInstance();
      await taskQueue.stopAllTasks();
      return { success: true, message: '已停止所有任务' };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[stop-tasks] 停止任务失败:', error);
      throw new Error(`Failed to stop tasks: ${err.message}`);
    }
  });

  ipcMain.handle('stop-selected-tasks', async (_event, accountMails: string[]) => {
    if (!accountMails || accountMails.length === 0) {
      return { success: false, message: '请先选择要停止的账号' };
    }

    try {
      const taskQueue = TaskQueueManager.getInstance();
      const stoppedCount = await taskQueue.stopSelectedTasks(accountMails);
      return {
        success: true,
        message: `已停止 ${stoppedCount} 个窗口`,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[stop-selected-tasks] 停止任务失败:', error);
      throw new Error(`Failed to stop selected tasks: ${err.message}`);
    }
  });

  /**
   * 获取任务队列状态
   */
  ipcMain.handle('get-task-queue-status', async (_event) => {
    try {
      const taskQueue = TaskQueueManager.getInstance();
      return taskQueue.getQueueStatus();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[get-task-queue-status] 获取状态失败:', error);
      throw new Error(`Failed to get task queue status: ${err.message}`);
    }
  });

  /**
   * 设置最大并发数
   */
  ipcMain.handle('set-max-concurrency', async (_event, maxConcurrency: number) => {
    try {
      const taskQueue = TaskQueueManager.getInstance();
      taskQueue.setMaxConcurrency(maxConcurrency);
      return { success: true, maxConcurrency };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[set-max-concurrency] 设置失败:', error);
      throw new Error(`Failed to set max concurrency: ${err.message}`);
    }
  });
}

