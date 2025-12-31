// reCAPTCHA 网站密钥（固定值，不需要配置）
export const POKEMONCENTER_RECAPTCHA_WEBSITE_KEY = '6Le9HlYqAAAAAJQtQcq3V_tdd73twiM4Rm2wUvn9';

// 邮件验证码配置
export const POKEMONCENTER_EMAIL = 'info@pokemoncenter-online.com';
export const EMAIL_SEARCH_WINDOW_MS = 5 * 60 * 1000; // 5分钟（300秒）
export const POLL_INTERVAL_MS = 5 * 1000; // 5秒
export const MAX_POLL_ATTEMPTS = 60; // 60次（5分钟 = 300秒 / 5秒 = 60次）
export const TOTAL_TIMEOUT_MS = MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS; // 300秒（5分钟）

// 验证码黑名单 - 这些验证码会被忽略
export const CODE_BLACKLIST = new Set([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '654321',
]);

