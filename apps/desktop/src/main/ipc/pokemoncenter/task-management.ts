import { ipcMain, WebContents } from 'electron';
import { AccountEntity, TaskStatus } from '@/orm/entities/account';
import { AppDataSource } from '@/orm/data-source';
import { TaskQueueManager } from '@/main/windows/browser/browser';
import { ensureDataSourceReady, getAccountMailFromEvent } from './utils';
import { initializeAccountStatus } from './account-management';

export function registerTaskManagementHandlers(ipcMain: typeof import('electron').ipcMain) {
  /**
   * 获取一个待处理的任务（status = NONE）
   * 如果指定了 mail，则获取该账号；否则获取任意一个待处理的账号
   * @param mail 可选的账号邮箱，如果提供则获取指定的账号
   * @returns 账号信息或 null
   */
  ipcMain.handle('get-task', async (_event, mail?: string) => {
    await ensureDataSourceReady();

    // 确保账号状态已初始化
    await initializeAccountStatus();

    try {
      // 使用事务确保原子性操作
      return await AppDataSource.transaction(async (transactionalEntityManager) => {
        const repo = transactionalEntityManager.getRepository(AccountEntity);

        let account: AccountEntity | null = null;

        if (mail) {
          // 如果指定了 mail，获取指定的账号
          console.log(`[get-task] 获取指定账号: ${mail}`);
          account = await repo.findOne({
            where: { mail: mail },
          });

          if (!account) {
            console.error(`[get-task] 账号不存在: ${mail}`);
            return null;
          }

          // 如果账号状态是 PROCESSING，说明正在处理中，直接返回
          if (account.status === TaskStatus.PROCESSING) {
            console.log(`[get-task] 账号正在处理中: ${account.mail}, status: ${account.status}`);
            return account;
          }

          // 如果账号状态不是 NONE，不能获取
          if (account.status !== TaskStatus.NONE) {
            console.error(
              `[get-task] 账号状态不是 NONE 或 PROCESSING: ${mail}, status: ${account.status}`
            );
            return null;
          }

          console.log(`[get-task] 获取到指定账号: ${account.mail}, status: ${account.status}`);
        } else {
          // 如果没有指定 mail，获取任意一个待处理的账号
          // 先打印当前所有账号的状态（调试用）
          const allAccounts = await repo.find({ select: ['mail', 'status'] });
          console.log(
            '[get-task] 当前账号状态:',
            allAccounts.map((a) => `${a.mail}: ${a.status}`)
          );

          // 查找一个 status = NONE 的账号
          account = await repo.findOne({
            where: { status: TaskStatus.NONE },
            order: { created_time: 'ASC' }, // 按创建时间排序，先进先出
          });

          if (!account) {
            console.log('[get-task] No pending task found (status=NONE)');
            return null;
          }

          console.log(`[get-task] Task acquired: ${account.mail}, status -> PROCESSING`);
        }

        return account;
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[get-task] Error:', error);
      throw new Error(`Failed to get task: ${err.message}`);
    }
  });

  /**
   * 更新任务状态（安全版本：从 event.sender 自动识别窗口对应的账号）
   * @param status 新状态: NONE | PROCESSING | DONE | ERROR
   * @param statusText 状态文本描述（可选，如果为空则不更新 statusText）
   */
  ipcMain.handle(
    'update-task-status',
    async (event: Electron.IpcMainInvokeEvent, status: TaskStatus, statusText?: string) => {
      await ensureDataSourceReady();

      // 从 event.sender 自动获取账号 mail（安全方式，不依赖前端传递）
      const mail = getAccountMailFromEvent(event);
      if (!mail) {
        throw new Error('无法从窗口识别账号，请确保窗口已正确关联到任务');
      }

      if (!Object.values(TaskStatus).includes(status)) {
        throw new Error(
          `Invalid status: ${status}. Must be one of: ${Object.values(TaskStatus).join(', ')}`
        );
      }

      try {
        const repo = AppDataSource.getRepository(AccountEntity);
        const account = await repo.findOneBy({ mail });

        if (!account) {
          throw new Error(`Task not found: ${mail}`);
        }

        const oldStatus = account.status;
        const oldStatusText = account.statusText;
        account.status = status;
        // 只有当 statusText 有值时才更新 statusText（不为 undefined、null 或空字符串）
        if (statusText !== undefined && statusText !== null && statusText !== '') {
          account.statusText = statusText;
        }
        await repo.save(account);

        console.log(
          `[update-task-status] Task ${account.mail}: ${oldStatus} -> ${status}${
            statusText ? ` (${statusText})` : ''
          }`
        );
        return {
          success: true,
          mail,
          oldStatus,
          newStatus: status,
          oldStatusText,
          newStatusText: statusText,
        };
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[update-task-status] Error:', error);
        throw new Error(`Failed to update task status: ${err.message}`);
      }
    }
  );

  /**
   * 重置所有 PROCESSING 状态的任务为 NONE（用于异常恢复）
   */
  ipcMain.handle('reset-processing-tasks', async (_event) => {
    await ensureDataSourceReady();

    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      const result = await repo.update(
        { status: TaskStatus.PROCESSING },
        { status: TaskStatus.NONE, statusText: '' }
      );

      console.log(`[reset-processing-tasks] Reset ${result.affected} tasks`);
      return { success: true, count: result.affected };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[reset-processing-tasks] Error:', error);
      throw new Error(`Failed to reset tasks: ${err.message}`);
    }
  });

  /**
   * 初始化所有账号状态为 NONE（将所有非 PROCESSING 状态都重置）
   * 用于手动重新开始所有任务
   */
  ipcMain.handle('init-all-tasks', async (_event) => {
    await ensureDataSourceReady();

    try {
      const repo = AppDataSource.getRepository(AccountEntity);

      // 将所有非 PROCESSING 的账号重置为 NONE，并清空 statusText
      const result = await repo
        .createQueryBuilder()
        .update(AccountEntity)
        .set({ status: TaskStatus.NONE, statusText: '' })
        .where('status IS NULL OR status = :empty OR status IN (:...statuses)', {
          empty: '',
          statuses: [TaskStatus.NONE, TaskStatus.DONE, TaskStatus.ERROR],
        })
        .execute();

      console.log(`[init-all-tasks] Initialized ${result.affected} tasks to NONE`);
      return { success: true, count: result.affected };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[init-all-tasks] Error:', error);
      throw new Error(`Failed to reset tasks: ${err.message}`);
    }
  });

  /**
   * 重置选中账号的状态为 NONE
   * @param accountMails 账号邮箱数组
   */
  ipcMain.handle('reset-accounts-status', async (_event, accountMails: string[]) => {
    await ensureDataSourceReady();

    if (!accountMails || accountMails.length === 0) {
      throw new Error('账号邮箱数组不能为空');
    }

    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      // 使用 In 操作符批量更新
      const result = await repo
        .createQueryBuilder()
        .update(AccountEntity)
        .set({ status: TaskStatus.NONE, statusText: '' })
        .where('mail IN (:...mails)', { mails: accountMails })
        .execute();

      console.log(`[reset-accounts-status] 已重置 ${result.affected} 个账号的状态`);
      return { success: true, count: result.affected || 0 };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[reset-accounts-status] 重置失败:', error);
      throw new Error(`Failed to reset accounts status: ${err.message}`);
    }
  });

  /**
   * 通过窗口更新任务状态（用于网络问题等场景，允许后端更新状态）
   * 注意：只有超时和网络问题可以在后端更新状态，其他状态必须从前端传递
   * @param statusText 状态文本描述
   * @param status 新状态（字符串，默认为 'ERROR'）
   * @param shouldCloseWindow 是否关闭窗口（默认为 false）
   */
  ipcMain.handle(
    'update-task-status-by-window',
    async (event: Electron.IpcMainInvokeEvent, statusText: string, status: string = 'ERROR', shouldCloseWindow: boolean = false) => {
      await ensureDataSourceReady();

      // 从 event.sender 自动获取账号 mail（安全方式）
      const accountMail = getAccountMailFromEvent(event);
      if (!accountMail) {
        throw new Error('无法从窗口识别账号，请确保窗口已正确关联到任务');
      }

      // 验证并转换状态
      const taskStatus = status as TaskStatus;
      if (!Object.values(TaskStatus).includes(taskStatus)) {
        throw new Error(
          `Invalid status: ${status}. Must be one of: ${Object.values(TaskStatus).join(', ')}`
        );
      }

      try {
        // 更新任务状态
        const repo = AppDataSource.getRepository(AccountEntity);
        const account = await repo.findOneBy({ mail: accountMail });

        if (!account) {
          throw new Error(`账号不存在: ${accountMail}`);
        }

        const oldStatus = account.status;
        account.status = taskStatus;
        account.statusText = statusText || '';
        await repo.save(account);

        console.log(
          `[update-task-status-by-window] 窗口 -> 账号 ${accountMail}: ${oldStatus} -> ${taskStatus} (${statusText})`
        );

        // 如果需要关闭窗口，调用 TaskQueueManager 的 requestCloseWindow
        if (shouldCloseWindow) {
          await TaskQueueManager.getInstance().requestCloseWindow(accountMail, true);
          console.log(`[update-task-status-by-window] 已请求关闭窗口: ${accountMail}`);
        }

        return {
          success: true,
          mail: accountMail,
          oldStatus,
          newStatus: taskStatus,
          statusText,
        };
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[update-task-status-by-window] Error:', error);
        throw new Error(`Failed to update task status by window: ${err.message}`);
      }
    }
  );
}

