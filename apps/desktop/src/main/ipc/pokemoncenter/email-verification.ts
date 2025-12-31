import { ImapFlow } from 'imapflow';
import {
  POKEMONCENTER_EMAIL,
  EMAIL_SEARCH_WINDOW_MS,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  TOTAL_TIMEOUT_MS,
  CODE_BLACKLIST,
} from './config';
import { normalizeEmail, resolveImapHost, findAccountByMail, sleep } from './utils';

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

/**
 * 从邮件内容中提取验证码
 * 使用更精确的匹配模式，避免匹配到邮件ID、时间戳等无关数字
 *
 * Pokemon Center 邮件格式：
 * ログイン用パスコードをお知らせします。パスコード入力画面に下記のコードを入力してください。
 */
function extractVerificationCode(emailContent: string): string | null {
  // 移除邮件头部分，只搜索邮件正文
  const bodyStart = emailContent.indexOf('\r\n\r\n') || emailContent.indexOf('\n\n');
  const body = bodyStart > 0 ? emailContent.substring(bodyStart) : emailContent;

  // 尝试多种验证码模式，按优先级排序
  const patterns = [
    // 最高优先级：Pokemon Center 格式 【パスコード】166890
    /【パスコード】\s*(\d{6})\b/gi,
    // パスコード：166890 或 パスコード: 166890
    /パスコード[:：]\s*(\d{6})\b/gi,
    // パスコード 后面跟数字（可能在不同行）
    /パスコード[\s\S]{0,100}?(\d{6})\b/gi,
    // ログイン用パスコード 后面的数字
    /ログイン用パスコード[\s\S]{0,100}?(\d{6})\b/gi,
    // 验证码: 123456 或 验证码：123456
    /(?:验证码|verification\s*code|code|コード)[:：\s]*(\d{6})\b/gi,
    // 您的验证码是 123456
    /(?:您的|your|あなたの)[\s\S]{0,50}?(\d{6})\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      // 优先使用捕获组（match[1]），如果没有则使用整个匹配
      const rawCode = match[1] || match[0];
      if (!rawCode || typeof rawCode !== 'string') continue;

      // 提取其中的6位数字
      const sixDigitMatch = rawCode.match(/\d{6}/);
      if (!sixDigitMatch) continue;

      const code = sixDigitMatch[0];

      // 严格验证：必须是6位数字，且不在黑名单中
      if (!/^\d{6}$/.test(code) || !isValidCode(code)) continue;

      // 验证这个数字不在明显的非验证码上下文中
      const context = body.substring(
        Math.max(0, match.index! - 30),
        Math.min(body.length, match.index! + 30)
      );
      // 排除明显的时间戳、ID等
      if (
        /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(context) || // 日期格式
        /uid|id|message-id|message\s*id/i.test(context) || // ID相关
        /\d{10,}/.test(context)
      ) {
        // 长数字串（可能是时间戳）
        continue;
      }

      console.log(
        '[IMAP] Found verification code with pattern:',
        pattern.toString(),
        'code:',
        code
      );
      console.log('[IMAP] Context:', context.replace(/\s+/g, ' ').substring(0, 100));
      return code;
    }
  }

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
  startTime: number
): boolean {
  // 验证发送者
  if (!from || from.toLowerCase() !== POKEMONCENTER_EMAIL.toLowerCase()) {
    return false;
  }

  // 验证时间
  if (!sentDate) {
    return false;
  }

  // 使用 getTime() 获取 UTC 时间戳（毫秒），这是时区无关的
  // 这样可以确保在全球任意时区运行时都能正确比较时间
  const sentTimestamp = sentDate.getTime();
  const nowTimestamp = now.getTime();
  
  // 关键验证：邮件的发送时间必须 >= startTime（不允许使用旧邮件）
  // 使用时间戳比较，完全时区无关
  // 这是最重要的验证：确保不会使用在开始查询之前发送的旧邮件
  if (sentTimestamp < startTime) {
    const sentDateISO = sentDate.toISOString();
    const startTimeISO = new Date(startTime).toISOString();
    const timeDiff = Math.round((startTime - sentTimestamp) / 1000);
    console.log(
      `[IMAP] 拒绝旧邮件：邮件发送时间 ${sentDateISO} (UTC) 早于开始查询时间 ${startTimeISO} (UTC)，时间差: ${timeDiff}秒`
    );
    return false;
  }

  // 验证邮件发送时间是否在未来（可能是服务器时间不同步）
  // 如果发送时间在未来，允许但记录警告
  const emailAge = nowTimestamp - sentTimestamp;
  if (emailAge < 0) {
    const futureDiff = Math.round(Math.abs(emailAge) / 1000);
    console.log(
      `[IMAP] 警告：邮件发送时间 ${sentDate.toISOString()} 在未来 ${futureDiff}秒，可能是服务器时间不同步，但仍接受此邮件`
    );
  }

  // 注意：不需要检查邮件年龄是否超过 EMAIL_SEARCH_WINDOW_MS
  // 因为：
  // 1. IMAP 搜索已经过滤了接收时间（只搜索最近 5 分钟内接收的邮件）
  // 2. 发送时间 >= startTime 的验证已经确保了不是旧邮件
  // 3. 如果 startTime 是最近的时间，那么发送时间也应该是最近的

  return true;
}

/**
 * 从已连接的 IMAP 客户端获取邮件中的6位验证码
 * 严格限制：只处理来自 info@pokemoncenter-online.com 的邮件，且邮件发送时间必须在 startTime 之后
 * @param client 已连接的 ImapFlow 客户端
 * @param startTime 开始查询的时间戳（毫秒），只有在此时间之后发送的邮件才算有效
 * @returns 验证码字符串或 null
 */
async function fetchVerificationCodeWithClient(
  client: ImapFlow,
  startTime: number
): Promise<string | null> {
  // 打开收件箱
  const lock = await client.getMailboxLock('INBOX');
  const mailbox = client.mailbox;
  console.log(
    '[IMAP] Mailbox locked, total messages:',
    mailbox && typeof mailbox === 'object' ? mailbox.exists : 0
  );

  try {
    const now = new Date();
    const nowTimestamp = now.getTime();
    
    // 搜索窗口：从当前时间往前推 5 分钟
    // 重要：只搜索最近 5 分钟内接收到的邮件，但验证时会确保邮件的发送时间 >= startTime（不允许使用旧邮件）
    const searchWindowStart = nowTimestamp - EMAIL_SEARCH_WINDOW_MS;
    const timeWindowStart = new Date(searchWindowStart);

    console.log('[IMAP] 邮件查询参数:');
    console.log('[IMAP]   StartTime (开始查询时间 UTC):', new Date(startTime).toISOString());
    console.log('[IMAP]   Current time (当前时间 UTC):', now.toISOString());
    console.log('[IMAP]   Search window start (搜索窗口起始，从当前时间往前推5分钟):', timeWindowStart.toISOString());
    console.log(
      `[IMAP]   Search window: last ${EMAIL_SEARCH_WINDOW_MS / 1000} seconds (received time)`
    );
    console.log('[IMAP]   注意：只接受发送时间 >= startTime 的邮件（不允许使用旧邮件）');

    // 使用 IMAP SEARCH 命令搜索指定时间范围内的邮件
    // 注意：
    // 1. IMAP的since是基于邮件的接收时间（internaldate），而不是发送时间
    // 2. 我们只搜索最近 5 分钟内接收到的邮件
    // 3. 在后续验证中，我们会使用邮件的发送时间（sentDate）进行精确的时间戳比较（时区无关）
    // 4. 确保邮件的发送时间 >= startTime，不允许使用旧邮件
    const uids = await client.search({ since: timeWindowStart }, { uid: true });
    console.log('[IMAP] Found UIDs (before filtering):', uids);

    if (!uids || uids.length === 0) {
      console.log(
        `[IMAP] No emails found in search window (since ${timeWindowStart.toISOString()})`
      );
      return null;
    }

    // 按 UID 倒序排列（最新的优先），遍历所有邮件找到第一个有效的
    uids.sort((a, b) => b - a);

    // 遍历所有邮件，找到第一个符合要求的（发送时间 >= startTime）
    for (const uid of uids) {
      try {
        // 先只获取邮件头（envelope），用于验证发送者和时间
        const messageHeader = await client.fetchOne(
          String(uid),
          {
            envelope: true,
          },
          { uid: true }
        );

        if (!messageHeader || !messageHeader.envelope) {
          console.log(`[IMAP] Failed to fetch email header for UID: ${uid}`);
          continue;
        }

        const envelope = messageHeader.envelope;
        const subject = envelope?.subject?.[0] || '';
        const from = envelope?.from?.[0]?.address || '';
        const sentDate = envelope?.date ? new Date(envelope.date) : null;

        console.log(`[IMAP] Checking email UID ${uid}:`);
        console.log('[IMAP]   Subject:', subject);
        console.log('[IMAP]   From:', from);
        console.log('[IMAP]   Sent Date:', sentDate?.toISOString() || 'unknown');

        // 验证邮件是否符合要求（包括发送时间 >= startTime）
        // 注意：isValidEmail 内部使用 UTC 时间戳进行比较，完全时区无关
        if (!isValidEmail(from, sentDate, now, startTime)) {
          const emailAge = sentDate
            ? Math.round((nowTimestamp - sentDate.getTime()) / 1000)
            : 'unknown';
          const sentTimestamp = sentDate ? sentDate.getTime() : null;
          const timeDiff = sentTimestamp && sentTimestamp < startTime
            ? Math.round((startTime - sentTimestamp) / 1000)
            : null;
          console.log(
            `[IMAP]   Email validation failed. From: ${from}, Age: ${emailAge}s, Sent: ${sentDate?.toISOString() || 'unknown'} (UTC)${timeDiff ? `, 早于开始时间 ${timeDiff}秒` : ''}`
          );
          continue; // 继续检查下一个邮件
        }

        const sentTimestamp = sentDate.getTime();
        const timeDiff = Math.round((sentTimestamp - startTime) / 1000);
        console.log(
          `[IMAP]   Email passed all validations (sent ${timeDiff}秒 after ${new Date(startTime).toISOString()} (UTC), from Pokemon Center)`
        );
        console.log('[IMAP]   Now fetching email body...');

        // 验证通过后，才读取邮件正文
        const messageBody = await client.fetchOne(
          String(uid),
          {
            source: true,
          },
          { uid: true }
        );

        if (!messageBody || !messageBody.source) {
          console.log(`[IMAP] Failed to fetch email body for UID: ${uid}`);
          continue;
        }

        const source = messageBody.source.toString();
        console.log('[IMAP]   Content length:', source.length);

        // 使用更精确的验证码提取函数
        const code = extractVerificationCode(source);
        if (code) {
          console.log('[IMAP] Found valid verification code:', code, 'from email:', subject);
          return code;
        } else {
          console.log(`[IMAP]   No verification code found in email UID ${uid}`);
          continue; // 继续检查下一个邮件
        }
      } catch (fetchErr) {
        console.error(`[IMAP] Error fetching message UID ${uid}:`, fetchErr);
        continue; // 继续检查下一个邮件
      }
    }

    // 所有邮件都检查完毕，没有找到有效的验证码
    console.log('[IMAP] No valid verification code found in any email');
    return null;
  } finally {
    lock.release();
    console.log('[IMAP] Mailbox lock released');
  }
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
export function registerGetMail2FAHandler(ipcMain: typeof import('electron').ipcMain) {
  ipcMain.handle(
    'get-mail-2fa',
    async (_event, loginId?: string, startTime?: number) => {
      const normalizedLoginId = normalizeEmail(loginId);

      if (!normalizedLoginId) {
        throw new Error('loginId is required');
      }

      // 如果没有提供 startTime，使用当前时间
      // 如果提供了 startTime，确保它是有效的时间戳
      const queryStartTime = startTime && startTime > 0 ? startTime : Date.now();
      const queryStartDate = new Date(queryStartTime);

      console.log(`[get-mail-2fa] 查找账号: ${normalizedLoginId}`);
      console.log(
        `[get-mail-2fa] 开始查询时间: ${queryStartDate.toISOString()} (timestamp: ${queryStartTime})`
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

      console.log(`[get-mail-2fa] IMAP 配置: ${codeMail} @ ${imapHost}:${imapPort}`);

      const requestTime = new Date();
      console.log(`[get-mail-2fa] 请求时间: ${requestTime.toISOString()}`);
      console.log(
        `[get-mail-2fa] 开始轮询获取验证码，每 ${
          POLL_INTERVAL_MS / 1000
        }秒 一次，共 ${MAX_POLL_ATTEMPTS} 次（总计 ${TOTAL_TIMEOUT_MS / 1000}秒）`
      );
      console.log(
        `[get-mail-2fa] 只接受在 ${queryStartDate.toISOString()} 之后发送的邮件`
      );

      // 创建 IMAP 客户端并连接（只连接一次）
      const client = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: useTls,
        auth: {
          user: codeMail,
          pass: smtpPassword,
        },
        logger: false, // 禁用内置日志
        tls: {
          rejectUnauthorized: false,
        },
      });

      try {
        // 在轮询开始前连接一次
        await client.connect();
        console.log('[get-mail-2fa] IMAP 连接成功，开始轮询...');

        // 轮询过程中复用同一个连接
        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
          try {
            const elapsed = Math.round((Date.now() - requestTime.getTime()) / 1000);
            console.log(
              `[get-mail-2fa] Attempt ${attempt}/${MAX_POLL_ATTEMPTS} (已用时: ${elapsed}秒)...`
            );

            // 检查连接状态，如果断开则重连
            if (!client.authenticated) {
              console.log('[get-mail-2fa] 连接已断开，尝试重连...');
              try {
                await client.connect();
                console.log('[get-mail-2fa] 重连成功');
              } catch (reconnectErr: unknown) {
                const error = reconnectErr as Error;
                console.error('[get-mail-2fa] 重连失败:', error.message);
                throw reconnectErr;
              }
            }

            // 传入 startTime，确保只接受在此时间之后发送的邮件
            const code = await fetchVerificationCodeWithClient(client, queryStartTime);
            if (code) {
              console.log(`[get-mail-2fa] Found valid code: ${code}`);
              return code;
            }

            console.log(
              `[get-mail-2fa] No valid code found (邮件发送时间必须 >= ${queryStartDate.toISOString()})`
            );

            // 如果不是最后一次尝试，等待后继续
            if (attempt < MAX_POLL_ATTEMPTS) {
              console.log(`[get-mail-2fa] Waiting ${POLL_INTERVAL_MS / 1000}s before next attempt...`);
              await sleep(POLL_INTERVAL_MS);
            }
          } catch (error: unknown) {
            const err = error as Error;
            console.error(`[get-mail-2fa] Attempt ${attempt} failed:`, err.message);
            // 如果是连接错误，尝试重连
            if (
              err.message?.includes('connection') ||
              err.message?.includes('socket') ||
              !client.authenticated
            ) {
              console.log('[get-mail-2fa] 检测到连接问题，尝试重连...');
              try {
                await client.connect();
                console.log('[get-mail-2fa] 重连成功，继续轮询');
                // 重连成功后，如果不是最后一次尝试，等待后继续
                if (attempt < MAX_POLL_ATTEMPTS) {
                  await sleep(POLL_INTERVAL_MS);
                }
                continue;
              } catch (reconnectErr: unknown) {
                const reconnectError = reconnectErr as Error;
                console.error('[get-mail-2fa] 重连失败:', reconnectError.message);
                if (attempt === MAX_POLL_ATTEMPTS) {
                  throw reconnectErr;
                }
                await sleep(POLL_INTERVAL_MS);
                continue;
              }
            }
            if (attempt === MAX_POLL_ATTEMPTS) {
              throw error;
            }
            await sleep(POLL_INTERVAL_MS);
          }
        }

        console.log(
          `[get-mail-2fa] Timeout: No valid verification code found within ${
            TOTAL_TIMEOUT_MS / 1000
          } seconds (${MAX_POLL_ATTEMPTS} attempts, ${POLL_INTERVAL_MS / 1000}s interval)`
        );
        return null;
      } catch (error) {
        console.error('[get-mail-2fa] 连接错误:', error);
        throw error;
      } finally {
        // 轮询结束后断开连接
        try {
          await client.logout();
          console.log('[get-mail-2fa] IMAP 连接已断开');
        } catch (logoutErr) {
          // 忽略登出错误
          console.log('[get-mail-2fa] 登出时出错（已忽略）:', logoutErr);
        }
      }
    }
  );
}

