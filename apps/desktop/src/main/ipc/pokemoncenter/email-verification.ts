import { ImapFlow } from 'imapflow';
import {
  POKEMONCENTER_EMAIL,
  EMAIL_SEARCH_WINDOW_MS,
  POLL_INTERVAL_MS,
  TOTAL_TIMEOUT_MS,
  CODE_BLACKLIST,
  MAX_EMAILS_TO_CHECK,
  ALLOWED_SENDER_KEYWORDS,
  ALLOWED_SUBJECT_KEYWORDS,
  VERIFICATION_CODE_KEYWORDS,
  VERIFICATION_CODE_LENGTH,
} from './config';
import {
  normalizeEmail,
  resolveImapHost,
  findAccountByMail,
  sleep,
} from './utils';

/**
 * 检查验证码是否有效（不在黑名单中）
 */
function isValidCode(code: string): boolean {
  if (CODE_BLACKLIST.has(code)) {
    console.log(`[IMAP] Code ${code} is blacklisted, skipping`);
    return false;
  }
  return true;
}

type VerificationCacheEntry = {
  uid: number;
  recipient: string;
  code: string;
  sentDate: Date;
  subject: string;
};

class MailboxPoller {
  private readonly codeMail: string;
  private readonly smtpPassword: string;
  private readonly host: string;
  private readonly port: number;
  private readonly useTls: boolean;
  private client: ImapFlow | null = null;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastUid = 0;
  private polling = false;
  private readonly cache = new Map<string, VerificationCacheEntry[]>();
  private activeCount = 0;
  getActiveCount(): number {
    return this.activeCount;
  }
  isRunning(): boolean {
    return this.running;
  }

  constructor(params: {
    codeMail: string;
    smtpPassword: string;
    host: string;
    port: number;
    useTls: boolean;
  }) {
    this.codeMail = params.codeMail;
    this.smtpPassword = params.smtpPassword;
    this.host = params.host;
    this.port = params.port;
    this.useTls = params.useTls;
  }

  async acquire(): Promise<void> {
    this.activeCount++;
    if (this.activeCount === 1) {
      await this.start();
    }
  }

  async release(): Promise<void> {
    if (this.activeCount > 0) {
      this.activeCount--;
    }
    if (this.activeCount === 0) {
      await this.stop();
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.client = new ImapFlow({
      host: this.host,
      port: this.port,
      secure: this.useTls,
      auth: { user: this.codeMail, pass: this.smtpPassword },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
    await this.client.connect();
    this.running = true;
    await this.pollOnce();
    this.timer = setInterval(async () => {
      if (this.polling) return;
      this.polling = true;
      try {
        await this.pollOnce();
      } catch (e) {
        const err = e as Error;
        console.error('[IMAP] Background poll failed:', err.message);
        if (this.client && !this.client.authenticated) {
          try {
            await this.client.connect();
          } catch (reconnectErr) {
            console.error('[IMAP] Background reconnect failed:', reconnectErr);
          }
        }
      } finally {
        this.polling = false;
      }
    }, POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    if (this.client) {
      try {
        await this.client.logout();
      } catch {}
      this.client = null;
    }
  }

  private async pollOnce(): Promise<void> {
    if (!this.client) return;
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      const allUids = await this.client.search({}, { uid: true });
      if (!allUids || allUids.length === 0) return;
      allUids.sort((a, b) => b - a);
      const latestUids = allUids.slice(
        0,
        Math.min(MAX_EMAILS_TO_CHECK, allUids.length),
      );
      const newUids = latestUids.filter((u) => u > this.lastUid);
      const now = new Date();
      const windowStart = now.getTime() - EMAIL_SEARCH_WINDOW_MS;

      for (const uid of newUids.length > 0 ? newUids : latestUids) {
        try {
          const header = await this.client.fetchOne(
            String(uid),
            { envelope: true },
            { uid: true },
          );
          if (
            !header ||
            typeof header !== 'object' ||
            !('envelope' in header)
          ) {
            continue;
          }
          const envelope = (header as { envelope?: unknown }).envelope as {
            subject?: string[];
            from?: Array<{ address?: string }>;
            to?: Array<{ address?: string }>;
            date?: Date | number | string;
          };
          const subject = envelope?.subject?.[0] || '';
          const from = envelope?.from?.[0]?.address || '';
          const toAddresses: string[] = Array.isArray(envelope?.to)
            ? envelope!
                .to!.map((addr) => addr?.address)
                .filter(
                  (a): a is string => typeof a === 'string' && a.length > 0,
                )
            : [];

          let sentDate: Date | null = null;
          if (envelope?.date instanceof Date) {
            sentDate = envelope.date;
          } else if (typeof envelope?.date === 'number') {
            sentDate = new Date(envelope.date);
          } else if (typeof envelope?.date === 'string') {
            sentDate = new Date(envelope.date);
          }

          const valid = isValidEmail(from, sentDate, now, windowStart);
          if (!valid) continue;
          if (!sentDate) continue;

          const body = await this.client.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (!body || typeof body !== 'object' || !('source' in body)) {
            continue;
          }
          const srcVal = (body as { source?: unknown }).source;
          if (srcVal === undefined || srcVal === null) {
            continue;
          }
          const source = typeof srcVal === 'string' ? srcVal : String(srcVal);
          if (!source) continue;

          const code = extractVerificationCode(source);
          if (!code) continue;

          const recipientKeys = new Set<string>();
          for (const addr of toAddresses) {
            const r = normalizeEmail(addr);
            if (r) recipientKeys.add(r);
          }
          const selfRecipient = normalizeEmail(this.codeMail);
          if (selfRecipient) recipientKeys.add(selfRecipient);
          for (const recipient of Array.from(recipientKeys)) {
            const list = this.cache.get(recipient) ?? [];
            const exists = list.some((x) => x.uid === uid);
            if (!exists) {
              const entry: VerificationCacheEntry = {
                uid,
                recipient,
                code,
                sentDate,
                subject,
              };
              const updated = [entry, ...list]
                .sort((a, b) => b.sentDate.getTime() - a.sentDate.getTime())
                .slice(0, MAX_EMAILS_TO_CHECK);
              this.cache.set(recipient, updated);
            }
          }

          if (uid > this.lastUid) this.lastUid = uid;
        } catch (err) {
          console.error('[IMAP] Poll process uid error:', err);
          continue;
        }
      }
    } finally {
      lock.release();
    }
  }

  getLatestCode(recipient: string, startTime: number): string | null {
    const normalized = normalizeEmail(recipient);
    const list = this.cache.get(normalized) ?? [];
    const primary = list.find(
      (e) => e.sentDate.getTime() >= startTime && isValidCode(e.code),
    );
    if (primary) return primary.code;
    return null;
  }
}

class MailboxPollerManager {
  private static instance: MailboxPollerManager | null = null;
  private poller: MailboxPoller | null = null;
  private key: string | null = null;

  static getInstance(): MailboxPollerManager {
    if (!this.instance) this.instance = new MailboxPollerManager();
    return this.instance;
  }

  async getPoller(params: {
    codeMail: string;
    smtpPassword: string;
    host: string;
    port: number;
    useTls: boolean;
  }): Promise<MailboxPoller> {
    const newKey = `${normalizeEmail(params.codeMail)}|${params.host}|${params.port}|${params.useTls ? 1 : 0}`;
    if (!this.poller) {
      this.poller = new MailboxPoller(params);
      this.key = newKey;
      return this.poller;
    }
    if (this.key !== newKey) {
      if (this.poller.getActiveCount() > 0 || this.poller.isRunning()) {
        throw new Error('IMAP poller is running with a different config');
      }
      await this.poller.stop();
      this.poller = new MailboxPoller(params);
      this.key = newKey;
    }
    return this.poller;
  }
}

/**
 * 从邮件内容中提取验证码
 * 使用更精确的匹配模式，避免匹配到邮件ID、时间戳等无关数字
 * 支持纯文本和HTML格式的邮件
 *
 * Pokemon Center 邮件格式：
 * ログイン用パスコードをお知らせします。パスコード入力画面に下記のコードを入力してください。
 */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPatternsFromKeywords(keywords: string[]): RegExp[] {
  const patterns: RegExp[] = [];
  for (const kw of keywords) {
    const e = escapeRegExp(kw);
    patterns.push(
      new RegExp(`${e}[:：]\\s*(\\d{${VERIFICATION_CODE_LENGTH}})\\b`, 'gi'),
    );
    patterns.push(
      new RegExp(
        `${e}[\\s\\S]{0,100}?(\\d{${VERIFICATION_CODE_LENGTH}})\\b`,
        'gi',
      ),
    );
  }
  patterns.push(new RegExp(`\\b(\\d{${VERIFICATION_CODE_LENGTH}})\\b`, 'gi'));
  return patterns;
}

function extractVerificationCode(emailContent: string): string | null {
  // 如果是HTML邮件，先提取纯文本内容
  let textContent = emailContent;

  // 尝试提取HTML邮件的文本内容
  const htmlBodyMatch = emailContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (htmlBodyMatch) {
    // 移除HTML标签，保留文本内容
    textContent = htmlBodyMatch[1]
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除script标签
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除style标签
      .replace(/<[^>]+>/g, ' ') // 移除所有HTML标签
      .replace(/&nbsp;/g, ' ') // 替换&nbsp;
      .replace(/&[a-z]+;/gi, ' ') // 替换其他HTML实体
      .replace(/\s+/g, ' ') // 合并多个空格
      .trim();
    console.log(
      '[IMAP] Extracted text from HTML email, length:',
      textContent.length,
    );
  } else {
    // 移除邮件头部分，只搜索邮件正文
    const bodyStart =
      emailContent.indexOf('\r\n\r\n') || emailContent.indexOf('\n\n');
    textContent =
      bodyStart > 0 ? emailContent.substring(bodyStart) : emailContent;
  }

  // 记录邮件内容的前500个字符用于调试
  const preview = textContent.substring(0, 500).replace(/\s+/g, ' ');
  console.log('[IMAP] Email content preview (first 500 chars):', preview);

  const patterns = buildPatternsFromKeywords(VERIFICATION_CODE_KEYWORDS);

  for (const pattern of patterns) {
    // 重置正则表达式的lastIndex
    pattern.lastIndex = 0;

    for (const match of textContent.matchAll(pattern)) {
      // 优先使用捕获组（match[1]），如果没有则使用整个匹配
      const rawCode = match[1] || match[0];
      if (!rawCode || typeof rawCode !== 'string') continue;

      // 提取其中的6位数字
      const sixDigitMatch = rawCode.match(
        new RegExp(`\\d{${VERIFICATION_CODE_LENGTH}}`),
      );
      if (!sixDigitMatch) continue;

      const code = sixDigitMatch[0];

      // 严格验证：必须是6位数字，且不在黑名单中
      if (
        !new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(code) ||
        !isValidCode(code)
      ) {
        console.log(`[IMAP] Skipping code ${code} (blacklisted or invalid)`);
        continue;
      }

      // 验证这个数字不在明显的非验证码上下文中
      const context = textContent.substring(
        Math.max(0, match.index! - 50),
        Math.min(textContent.length, match.index! + 50),
      );

      // 排除明显的时间戳、ID等
      if (
        /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(context) || // 日期格式
        /uid|id|message-id|message\s*id/i.test(context) || // ID相关
        /\d{10,}/.test(context) // 长数字串（可能是时间戳）
      ) {
        console.log(
          `[IMAP] Skipping code ${code} (appears to be in non-code context)`,
        );
        continue;
      }

      console.log(
        '[IMAP] Found verification code with pattern:',
        pattern.toString(),
        'code:',
        code,
      );
      console.log(
        '[IMAP] Context:',
        context.replace(/\s+/g, ' ').substring(0, 150),
      );
      return code;
    }
  }

  console.log('[IMAP] No verification code found in email content');
  return null;
}

/**
 * 验证邮件是否符合要求（发送者和时间）
 * @param from 邮件发送者
 * @param sentDate 邮件发送时间
 * @param now 当前时间
 * @param startTime 开始查询的时间戳（UTC 毫秒），只有在此时间之后发送的邮件才算有效
 */
function isValidEmail(
  from: string | undefined,
  sentDate: Date | null,
  now: Date,
  startTime: number,
): boolean {
  // 验证发送者 - 放宽验证：允许包含 "pokemoncenter" 的邮件地址
  if (!from) {
    console.log('[IMAP] 邮件验证失败：没有发送者信息');
    return false;
  }

  const fromLower = from.toLowerCase();
  const expectedEmailLower = POKEMONCENTER_EMAIL.toLowerCase();

  const allowed = ALLOWED_SENDER_KEYWORDS.some((kw) =>
    fromLower.includes(kw.toLowerCase()),
  );
  if (fromLower !== expectedEmailLower && !allowed) {
    console.log(
      `[IMAP] 邮件验证失败：发送者 ${from} 不匹配 Pokemon Center (期望: ${POKEMONCENTER_EMAIL})`,
    );
    return false;
  }

  // 如果发送者匹配，记录日志
  if (fromLower !== expectedEmailLower) {
    console.log(
      `[IMAP] 发送者匹配（宽松模式）: ${from} (期望: ${POKEMONCENTER_EMAIL})`,
    );
  }

  // 验证时间
  if (!sentDate) {
    return false;
  }

  // 使用 getTime() 获取 UTC 时间戳（毫秒），这是时区无关的
  // 这样可以确保在全球任意时区运行时都能正确比较时间
  const sentTimestamp = sentDate.getTime();
  const nowTimestamp = now.getTime();

  // 关键验证：邮件的发送时间应该 >= startTime（不允许使用旧邮件）
  // 但允许一定的时间容差（30秒），以应对时间不同步的问题
  // 使用时间戳比较，完全时区无关
  const timeToleranceMs = 30 * 1000; // 30秒容差
  if (sentTimestamp < startTime - timeToleranceMs) {
    const sentDateISO = sentDate.toISOString();
    const startTimeISO = new Date(startTime).toISOString();
    const timeDiff = Math.round((startTime - sentTimestamp) / 1000);
    console.log(
      `[IMAP] 拒绝旧邮件：邮件发送时间 ${sentDateISO} (UTC) 早于开始查询时间 ${startTimeISO} (UTC)，时间差: ${timeDiff}秒（超过30秒容差）`,
    );
    return false;
  }

  // 如果邮件在容差范围内（startTime 之前30秒内），记录警告但仍接受
  if (sentTimestamp < startTime) {
    const timeDiff = Math.round((startTime - sentTimestamp) / 1000);
    console.log(
      `[IMAP] ⚠️ 警告：邮件发送时间早于开始查询时间 ${timeDiff}秒，但在30秒容差内，仍接受此邮件`,
    );
  }

  // 验证邮件发送时间是否在未来（可能是服务器时间不同步）
  // 如果发送时间在未来，允许但记录警告
  const emailAge = nowTimestamp - sentTimestamp;
  if (emailAge < 0) {
    const futureDiff = Math.round(Math.abs(emailAge) / 1000);
    console.log(
      `[IMAP] 警告：邮件发送时间 ${sentDate.toISOString()} 在未来 ${futureDiff}秒，可能是服务器时间不同步，但仍接受此邮件`,
    );
  }

  // 额外的安全检查：如果邮件发送时间距离现在超过 10 分钟，拒绝
  // 这可以防止因为时间戳错误而接受过旧的邮件
  // 即使发送时间 >= startTime，如果邮件太旧，也可能是时间戳错误
  const maxEmailAgeMs = 10 * 60 * 1000; // 10 分钟
  if (emailAge > maxEmailAgeMs) {
    const ageSeconds = Math.round(emailAge / 1000);
    const maxAgeSeconds = Math.round(maxEmailAgeMs / 1000);
    console.log(
      `[IMAP] 拒绝：邮件发送时间 ${sentDate.toISOString()} 距离现在 ${ageSeconds}秒，超过最大允许年龄 ${maxAgeSeconds}秒，可能是时间戳错误`,
    );
    return false;
  }

  return true;
}

/**
 * 获取邮件验证码
 *
 * 重要区分：
 * - loginId: 登录账号（用于查找数据库记录，即 account.mail）
 * - codeMail: 收验证码的邮箱（用于 IMAP 登录）
 * - smtp: codeMail 的密码
 * - startTime: 开始查询的时间戳（毫秒），只有在此时间之后发送的邮件才算有效
 *
 * @param loginId 登录账号，用于查找数据库中的账号记录
 * @param startTime 可选的时间戳（毫秒），如果不提供则使用当前时间
 */
export function registerGetMail2FAHandler(
  ipcMain: typeof import('electron').ipcMain,
) {
  ipcMain.handle(
    'get-mail-2fa',
    async (
      event: import('electron').IpcMainInvokeEvent,
      loginId?: string,
      startTime?: number,
    ) => {
      const normalizedLoginId = normalizeEmail(loginId);

      if (!normalizedLoginId) {
        throw new Error('loginId is required');
      }

      // 如果没有提供 startTime，使用当前时间
      // 如果提供了 startTime，确保它是有效的时间戳
      const queryStartTime = Date.now() - 10 * 1000;
      const queryStartDate = new Date(queryStartTime);

      console.log(`[get-mail-2fa] 查找账号: ${normalizedLoginId}`);
      console.log(
        `[get-mail-2fa] 开始查询时间: ${queryStartDate.toISOString()} (timestamp: ${queryStartTime})`,
      );

      // 用 loginId 查找账号（account.mail = loginId）
      const account = await findAccountByMail(normalizedLoginId);

      if (!account) {
        throw new Error(`Account not found for loginId: ${loginId}`);
      }

      const data = account.data || {};

      // codeMail 是收验证码的邮箱，与 loginId 不同！
      const codeMail = normalizeEmail(data.codeMail);
      // smtp 是 codeMail 的密码
      const smtpPassword = data.smtp;

      console.log(`[get-mail-2fa] 账号信息:`);
      console.log(`  - loginId (account.mail): ${account.mail}`);
      console.log(`  - codeMail: ${codeMail || '(未设置)'}`);
      console.log(`  - smtp: ${smtpPassword ? '******' : '(未设置)'}`);

      if (!codeMail) {
        throw new Error(`账号 ${account.mail} 未设置 codeMail（收验证码邮箱）`);
      }

      if (!smtpPassword) {
        throw new Error(`账号 ${account.mail} 未设置 smtp（codeMail 的密码）`);
      }

      // 使用 codeMail 来确定 IMAP 服务器
      const imapHost = resolveImapHost(codeMail, data.imapHost);
      const imapPort = data.imapPort ? Number(data.imapPort) : 993;
      const useTls = data.imapTls !== undefined ? Boolean(data.imapTls) : true;

      console.log(
        `[get-mail-2fa] IMAP 配置: ${codeMail} @ ${imapHost}:${imapPort}`,
      );
      const manager = MailboxPollerManager.getInstance();
      const poller = await manager.getPoller({
        codeMail,
        smtpPassword,
        host: imapHost,
        port: imapPort,
        useTls,
      });
      const requestTime = Date.now();
      const deadline = requestTime + TOTAL_TIMEOUT_MS;
      console.log(
        `[get-mail-2fa] 请求时间: ${new Date(requestTime).toISOString()}`,
      );
      console.log(
        `[get-mail-2fa] 使用后台轮询缓存查找验证码，查询收件人: ${normalizedLoginId}`,
      );
      console.log(
        `[get-mail-2fa] 只接受在 ${queryStartDate.toISOString()} 之后发送的邮件`,
      );
      await poller.acquire();
      try {
        let attempt = 0;
        while (Date.now() < deadline) {
          if (event.sender.isDestroyed()) {
            console.log('[get-mail-2fa] Window is closed, cancelling task');
            return null;
          }
          attempt++;
          // 使用收验证码邮箱（codeMail）作为查询键，避免 loginId 与收件人不一致导致查不到
          const code = poller.getLatestCode(codeMail, queryStartTime);
          if (code) {
            const totalElapsed = Math.round((Date.now() - requestTime) / 1000);
            console.log(
              `[get-mail-2fa] ✅ Found valid code: ${code} (总用时: ${totalElapsed}秒, 尝试次数: ${attempt})`,
            );
            return code;
          }
          const now = Date.now();
          const remaining = deadline - now;
          const waitTime = Math.min(POLL_INTERVAL_MS, Math.max(0, remaining));
          if (waitTime <= 0) break;
          await sleep(waitTime);
        }
        console.log(
          `[get-mail-2fa] Timeout: 超过总超时时间 ${Math.round(TOTAL_TIMEOUT_MS / 1000)}秒，未在缓存中找到验证码`,
        );
        return null;
      } finally {
        await poller.release();
      }
    },
  );
}
