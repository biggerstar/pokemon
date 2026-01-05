// reCAPTCHA 网站密钥（固定值，不需要配置）
export const POKEMONCENTER_RECAPTCHA_WEBSITE_KEY = '6Le9HlYqAAAAAJQtQcq3V_tdd73twiM4Rm2wUvn9';

// 邮件验证码配置
export const POKEMONCENTER_EMAIL = 'info@pokemoncenter-online.com';
export const EMAIL_SEARCH_WINDOW_MS = 5 * 60 * 1000; // 5分钟（300秒）
export const POLL_INTERVAL_MS = 5 * 1000; // 5秒
export const TOTAL_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟（300秒）- 总超时时间，基于时间而非次数
export const MAX_EMAILS_TO_CHECK = 30;
export const POKEMONCENTER_COOKIE_DOMAINS = ['pokemoncenter-online.com', 'id.pokemoncenter-online.com'];
export const ALLOWED_SENDER_KEYWORDS = ['pokemoncenter', 'pokemon'];
export const ALLOWED_SUBJECT_KEYWORDS = ['パスコード', 'ログイン用パスコード', 'Factor2Auth', 'Verification Code'];
export const VERIFICATION_CODE_KEYWORDS = ['パスコード', 'ログイン用パスコード', '验证码', 'verification code', 'コード'];
export const VERIFICATION_CODE_LENGTH = 6;
export const EMAIL_TIME_TOLERANCE_MS = 30 * 1000;
export const MAX_EMAIL_AGE_MS = 10 * 60 * 1000;

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
