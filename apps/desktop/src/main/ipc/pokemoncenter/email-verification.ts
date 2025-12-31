import { ImapFlow } from 'imapflow';
import {
  POKEMONCENTER_EMAIL,
  EMAIL_SEARCH_WINDOW_MS,
  POLL_INTERVAL_MS,
  TOTAL_TIMEOUT_MS,
  CODE_BLACKLIST,
  MAX_EMAILS_TO_CHECK,
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
 * 支持纯文本和HTML格式的邮件
 *
 * Pokemon Center 邮件格式：
 * ログイン用パスコードをお知らせします。パスコード入力画面に下記のコードを入力してください。
 */
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
    console.log('[IMAP] Extracted text from HTML email, length:', textContent.length);
  } else {
    // 移除邮件头部分，只搜索邮件正文
    const bodyStart = emailContent.indexOf('\r\n\r\n') || emailContent.indexOf('\n\n');
    textContent = bodyStart > 0 ? emailContent.substring(bodyStart) : emailContent;
  }

  // 记录邮件内容的前500个字符用于调试
  const preview = textContent.substring(0, 500).replace(/\s+/g, ' ');
  console.log('[IMAP] Email content preview (first 500 chars):', preview);

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
    // 更宽松的模式：查找所有6位连续数字（作为最后手段）
    /\b(\d{6})\b/g,
  ];

  for (const pattern of patterns) {
    // 重置正则表达式的lastIndex
    pattern.lastIndex = 0;
    
    for (const match of textContent.matchAll(pattern)) {
      // 优先使用捕获组（match[1]），如果没有则使用整个匹配
      const rawCode = match[1] || match[0];
      if (!rawCode || typeof rawCode !== 'string') continue;

      // 提取其中的6位数字
      const sixDigitMatch = rawCode.match(/\d{6}/);
      if (!sixDigitMatch) continue;

      const code = sixDigitMatch[0];

      // 严格验证：必须是6位数字，且不在黑名单中
      if (!/^\d{6}$/.test(code) || !isValidCode(code)) {
        console.log(`[IMAP] Skipping code ${code} (blacklisted or invalid)`);
        continue;
      }

      // 验证这个数字不在明显的非验证码上下文中
      const context = textContent.substring(
        Math.max(0, match.index! - 50),
        Math.min(textContent.length, match.index! + 50)
      );
      
      // 排除明显的时间戳、ID等（但如果是最后一个模式，放宽检查）
      const isLastPattern = pattern === patterns[patterns.length - 1];
      if (!isLastPattern) {
        if (
          /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(context) || // 日期格式
          /uid|id|message-id|message\s*id/i.test(context) || // ID相关
          /\d{10,}/.test(context) // 长数字串（可能是时间戳）
        ) {
          console.log(`[IMAP] Skipping code ${code} (appears to be in non-code context)`);
          continue;
        }
      }

      console.log(
        '[IMAP] Found verification code with pattern:',
        pattern.toString(),
        'code:',
        code
      );
      console.log('[IMAP] Context:', context.replace(/\s+/g, ' ').substring(0, 150));
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
  startTime: number
): boolean {
  // 验证发送者 - 放宽验证：允许包含 "pokemoncenter" 的邮件地址
  if (!from) {
    console.log('[IMAP] 邮件验证失败：没有发送者信息');
    return false;
  }
  
  const fromLower = from.toLowerCase();
  const expectedEmailLower = POKEMONCENTER_EMAIL.toLowerCase();
  
  // 允许完全匹配或包含 pokemoncenter 的邮件
  if (fromLower !== expectedEmailLower && !fromLower.includes('pokemoncenter')) {
    console.log(`[IMAP] 邮件验证失败：发送者 ${from} 不匹配 Pokemon Center (期望: ${POKEMONCENTER_EMAIL})`);
    return false;
  }
  
  // 如果发送者匹配，记录日志
  if (fromLower !== expectedEmailLower) {
    console.log(`[IMAP] 发送者匹配（宽松模式）: ${from} (期望: ${POKEMONCENTER_EMAIL})`);
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
      `[IMAP] 拒绝旧邮件：邮件发送时间 ${sentDateISO} (UTC) 早于开始查询时间 ${startTimeISO} (UTC)，时间差: ${timeDiff}秒（超过30秒容差）`
    );
    return false;
  }
  
  // 如果邮件在容差范围内（startTime 之前30秒内），记录警告但仍接受
  if (sentTimestamp < startTime) {
    const timeDiff = Math.round((startTime - sentTimestamp) / 1000);
    console.log(
      `[IMAP] ⚠️ 警告：邮件发送时间早于开始查询时间 ${timeDiff}秒，但在30秒容差内，仍接受此邮件`
    );
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

  // 额外的安全检查：如果邮件发送时间距离现在超过 10 分钟，拒绝
  // 这可以防止因为时间戳错误而接受过旧的邮件
  // 即使发送时间 >= startTime，如果邮件太旧，也可能是时间戳错误
  const maxEmailAgeMs = 10 * 60 * 1000; // 10 分钟
  if (emailAge > maxEmailAgeMs) {
    const ageSeconds = Math.round(emailAge / 1000);
    const maxAgeSeconds = Math.round(maxEmailAgeMs / 1000);
    console.log(
      `[IMAP] 拒绝：邮件发送时间 ${sentDate.toISOString()} 距离现在 ${ageSeconds}秒，超过最大允许年龄 ${maxAgeSeconds}秒，可能是时间戳错误`
    );
    return false;
  }

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

    console.log('[IMAP] 邮件查询参数:');
    console.log('[IMAP]   StartTime (开始查询时间 UTC):', new Date(startTime).toISOString());
    console.log('[IMAP]   Current time (当前时间 UTC):', now.toISOString());
    console.log('[IMAP]   策略：只获取最新的一封邮件，使用 UTC 时间戳比较（时区无关）');
    console.log('[IMAP]   只接受发送时间 >= startTime 的邮件（不允许使用旧邮件）');

    // 策略：不依赖 IMAP 服务器的时间过滤（避免时区问题）
    // 直接获取最新的一封邮件，然后使用 UTC 时间戳进行精确过滤
    // 这样可以完全避免时区问题，因为所有时间比较都使用 UTC 时间戳（毫秒）
    
    // 获取最新的邮件 UID 列表（不指定时间范围，避免时区问题）
    // 使用空搜索条件获取所有邮件，然后按 UID 排序取最新的一封
    const allUids = await client.search({}, { uid: true });
    console.log(`[IMAP] Total emails in mailbox: ${allUids ? allUids.length : 0}`);

    if (!allUids || allUids.length === 0) {
      console.log('[IMAP] No emails found in mailbox');
      return null;
    }

    // 按 UID 倒序排列（最新的优先），只取最新的一封邮件
    allUids.sort((a, b) => b - a);
    const uids = allUids.slice(0, 1);
    console.log(`[IMAP] Checking latest email (UID: ${uids[0]})`);

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
        
        // 解析邮件发送时间
        // envelope.date 可能是 Date 对象或时间戳，确保转换为 Date 对象
        let sentDate: Date | null = null;
        if (envelope?.date) {
          if (envelope.date instanceof Date) {
            sentDate = envelope.date;
          } else if (typeof envelope.date === 'number') {
            sentDate = new Date(envelope.date);
          } else if (typeof envelope.date === 'string') {
            sentDate = new Date(envelope.date);
          }
        }

        console.log(`[IMAP] Checking email UID ${uid}:`);
        console.log('[IMAP]   Subject:', subject);
        console.log('[IMAP]   From:', from);
        if (sentDate) {
          const sentTimestamp = sentDate.getTime();
          const sentDateISO = sentDate.toISOString();
          const startTimeISO = new Date(startTime).toISOString();
          const timeDiff = sentTimestamp - startTime;
          console.log('[IMAP]   Sent Date (UTC):', sentDateISO);
          console.log('[IMAP]   Sent Timestamp (UTC ms):', sentTimestamp);
          console.log('[IMAP]   StartTime (UTC):', startTimeISO);
          console.log('[IMAP]   StartTime Timestamp (UTC ms):', startTime);
          console.log('[IMAP]   Time difference:', timeDiff >= 0 ? `+${Math.round(timeDiff / 1000)}秒` : `${Math.round(timeDiff / 1000)}秒`);
        } else {
          console.log('[IMAP]   Sent Date: unknown (no date in envelope)');
        }

        // 验证邮件是否符合要求（包括发送时间 >= startTime）
        // 注意：isValidEmail 内部使用 UTC 时间戳进行比较，完全时区无关
        console.log('[IMAP]   开始验证邮件...');
        const isValid = isValidEmail(from, sentDate, now, startTime);
        if (!isValid) {
          const emailAge = sentDate
            ? Math.round((nowTimestamp - sentDate.getTime()) / 1000)
            : 'unknown';
          const sentTimestamp = sentDate ? sentDate.getTime() : null;
          const timeDiff = sentTimestamp && sentTimestamp < startTime
            ? Math.round((startTime - sentTimestamp) / 1000)
            : null;
          const fromMatch = from && (from.toLowerCase().includes('pokemon') || from.toLowerCase().includes('pokemoncenter'));
          console.log(
            `[IMAP]   ❌ Email validation failed. From: ${from}${fromMatch ? ' (contains pokemon)' : ''}, Age: ${emailAge}s, Sent: ${sentDate?.toISOString() || 'unknown'} (UTC)${timeDiff ? `, 早于开始时间 ${timeDiff}秒` : ''}`
          );
          // 如果发送者匹配但时间不匹配，记录详细信息以便调试
          if (fromMatch && timeDiff) {
            console.log(`[IMAP]   ⚠️  Found Pokemon Center email but time validation failed (sent ${Math.abs(timeDiff)}s ${timeDiff > 0 ? 'before' : 'after'} startTime)`);
          }
          continue; // 继续检查下一个邮件
        }
        
        console.log('[IMAP]   ✅ Email validation passed!');

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
        console.log('[IMAP]   Content type check (HTML/Text):', source.includes('<html') || source.includes('<HTML') ? 'HTML' : 'Text');

        // 使用更精确的验证码提取函数
        const code = extractVerificationCode(source);
        if (code) {
          console.log('[IMAP] ✅ Found valid verification code:', code, 'from email:', subject);
          return code;
        } else {
          console.log(`[IMAP]   ❌ No verification code found in email UID ${uid}, Subject: ${subject}`);
          // 如果是从Pokemon Center来的邮件但没找到验证码，记录更多信息
          if (from && from.toLowerCase().includes('pokemon')) {
            console.log(`[IMAP]   ⚠️  This is a Pokemon Center email but no code extracted. Please check the email format.`);
          }
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

      const requestTime = Date.now();
      const requestTimeDate = new Date(requestTime);
      console.log(`[get-mail-2fa] 请求时间: ${requestTimeDate.toISOString()}`);
      console.log(
        `[get-mail-2fa] 开始轮询获取验证码，每 ${
          POLL_INTERVAL_MS / 1000
        }秒 一次，总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒（基于时间，自动计算轮询次数）`
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

        // 基于时间的轮询：持续轮询直到超时或找到验证码
        let attempt = 0;
        while (true) {
          attempt++;
          try {
            const now = Date.now();
            const elapsed = Math.round((now - requestTime) / 1000);
            const remaining = Math.round((TOTAL_TIMEOUT_MS - (now - requestTime)) / 1000);
            
            // 检查是否超时
            if (now - requestTime >= TOTAL_TIMEOUT_MS) {
              console.log(
                `[get-mail-2fa] Timeout: 已用时 ${elapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
              );
              return null;
            }

            console.log(
              `[get-mail-2fa] Attempt ${attempt} (已用时: ${elapsed}秒, 剩余: ${remaining}秒)...`
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
              const totalElapsed = Math.round((Date.now() - requestTime) / 1000);
              console.log(`[get-mail-2fa] ✅ Found valid code: ${code} (总用时: ${totalElapsed}秒)`);
              return code;
            }

            console.log(
              `[get-mail-2fa] No valid code found (邮件发送时间必须 >= ${queryStartDate.toISOString()})`
            );

            // 检查是否还有剩余时间
            const timeAfterCheck = Date.now();
            const remainingAfterCheck = TOTAL_TIMEOUT_MS - (timeAfterCheck - requestTime);
            
            if (remainingAfterCheck <= 0) {
              const totalElapsed = Math.round((timeAfterCheck - requestTime) / 1000);
              console.log(
                `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
              );
              return null;
            }

            // 计算等待时间：取轮询间隔和剩余时间中的较小值
            const waitTime = Math.min(POLL_INTERVAL_MS, remainingAfterCheck);
            if (waitTime > 0) {
              console.log(`[get-mail-2fa] Waiting ${Math.round(waitTime / 1000)}s before next attempt...`);
              await sleep(waitTime);
            } else {
              // 没有剩余时间了，直接返回
              const totalElapsed = Math.round((Date.now() - requestTime) / 1000);
              console.log(
                `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
              );
              return null;
            }
          } catch (error: unknown) {
            const err = error as Error;
            console.error(`[get-mail-2fa] Attempt ${attempt} failed:`, err.message);
            
            // 检查是否超时
            const now = Date.now();
            if (now - requestTime >= TOTAL_TIMEOUT_MS) {
              const totalElapsed = Math.round((now - requestTime) / 1000);
              console.log(
                `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
              );
              return null;
            }
            
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
                
                // 检查是否还有剩余时间
                const timeAfterReconnect = Date.now();
                const remainingAfterReconnect = TOTAL_TIMEOUT_MS - (timeAfterReconnect - requestTime);
                if (remainingAfterReconnect <= 0) {
                  const totalElapsed = Math.round((timeAfterReconnect - requestTime) / 1000);
                  console.log(
                    `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
                  );
                  return null;
                }
                
                // 计算等待时间
                const waitTime = Math.min(POLL_INTERVAL_MS, remainingAfterReconnect);
                if (waitTime > 0) {
                  await sleep(waitTime);
                }
                continue;
              } catch (reconnectErr: unknown) {
                const reconnectError = reconnectErr as Error;
                console.error('[get-mail-2fa] 重连失败:', reconnectError.message);
                
                // 检查是否超时
                const timeAfterReconnectFail = Date.now();
                if (timeAfterReconnectFail - requestTime >= TOTAL_TIMEOUT_MS) {
                  const totalElapsed = Math.round((timeAfterReconnectFail - requestTime) / 1000);
                  console.log(
                    `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
                  );
                  return null;
                }
                
                const waitTime = Math.min(POLL_INTERVAL_MS, TOTAL_TIMEOUT_MS - (timeAfterReconnectFail - requestTime));
                if (waitTime > 0) {
                  await sleep(waitTime);
                }
                continue;
              }
            }
            
            // 其他错误，等待后继续（如果还有时间）
            const timeAfterError = Date.now();
            const remainingAfterError = TOTAL_TIMEOUT_MS - (timeAfterError - requestTime);
            if (remainingAfterError <= 0) {
              const totalElapsed = Math.round((timeAfterError - requestTime) / 1000);
              console.log(
                `[get-mail-2fa] Timeout: 已用时 ${totalElapsed}秒，超过总超时时间 ${TOTAL_TIMEOUT_MS / 1000}秒`
              );
              return null;
            }
            
            const waitTime = Math.min(POLL_INTERVAL_MS, remainingAfterError);
            if (waitTime > 0) {
              await sleep(waitTime);
            }
          }
        }
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

