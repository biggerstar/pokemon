import { ipcMain } from 'electron';
import {
  CapMonsterCloudClientFactory,
  ClientOptions,
  RecaptchaV3ProxylessRequest,
} from '@zennolab_com/capmonstercloud-client';
import { Solver } from '@2captcha/captcha-solver';
import {
  TWO_CAPTCHA_API_KEY,
  TWO_CAPTCHA_CAPMONSTER_API_KEY,
  POKEMONCENTER_RECAPTCHA_WEBSITE_KEY,
} from './config';

export function registerCaptchaSolverHandlers(ipcMain: typeof import('electron').ipcMain) {
  /**
   * 解析 reCAPTCHA v3 验证码（使用 CapMonster）
   * @param pageUrl 当前页面 URL
   * @returns 验证码 token
   */
  ipcMain.handle('resolve-recaptcha', async (_event, pageUrl: string) => {
    console.log('[resolve-recaptcha] 开始解析验证码, pageUrl:', pageUrl);

    try {
      const cmcClient = CapMonsterCloudClientFactory.Create(
        new ClientOptions({ clientKey: TWO_CAPTCHA_CAPMONSTER_API_KEY })
      );

      const recaptchaV3ProxylessRequest = new RecaptchaV3ProxylessRequest({
        websiteURL: pageUrl,
        websiteKey: POKEMONCENTER_RECAPTCHA_WEBSITE_KEY,
        minScore: 0.9,
      });

      const result = await cmcClient.Solve(recaptchaV3ProxylessRequest);
      const token = result.solution?.gRecaptchaResponse || '';

      console.log(
        '[resolve-recaptcha] 验证码解析成功, token:',
        token ? `${token.substring(0, 30)}...` : '(empty)'
      );

      return token;
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[resolve-recaptcha] 验证码解析失败:', err.message);
      throw new Error(`Failed to resolve recaptcha: ${err.message}`);
    }
  });

  /**
   * 统一的验证码解析接口，支持选择不同的服务
   * @param pageUrl 当前页面 URL
   * @param service 服务类型: 'capmonster' | '2captcha'，默认为 'capmonster'
   * @returns 验证码 token
   */
  ipcMain.handle(
    'resolve-recaptcha-unified',
    async (_event, pageUrl: string, service: 'capmonster' | '2captcha' = 'capmonster') => {
      console.log(
        `[resolve-recaptcha-unified] 开始解析验证码, pageUrl: ${pageUrl}, service: ${service}`
      );

      try {
        if (service === '2captcha') {
          const captchaSolver = new Solver(TWO_CAPTCHA_API_KEY);

          const result = await captchaSolver.recaptcha({
            pageurl: pageUrl,
            googlekey: POKEMONCENTER_RECAPTCHA_WEBSITE_KEY,
            version: 'v3',
            min_score: 0.9,
            enterprise: 1,
          });

          // 处理不同的返回格式：可能是字符串或对象包含 data 字段
          const token = typeof result === 'string' ? result : result?.data || '';

          console.log(
            '[resolve-recaptcha-unified] 2captcha 验证码解析成功, token:',
            token ? `${token.substring(0, 30)}...` : '(empty)'
          );

          return token;
        } else {
          // 默认使用 CapMonster
          const cmcClient = CapMonsterCloudClientFactory.Create(
            new ClientOptions({ clientKey: TWO_CAPTCHA_CAPMONSTER_API_KEY })
          );

          const recaptchaV3ProxylessRequest = new RecaptchaV3ProxylessRequest({
            websiteURL: pageUrl,
            websiteKey: POKEMONCENTER_RECAPTCHA_WEBSITE_KEY,
            minScore: 0.9,
          });

          const result = await cmcClient.Solve(recaptchaV3ProxylessRequest);
          const token = result.solution?.gRecaptchaResponse || '';

          console.log(
            '[resolve-recaptcha-unified] CapMonster 验证码解析成功, token:',
            token ? `${token.substring(0, 30)}...` : '(empty)'
          );

          return token;
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`[resolve-recaptcha-unified] 验证码解析失败 (${service}):`, err.message);
        throw new Error(`Failed to resolve recaptcha with ${service}: ${err.message}`);
      }
    }
  );
}

