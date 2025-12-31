import { ipcMain } from 'electron';
import { AccountEntity, TaskStatus } from '@/orm/entities/account';
import { AppDataSource } from '@/orm/data-source';
import { TaskQueueManager } from '@/main/windows/browser/browser';
import { ensureDataSourceReady, findAccountByMail } from './utils';

export function registerAccountManagementHandlers(ipcMain: typeof import('electron').ipcMain) {
  ipcMain.handle('get-account-info', async (_event, username?: string) => {
    const account = await findAccountByMail(username);

    if (!account) {
      throw new Error('No account available');
    }

    return account;
  });

  ipcMain.handle('save-accounts', async (_event, accounts: unknown[]) => {
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      console.warn('No accounts provided or accounts is not an array');
      throw new Error('No accounts provided');
    }
    await ensureDataSourceReady();

    let savedCount = 0;
    const errors: string[] = [];

    try {
      // Use a transaction to ensure all or nothing (optional but safer)
      await AppDataSource.transaction(async (transactionalEntityManager) => {
        const repo = transactionalEntityManager.getRepository(AccountEntity);

        for (const acc of accounts) {
          try {
            const account = acc as { mail?: string; data?: Record<string, unknown> };
            if (!account.mail) {
              errors.push(`Account missing mail: ${JSON.stringify(acc)}`);
              continue;
            }

            // Check if account exists
            let entity = await repo.findOneBy({ mail: account.mail });

            if (!entity) {
              // Create new
              entity = repo.create({
                mail: account.mail,
                data: account.data || {},
                status: TaskStatus.NONE, // 新账号默认状态为 NONE
              });
            } else {
              // Update existing
              entity.data = {
                ...(entity.data || {}),
                ...(account.data || {}),
              };
            }

            await repo.save(entity);
            savedCount++;
          } catch (err: unknown) {
            const error = err as Error;
            console.error(`Error saving account ${(acc as { mail?: string }).mail}:`, err);
            errors.push(`Failed to save ${(acc as { mail?: string }).mail}: ${error.message}`);
          }
        }
      });

      if (errors.length > 0) {
        console.warn('Errors during save:', errors);
      }
      return { success: true, saved: savedCount, total: accounts.length, errors };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error saving accounts:', error);
      console.error('Error stack:', err.stack);
      throw new Error(`Failed to save accounts: ${err.message}`);
    }
  });

  ipcMain.handle('delete-accounts', async (_event, mails: string[]) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(AccountEntity);
    await repo.delete(mails);
    return true;
  });

  ipcMain.handle('get-accounts', async (_event) => {
    await ensureDataSourceReady();

    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      const result = await repo.find({ order: { created_time: 'DESC' } });

      // 获取窗口状态
      const taskQueue = TaskQueueManager.getInstance();
      const openWindowAccounts = taskQueue.getOpenWindowAccounts();

      // 为每个账号添加窗口状态
      const accountsWithWindowStatus = result.map((account) => {
        const isWindowOpen = openWindowAccounts.includes(account.mail);
        return {
          ...account,
          windowStatus: isWindowOpen ? 'OPEN' : 'CLOSED',
        };
      });

      return accountsWithWindowStatus;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error getting accounts:', error);
      throw new Error(`Failed to get accounts: ${err.message}`);
    }
  });
}

/**
 * 初始化：将所有 status 为 NULL 的账号设置为 NONE
 * 这是为了兼容在添加 status 字段之前创建的账号
 */
export async function initializeAccountStatus() {
  await ensureDataSourceReady();

  try {
    const repo = AppDataSource.getRepository(AccountEntity);

    // 更新所有 status 为 NULL 或空的账号
    const result = await repo
      .createQueryBuilder()
      .update(AccountEntity)
      .set({ status: TaskStatus.NONE })
      .where('status IS NULL OR status = :empty', { empty: '' })
      .execute();

    if (result.affected && result.affected > 0) {
      console.log(`[init] 已将 ${result.affected} 个账号的 status 初始化为 NONE`);
    }
  } catch (error) {
    console.error('[init] 初始化账号状态失败:', error);
  }
}

// 应用启动时初始化
setTimeout(() => {
  initializeAccountStatus();
}, 1000);

