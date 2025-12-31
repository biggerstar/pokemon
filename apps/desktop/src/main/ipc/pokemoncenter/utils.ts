import { AppDataSource } from '@/orm/data-source';
import { AccountEntity } from '@/orm/entities/account';

export async function ensureDataSourceReady() {
  if (!AppDataSource.isInitialized) {
    console.error('DataSource is not initialized!');
    throw new Error('Database not ready');
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

