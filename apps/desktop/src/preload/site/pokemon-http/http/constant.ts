export const TWO_CAPTCHA_API_KEY = "a7898708aca9afc902ae285d3ab6aadc";
export const TWO_CAPTCHA_CAPMONSTER_API_KEY = "dfe24e37bf55f241992f71e566070598";

export const SSO_KEY = '4_7NiPOgzmAtCo0ZGg-re9lg'

export const POKEMONCENTER_RECAPTCHA_WEBSITE_KEY =
  "6Le9HlYqAAAAAJQtQcq3V_tdd73twiM4Rm2wUvn9";

export const POKEMONCENTER_HOST_URL = "https://www.pokemoncenter-online.com";
export const POKEMONCENTER_API_URL = `https://id.pokemoncenter-online.com`;

export const GIGYA_API_KEY = "4_PlmTwFRPUWmTpGqjm31WOQ";

export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0'

export const DEFAULT_POKEMONCENTER_REQUEST_CONFIG = {
  headers: {
    accept: "*/*",
    "accept-language": "ja",
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
};

export const BASE_DOMAIN_URLS = {
  LOGIN: `${POKEMONCENTER_HOST_URL}/login/`,
  MAIL_LOGIN: `${POKEMONCENTER_HOST_URL}/login-mfa/`,
  FACTOR2_AUTH: `${POKEMONCENTER_HOST_URL}/on/demandware.store/Sites-POL-Site/ja_JP/Factor2Auth-Generate`,
  LARKBILEOMET_JS: `${POKEMONCENTER_HOST_URL}/larkbileomet.js?single`,
};

export const BASE_ID_DOMAIN_API_URLS = {
  LOGIN: `${POKEMONCENTER_API_URL}/accounts.login`,
  ACCOUNT_WEB_SDK_BOOTSTRAP: `${POKEMONCENTER_API_URL}/accounts.webSdkBootstrap`,
  SSO: `${POKEMONCENTER_API_URL}/js/sso.htm`,
  TFA: `${POKEMONCENTER_API_URL}/accounts.tfa.initTFA`,
};

export const PROXY_URLS = [
  "outou:719@133.242.227.152:4444",
  "outou:719@153.125.131.122:4444",
];

export const PROXY_INDEX = 1;

