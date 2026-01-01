import { AppDataSource, dataSourceInitPromise } from '@/orm/data-source';
import { AccountEntity } from '@/orm/entities/account';
import { BrowserWindow } from 'electron';
import { TaskQueueManager } from '@/main/windows/browser/browser';

export async function ensureDataSourceReady(): Promise<void> {
  // 如果已经初始化，直接返回
  if (AppDataSource.isInitialized) {
    return;
  }

  // 等待初始化完成
  try {
    await dataSourceInitPromise;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('数据库初始化失败:', errorMessage);
    throw new Error(`Database initialization failed: ${errorMessage}`);
  }

  // 再次检查，确保初始化成功
  if (!AppDataSource.isInitialized) {
    throw new Error('Database not ready: initialization completed but isInitialized is still false');
  }
}

export function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? '';
}

export function resolveImapHost(email: string, customHost?: string): string {
  if (customHost) {
    return customHost;
  }

  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  switch (domain) {
    case 'gmail.com':
    case 'googlemail.com':
      return 'imap.gmail.com';
    case 'yahoo.co.jp':
      return 'imap.mail.yahoo.co.jp';
    case 'yahoo.com':
    case 'yahoo.co.uk':
    case 'yahoo.com.cn':
      return 'imap.mail.yahoo.com';
    case 'outlook.com':
    case 'hotmail.com':
    case 'live.com':
    case 'office365.com':
      return 'outlook.office365.com';
    default:
      return domain ? `imap.${domain}` : 'imap.gmail.com';
  }
}

export async function findAccountByMail(loginMail?: string): Promise<AccountEntity | null> {
  await ensureDataSourceReady();
  if (!loginMail) return null;

  const repo = AppDataSource.getRepository(AccountEntity);
  return await repo.findOne({ where: { mail: loginMail } });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * 从 IPC 事件的 sender 获取对应的账号 mail
 * 这是安全的方式，不依赖前端传递的 mail 参数
 * @param event IPC 事件对象
 * @returns 账号 mail，如果找不到则返回 null
 */
export function getAccountMailFromEvent(
  event: Electron.IpcMainInvokeEvent,
): string | null {
  try {
    const webContents = event.sender;
    const window = BrowserWindow.fromWebContents(webContents);
    
    if (!window || window.isDestroyed()) {
      console.warn('[getAccountMailFromEvent] 无法找到对应的窗口');
      return null;
    }

    const taskQueue = TaskQueueManager.getInstance();
    const accountMail = taskQueue.getAccountMailByWindowId(window.id);
    
    if (!accountMail) {
      console.warn(`[getAccountMailFromEvent] 无法找到窗口 ${window.id} 对应的账号`);
      return null;
    }

    return accountMail;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getAccountMailFromEvent] 获取账号 mail 失败:', errorMessage);
    return null;
  }
}

