// 2Captcha 配置
export const TWO_CAPTCHA_API_KEY = 'a7898708aca9afc902ae285d3ab6aadc';
export const TWO_CAPTCHA_CAPMONSTER_API_KEY = 'dfe24e37bf55f241992f71e566070598';
export const POKEMONCENTER_RECAPTCHA_WEBSITE_KEY = '6Le9HlYqAAAAAJQtQcq3V_tdd73twiM4Rm2wUvn9';

// 邮件验证码配置
export const POKEMONCENTER_EMAIL = 'info@pokemoncenter-online.com';
export const EMAIL_SEARCH_WINDOW_MS = 120 * 1000; // 120秒（2分钟）
export const POLL_INTERVAL_MS = 5 * 1000; // 5秒
export const MAX_POLL_ATTEMPTS = 24; // 24次（2分钟 = 120秒 / 5秒 = 24次）
export const TOTAL_TIMEOUT_MS = MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS; // 120秒

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

