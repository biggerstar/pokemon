import { ipcMain } from 'electron';
import { AccountEntity, TaskStatus } from '@/orm/entities/account';
import { AppDataSource } from '@/orm/data-source';
import { TaskQueueManager } from '@/main/windows/browser/browser';
import { ensureDataSourceReady } from './utils';

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
      maxRetryCount: number = 3
    ) => {
      await ensureDataSourceReady();

      if (!accountMails || accountMails.length === 0) {
        return { success: false, message: '请先选择要启动的账号' };
      }

      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const accounts = await repo.find({
          where: accountMails.map((mail) => ({ mail })),
        });

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
          if (account.status === TaskStatus.NONE) {
            accountsToStart.push(account);
          } else if (account.status === TaskStatus.PROCESSING) {
            // 检查窗口是否关闭
            if (!taskQueue.isWindowOpen(account.mail)) {
              // 窗口已关闭，允许重新启动
              account.status = TaskStatus.NONE;
              account.statusText = '';
              await repo.save(account);
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

