import {
  BASE_DOMAIN_URLS,
  BASE_ID_DOMAIN_API_URLS,
  DEFAULT_POKEMONCENTER_REQUEST_CONFIG,
  GIGYA_API_KEY,
  SSO_KEY,
} from './constant';
import axios, { AxiosInstance } from 'axios';
import { ipcRenderer } from 'electron';
import {
  AccountData,
  TaskManager,
} from '@/preload/site/pokemon-http/common/task-manager';
import jaconv from 'jaconv';
import { sleep } from '@/utils/time';

export class LoginClient {
  public axios: AxiosInstance;
  private username?: string;
  private password?: string;
  private captchaToken?: string;
  private regToken?: string;
  private uid?: string;
  private csrfToken?: string;
  private sdkBuild?: string = '18148';
  private gigyaAssertion?: string;
  private mail2AuthCode?: string;
  // ==================== 订单相关属性 ====================
  public taskInfo: AccountData;
  private dgftTokenApiKey?: string;
  private finalRegistrationToken?: string;
  private login_token?: string;
  private uidSig?: string;
  private uidSignature?: string;
  // ==================== 验证码缓存 ====================
  private usedMail2AuthCodes: Set<string> = new Set();

  constructor() {
    this.axios = axios.create({
      timeout: 12000,
      maxRedirects: 0,
      withCredentials: true,
      ...DEFAULT_POKEMONCENTER_REQUEST_CONFIG,
    });
    this.taskInfo = TaskManager.getData() ?? {};
    console.log('当前任务: ', this.taskInfo);
    if (!this.taskInfo.loginId || !this.taskInfo.loginPass) {
      throw new Error('当前任务没有指定账号信息');
    }
    this.regToken = localStorage.getItem('regToken') || '';
    this.uid = localStorage.getItem('uid') || '';
    this.login_token = localStorage.getItem('login_token') || '';
    this.uidSig = localStorage.getItem('uidSig') || '';
    this.uidSignature = localStorage.getItem('uidSignature') || '';
    this.dgftTokenApiKey = localStorage.getItem('dgftTokenApiKey') || '';
    this.setUsername(this.taskInfo.loginId);
    this.setPassword(this.taskInfo.loginPass);
  }

  /**
   * 设置 cookie（浏览器环境）
   * 注意：浏览器安全策略可能限制跨域 cookie 的设置
   */
  private setCookie(
    name: string,
    value: string,
    domain: string,
    path: string = '/',
  ) {
    // 在浏览器中，只能设置当前域名或父域名的 cookie
    // 如果 domain 以 . 开头，表示可以被子域名共享
    const cookieString = `${name}=${value}; path=${path}; domain=${domain}${location.protocol === 'https:' ? '; Secure' : ''}; SameSite=None`;
    document.cookie = cookieString;
  }

  public injectCookie() {
    // 设置 API 域名的 cookies
    this.setCookie(
      `apiDomain_${SSO_KEY}`,
      'id.pokemoncenter-online.com',
      '.pokemoncenter-online.com',
    );

    // 设置基础域名的 cookies
    this.setCookie(
      `gig_bootstrap_${GIGYA_API_KEY}`,
      'id_ver4',
      '.pokemoncenter-online.com',
    );
  }

  public setUsername(username: string) {
    this.username = username;
  }
  public setPassword(password: string) {
    this.password = password;
  }
  private setCaptchaToken(captchaToken: string) {
    this.captchaToken = captchaToken;
  }

  /**
   * 解析 reCAPTCHA 验证码
   * @param pageUrl 页面 URL
   * @param service 验证码服务类型: 'capmonster' | '2captcha'，默认为 'capmonster'
   * @returns 验证码 token
   */
  private async resolveCaptcha(
    pageUrl: string,
    service: 'capmonster' | '2captcha' = 'capmonster',
  ): Promise<string | null> {
    try {
      const captchaToken = await ipcRenderer.invoke(
        'resolve-recaptcha-unified',
        pageUrl,
        service,
      );
      return captchaToken || null;
    } catch (error: any) {
      console.error(`[resolveCaptcha] 验证码解析失败 (${service}):`, error);
      return null;
    }
  }

  private async visitLoginPage() {
    return this.axios
      .get(BASE_DOMAIN_URLS.LOGIN, { responseType: 'text' })
      .then((res) => {
        const html = res.data;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        this.csrfToken =
          doc
            .querySelector('input[name="csrf_token"]')
            ?.getAttribute('value') || this.csrfToken;
        return html;
      });
  }

  private async visitMailLoginPage() {
    return this.axios
      .get(BASE_DOMAIN_URLS.MAIL_LOGIN, { responseType: 'text' })
      .then((res) => {
        const html = res.data;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        this.csrfToken =
          doc
            .querySelector('input[name="csrf_token"]')
            ?.getAttribute('value') || this.csrfToken;
        return html;
      });
  }

  private async visitAccountWebSdkBootstrapApi() {
    return this.axios.get(BASE_ID_DOMAIN_API_URLS.ACCOUNT_WEB_SDK_BOOTSTRAP, {
      params: {
        apiKey: GIGYA_API_KEY,
        pageURL: BASE_DOMAIN_URLS.LOGIN,
        sdk: 'js_next',
        sdkBuild: this.sdkBuild,
        format: 'json',
      },
    });
    // .catch(() => { });
  }

  private async visitSSOPage() {
    return this.axios.get(BASE_ID_DOMAIN_API_URLS.SSO, {
      params: {
        APIKey: GIGYA_API_KEY,
        ssoSegment: '',
        version: 'next',
        build: this.sdkBuild,
        flavor: 'base',
      },
    });
    // .catch((error) => {
    //   console.error('[SSO API] 请求失败:', error);
    // });
  }

  /** 获得 hoPvmDpa cookie */
  private async visitLarkbileometJS() {
    return this.axios.get(BASE_DOMAIN_URLS.LARKBILEOMET_JS);
  }

  private isLoginSuccess(res: any) {
    return (
      res.data?.statusCode === 'OK' &&
      res.data?.statusCode === 200 &&
      !!res.data?.userInfo
    );
  }

  private async loginApi() {
    if (!this.username || !this.password || !this.captchaToken) {
      throw new Error('username, password, captchaToken are required');
    }
    const data = {
      loginID: this.username,
      password: this.password,
      sessionExpiration: '3600',
      targetEnv: 'jssdk',
      include: 'profile,data',
      includeUserInfo: 'true',
      captchaToken: this.captchaToken,
      captchaType: 'reCaptchaEnterpriseScore',
      lang: 'ja',
      APIKey: GIGYA_API_KEY,
      sdk: 'js_latest',
      authMode: 'cookie',
      pageURL: 'https://www.pokemoncenter-online.com/login/',
      sdkBuild: this.sdkBuild,
      format: 'json',
    };

    const formData = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    return this.axios
      .post(BASE_ID_DOMAIN_API_URLS.LOGIN, formData.toString(), {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
      .then((res) => {
        const { errorDetails, errorCode, errorMessage, regToken, UID } =
          res.data;
        console.log(res.data);
        if (this.isLoginSuccess(res)) {
          return 'ok';
        }
        if (!regToken) {
          // throw new Error(`登录失败: ReCaptcha 验证失败`);
          TaskManager.updateStatus(`登录失败: ReCaptcha 验证失败`)
          return false
        }
        if (errorCode !== 0 && errorCode !== 403101) {
          // throw new Error(`登录失败: ${errorDetails || errorMessage}`);
          TaskManager.updateStatus(`登录失败: ${errorDetails || errorMessage}`)
          return false;
        }
        console.info('regToken:', regToken);
        this.regToken = regToken;
        this.uid = UID;
        localStorage.setItem('regToken', regToken);
        localStorage.setItem('uid', UID);
        return '2fa';
      })
      .catch((error) => {
        console.error('[登录API] 请求失败:', error);
        throw error;
      });
  }

  private async initTFAApi() {
    if (!this.regToken) {
      throw new Error('regToken is required');
    }

    return this.axios
      .post(BASE_ID_DOMAIN_API_URLS.TFA, null, {
        params: {
          provider: 'gigyaEmail',
          mode: 'verify',
          regToken: this.regToken,
          APIKey: GIGYA_API_KEY,
          sdk: 'js_latest',
          pageURL: BASE_DOMAIN_URLS.LOGIN,
          sdkBuild: this.sdkBuild,
          format: 'json',
        },
      })
      .then((res) => {
        console.log(res.data);
        const { errorDetails, errorCode, errorMessage, gigyaAssertion } =
          res.data;
        if (errorCode !== 0) {
          throw new Error(`初始化 TFA 失败: ${errorDetails || errorMessage}`);
        }
        this.gigyaAssertion = gigyaAssertion;
        return true;
      })
      .catch((error) => {
        console.error('[TFA API] 请求失败:', error);
        throw error;
      });
  }

  private async factor2AuthApi() {
    if (!this.uid || !this.gigyaAssertion || !this.csrfToken) {
      throw new Error('uid, gigyaAssertion, csrfToken are required');
    }
    const data = {
      UID: this.uid,
      gigyaAssertion: this.gigyaAssertion,
      csrf_token: this.csrfToken,
    };

    return this.axios
      .request({
        url: BASE_DOMAIN_URLS.FACTOR2_AUTH,
        method: 'POST',
        params: {
          rurl: '1',
        },
        data: data,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      })
      .then((res) => {
        console.log('[认证] factor2AuthApi 响应:', res.data);
        return res;
      })
      .catch((error) => {
        console.error('[认证] factor2AuthApi 请求失败:', error);
        throw error;
      });
  }

  private async fetchMail2FaPage() {
    return fetch('https://www.pokemoncenter-online.com/login-mfa/?rurl=1', {
      headers: {
        'cache-control': 'max-age=0',
        'content-type': 'application/x-www-form-urlencoded',
        'x-uctiming-46938875': Math.floor(Date.now() / 1000).toString(),
      },
      referrer: 'https://www.pokemoncenter-online.com/login/',
      body: `csrf_token=${this.csrfToken}&apiUidSignatureUid=${this.uid}&regToken=${this.regToken}&loginemail=${this.username}&loginpass=${this.password}`,
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
    })
      .then((res) => res.text())
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        this.csrfToken =
          doc
            .querySelector('input[name="csrf_token"]')
            ?.getAttribute('value') || this.csrfToken;
        return html;
      });
  }

  private async mail2faApi() {
    if (!this.csrfToken || !this.uid || !this.regToken) {
      throw new Error('csrfToken, uid, regToken are required');
    }
    if (!this.mail2AuthCode) {
      throw new Error('mail2AuthCode is required');
    }
    return axios
      .request({
        url: 'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/Factor2Auth-Authentication',
        method: 'POST',
        params: {
          rurl: '1',
        },
        headers: {
          'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded;',
        },
        data: {
          mockModeFlg: 'false',
          csrf_token: this.csrfToken,
          apiUidSignatureUid: this.uid,
          regToken: this.regToken,
          dwfrm_factor2Auth_authCode: this.mail2AuthCode,
        },
      })
      .then((res) => {
        console.log('[邮件验证码] mail2faApi 响应:', res.data);
        return res.data.success === true && res.data.loggedin === true;
      })
      .catch((error) => {
        console.error('[邮件验证码] mail2faApi 请求失败:', error);
        throw error;
      });
  }

  /**
   * 获取新的邮件验证码（去重，避免使用已失效的验证码）
   * 默认只获取一次，如果获取到的验证码是已使用过的，才会重新获取一次
   * @returns 新的验证码，如果获取失败则返回 null
   */
  private async getNewMail2AuthCode(): Promise<string | null> {
    await TaskManager.updateStatus('[邮件验证码] 开始获取邮件验证码');

    // 记录开始查询的时间戳，只有在此时间之后发送的邮件才算有效
    const startTime = Date.now();
    const startTimeDate = new Date(startTime);
    console.log(
      `[邮件验证码] 开始查询时间: ${startTimeDate.toISOString()} (timestamp: ${startTime})`,
    );
    await TaskManager.updateStatus(
      `[邮件验证码] 开始查询，只接受 ${startTimeDate.toISOString()} 之后发送的邮件`,
    );

    // 第一次尝试获取，传入 startTime
    const firstCode = await ipcRenderer.invoke(
      'get-mail-2fa',
      this.username,
      startTime,
    );

    if (!firstCode) {
      await TaskManager.updateStatus('[邮件验证码] 获取失败，未获取到验证码');
      return null;
    }

    // 检查第一次获取的验证码是否已使用过
    if (!this.usedMail2AuthCodes.has(firstCode)) {
      // 获取到新的验证码
      this.usedMail2AuthCodes.add(firstCode);
      await TaskManager.updateStatus(
        `[邮件验证码] 获取成功，验证码: ${firstCode}`,
      );
      return firstCode;
    }

    // 如果第一次获取的验证码是已使用过的，再尝试一次
    // 注意：第二次查询时仍然使用相同的 startTime，确保不会获取到旧的验证码
    await TaskManager.updateStatus(
      '[邮件验证码] 获取到已使用的验证码，重新获取一次...',
    );
    const secondCode = await ipcRenderer.invoke(
      'get-mail-2fa',
      this.username,
      startTime,
    );

    if (!secondCode) {
      await TaskManager.updateStatus(
        '[邮件验证码] 重新获取失败，未获取到验证码',
      );
      return null;
    }

    // 检查第二次获取的验证码是否已使用过
    if (this.usedMail2AuthCodes.has(secondCode)) {
      await TaskManager.updateStatus(
        '[邮件验证码] 重新获取的验证码也是已使用的',
      );
      return null;
    }

    // 获取到新的验证码
    this.usedMail2AuthCodes.add(secondCode);
    await TaskManager.updateStatus(
      `[邮件验证码] 重新获取成功，验证码: ${secondCode}`,
    );
    return secondCode;
  }

  private async finalizeRegistrationApi(): Promise<any> {
    if (!this.regToken) {
      throw new Error('regToken is required');
    }
    const urlInfo = new URL(
      'https://id.pokemoncenter-online.com/accounts.finalizeRegistration',
    );
    urlInfo.searchParams.append('regToken', this.regToken);
    urlInfo.searchParams.append('targetEnv', 'jssdk');
    urlInfo.searchParams.append('include', 'profile,data');
    urlInfo.searchParams.append('includeUserInfo', 'true');
    urlInfo.searchParams.append('APIKey', GIGYA_API_KEY);
    urlInfo.searchParams.append('sdk', 'js_next');
    urlInfo.searchParams.append(
      'pageURL',
      'https://www.pokemoncenter-online.com/login-mfa/',
    );
    urlInfo.searchParams.append('sdkBuild', this.sdkBuild);
    urlInfo.searchParams.append('format', 'json');
    const res = await fetch(urlInfo.toString(), {
      credentials: 'include',
      redirect: 'follow',
    }).then((res) => res.json());

    this.genLoggedInToken();
    console.info('最终注册成功 TOKEN: ', this.finalRegistrationToken);

    this.login_token = res.sessionInfo.login_token;
    this.uid = res.userInfo.UID ?? this.uid;
    this.uidSig = res.userInfo.UIDSig ?? this.uidSig;
    this.uidSignature = res.userInfo.UIDSignature ?? this.uidSignature;
    localStorage.setItem('login_token', this.login_token);
    localStorage.setItem('uid', this.uid);
    localStorage.setItem('uidSig', this.uidSig);
    localStorage.setItem('uidSignature', this.uidSignature);
    console.info(
      'finalizeRegistrationApi response: ',
      res,
      this.uid,
      this.uidSig,
      this.uidSignature,
    );
    return res;
  }

  private genLoggedInToken(): boolean {
    let isSuccess = false;
    document.cookie.split(';').forEach((cookie) => {
      const [name, value] = cookie.trim().split('=');
      if (name && name.startsWith('glt_4_') && value) {
        this.finalRegistrationToken = value;
        isSuccess = true;
      }
    });
    return isSuccess;
  }

  private isLoggedIn(): boolean {
    this.genLoggedInToken();
    return !!this.finalRegistrationToken;
  }

  private async fetchUidSigAndSignature(): Promise<void> {
    return this.axios
      .request({
        url: 'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/Account-Login',
        method: 'POST',
        params: {
          rurl: '1',
        },
        headers: {
          accept: 'application/json, text/javascript, */*; q=0.01',
          'accept-language': 'zh-CN,zh;q=0.9',
          'content-type': 'application/x-www-form-urlencoded',
        },
        data: {
          csrf_token: this.csrfToken,
          apiUidSignatureUid: this.uid,
          apiUidSignatureUIDSignature: this.uidSignature,
          apiUidSignaturesignatureTimestamp: Math.floor(Date.now() / 1000),
        },
      })
      .then((res) => {
        console.log('[UID签名] genUidSigAndSignature 响应:', res.data);
      })
      .catch((error) => {
        console.error('[UID签名] genUidSigAndSignature 请求失败:', error);
        throw error;
      });
  }

  public async login(): Promise<boolean> {
    try {
      const isLoggedIn = this.isLoggedIn();
      if (isLoggedIn) {
        await TaskManager.updateStatus('[登录] 已登录，跳过登录流程');
        return true;
      }
      await TaskManager.updateStatus('[登录] 获取登录页 Cookies');
      await this.visitLoginPage();
      this.injectCookie();
      await TaskManager.updateStatus('[登录] 获取 SDK Cookies');
      await this.visitAccountWebSdkBootstrapApi();
      // await TaskManager.updateStatus('[登录] 获取 SSO Cookies');
      // await this.visitSSOPage();
      await this.visitLarkbileometJS();
      await TaskManager.updateStatus('[登录] Cookies 环境准备完成');

      await TaskManager.updateStatus('[验证码] 开始解决 reCaptcha');
      const startResolveTime = Date.now();

      // 从配置中获取验证码服务类型，默认为 'capmonster'
      const captchaService = this.taskInfo.captchaService || 'capmonster';
      const captchaToken = await this.resolveCaptcha(
        BASE_DOMAIN_URLS.LOGIN,
        captchaService,
      );
      console.info('🚀 ~ LoginClient ~ login ~ captchaToken:', captchaToken);

      if (!captchaToken) {
        await TaskManager.updateStatus(
          `[验证码] reCaptcha 解决失败 (${captchaService})`,
        );
        return false;
      }
      this.setCaptchaToken(captchaToken);
      const resolveTime = ((Date.now() - startResolveTime) / 1000).toFixed(2);
      await TaskManager.updateStatus(
        `[验证码] reCaptcha 解决完成 (${captchaService})，耗时: ${resolveTime}s`,
      );

      await TaskManager.updateStatus(`[登录] 开始登录: ${this.username}`);
      const loginSuccess = await this.loginApi();
      if (loginSuccess === 'ok') {
        return true;
      }
      if (loginSuccess !== '2fa') {
        return false;
      }

      await TaskManager.updateStatus('[TFA] 初始化二次认证');
      const tfaSuccess = await this.initTFAApi();
      if (!tfaSuccess) {
        await TaskManager.updateStatus('[TFA] 初始化 TFA 失败');
        return false;
      }
      await TaskManager.updateStatus('[认证] 初始化 TFA 成功');

      await TaskManager.updateStatus('[认证] 开始二次认证');
      const twoAuthSuccess = await this.factor2AuthApi();
      if (!twoAuthSuccess) {
        await TaskManager.updateStatus('[认证] 二次认证失败');
        return false;
      }
      await TaskManager.updateStatus('[认证] 二次认证成功');

      await this.fetchMail2FaPage();
      const code = await this.getNewMail2AuthCode();
      if (!code) {
        await TaskManager.updateStatus('[邮件验证码] 未获取到新的验证码');
        return false;
      }
      this.mail2AuthCode = code;
      await TaskManager.updateStatus('[邮件验证码] 邮件验证码获取成功');

      await TaskManager.updateStatus('[邮件验证码] 开始提交邮件验证码');
      const mail2faSuccess = await this.mail2faApi();
      if (!mail2faSuccess) {
        await TaskManager.updateStatus('[邮件验证码] 邮件验证码认证失败');
        return false;
      }
      await TaskManager.updateStatus('[邮件验证码] 邮件验证码认证成功');

      await this.finalizeRegistrationApi();
      if (!this.isLoggedIn()) {
        await TaskManager.updateStatus('[登录] 最终注册 TOKEN 失败');
        return false;
      }
      await TaskManager.updateStatus('[登录] 最终注册 TOKEN 成功');

      await this.fetchUidSigAndSignature();
      await TaskManager.updateStatus('[登录] 获取 UID 签名成功');
      return true;
    } catch (error: any) {
      console.error('[登录流程] 发生错误:', error);
      await TaskManager.error(`[登录流程] 发生错误: ${error.message}`);
      return false;
    }
  }

  // ============================================================================
  // ==================== 订单相关功能 ====================
  // ============================================================================

  public async fetchShippingPage(): Promise<void> {
    const html = await fetch('https://www.pokemoncenter-online.com/order', {
      credentials: 'include',
      redirect: 'follow',
    }).then((res) => res.text());

    // console.info("🚀 ~ LoginClient ~ fetchShippingPage ~ html:", html)
    const document = new DOMParser().parseFromString(html, 'text/html');
    this.csrfToken =
      document
        .querySelector('input[name="csrf_token"]')
        ?.getAttribute('value') || this.csrfToken;
    const dgftTokenApiKey =
      document
        .querySelector('input[id="dgftTokenApiKey"]')
        ?.getAttribute('value') || this.dgftTokenApiKey;
    console.info('dgftTokenApiKey: ', dgftTokenApiKey);
    if (dgftTokenApiKey) {
      this.dgftTokenApiKey = dgftTokenApiKey;
      localStorage.setItem('dgftTokenApiKey', dgftTokenApiKey);
    }
  }

  private async fetchPaymentPage(): Promise<void> {
    return await fetch('https://www.pokemoncenter-online.com/payment/', {
      credentials: 'include',
      redirect: 'follow',
    })
      .then((res) => res.text())
      .then((html) => {
        const document = new DOMParser().parseFromString(html, 'text/html');
        const dgftTokenApiKey =
          document
            .querySelector('input[id="dgftTokenApiKey"]')
            ?.getAttribute('value') || this.dgftTokenApiKey;
        console.info('dgftTokenApiKey: ', dgftTokenApiKey);
        if (dgftTokenApiKey) {
          this.dgftTokenApiKey = dgftTokenApiKey;
          localStorage.setItem('dgftTokenApiKey', dgftTokenApiKey);
        }
      })
      .catch((err) => {
        console.error('a error: ', err);
      });
  }
  private async removeHistoryProduct(pid: string, uuid: string): Promise<void> {
    const urlInfo = new URL(
      'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/Cart-RemoveProductLineItem',
    );
    urlInfo.searchParams.append('pid', pid);
    urlInfo.searchParams.append('uuid', uuid);
    await this.axios.request({
      url: urlInfo.toString(),
      method: 'GET',
      maxRedirects: 5,
    });
  }

  public async removeHistoryProducts(): Promise<void> {
    console.info('开始移除购物车历史产品');
    return await fetch('https://www.pokemoncenter-online.com/cart/', {
      credentials: 'include',
      redirect: 'follow',
    })
      .then((res) => res.text())
      .then(async (html) => {
        // console.info("removeHistoryProducts response: ", html)
        const document = new DOMParser().parseFromString(html, 'text/html');
        const removeProductsLiElement = Array.from(
          document.querySelectorAll('ul.cart-list li'),
        );
        console.log('找到', removeProductsLiElement.length, '个加购商品');
        for (const removeProductLiElement of removeProductsLiElement) {
          const pid =
            removeProductLiElement
              .querySelector('.product-name')
              ?.getAttribute('data-pid') || '';
          if (!pid) continue;
          const uuid = removeProductLiElement.classList.value.replace(
            'uuid-',
            '',
          );
          console.info(
            '🚀 ~ LoginClient ~ removeHistoryProducts ~ uuid:',
            uuid,
          );
          if (!uuid) continue;
          await this.removeHistoryProduct(pid, uuid);
          await TaskManager.updateStatus(`[购物车] 移除购物车产品 ${pid} 成功`);
          await sleep(10000);
        }
      })
      .catch((err) => {
        TaskManager.updateStatus('移除商品失败:' + err?.message || '');
      });
  }

  /**
   * 添加到购物车
   */
  public async addToCart(): Promise<boolean> {
    if (!this.taskInfo.productId) {
      await TaskManager.updateStatus('[购物车] 没有找到商品ID');
      return false;
    }

    await TaskManager.updateStatus(
      `[购物车] 开始添加到购物车 ${this.taskInfo.productId}`,
    );

    try {
      const response = await this.axios.request({
        url: 'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/Cart-AddProduct',
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        data: {
          dwfrm_product_fundamental_pid: String(this.taskInfo.productId),
          dwfrm_product_fundamental_quantity: '1',
        },
      });
      console.info('addToCart response: ', response);
      if (
        Array.isArray(response.data?.cart?.items) &&
        response.data.cart.items.length > 0
      ) {
        await TaskManager.updateStatus('[购物车] 添加到购物车成功');
        return true;
      }
      await TaskManager.updateStatus('[购物车] 添加到购物车失败');
      return false;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await TaskManager.updateStatus(
        `[购物车] 添加到购物车失败: ${errorMessage}`,
      );
      return false;
    }
  }

  /**
   * 提交配送信息
   */
  private async submitShipping(): Promise<boolean> {
    if (!this.csrfToken) {
      await TaskManager.updateStatus('[配送] 没有找到csrfToken');
      throw new Error('[配送] 没有找到csrfToken');
    }
    if (!this.uid) {
      await TaskManager.updateStatus('[配送] 没有找到uid');
      throw new Error('[配送] 没有找到uid');
    }
    if (!this.dgftTokenApiKey) {
      await TaskManager.updateStatus('[支付] 没有找到dgftTokenApiKey');
      throw new Error('[支付] 没有找到dgftTokenApiKey');
    }

    const kanaName = jaconv.toKatakana(this.taskInfo.firstNameKana);
    const data = {
      originalShipmentUUID: this.uid,
      shipmentUUID: this.uid,
      shipmentSelector: 'ab_登録住所',
      dwfrm_shipping_shippingAddress_addressFields_country: 'JP',
      dwfrm_shipping_shippingAddress_addressFields_addressId: '__dummy',
      dwfrm_shipping_shippingAddress_addressFields_lastName: kanaName,
      dwfrm_shipping_shippingAddress_addressFields_nameKana: kanaName,
      dwfrm_shipping_shippingAddress_addressFields_postalCode:
        this.taskInfo.zipCode,
      dwfrm_shipping_shippingAddress_addressFields_states_stateCode:
        this.taskInfo.state,
      dwfrm_shipping_shippingAddress_addressFields_city: this.taskInfo.city,
      dwfrm_shipping_shippingAddress_addressFields_address1: jaconv.toZen(
        this.taskInfo.address1,
      ),
      dwfrm_shipping_shippingAddress_addressFields_address2: jaconv.toZen(
        this.taskInfo.address2,
      ),
      dwfrm_shipping_shippingAddress_addressFields_phone:
        this.taskInfo.phoneNumber,
      dwfrm_shipping_shippingAddress_timetable_hasRequest: 'false',
      dwfrm_shipping_shippingAddress_timetable_dateRange: 'unspecified',
      dwfrm_shipping_shippingAddress_timetable_timeRange: '0',
      csrf_token: this.csrfToken,
    };

    await TaskManager.updateStatus('[配送] 提交配送信息中...');

    try {
      const response = await this.axios.request({
        url: 'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/CheckoutShippingServices-SubmitShipping',
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        data: data,
      });

      console.info('submitShipping response: ', response);
      const { fieldErrors } = response.data || {};
      if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
        await TaskManager.errorComplete(
          `[配送] 配送信息字段有误 ${fieldErrors.join('\n')}`,
        );
        return;
      }
      await TaskManager.updateStatus('[配送] 配送信息提交完成');
      return true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 提交并保存信用卡信息到账号
   */
  private async submitFirstPaymentCreditCard(): Promise<void> {
    if (!this.dgftTokenApiKey) {
      await this.fetchPaymentPage();
      if (!this.dgftTokenApiKey) {
        await TaskManager.updateStatus('[支付] 没有找到dgftTokenApiKey');
        throw new Error('[支付] 没有找到dgftTokenApiKey');
      }
    }
    await TaskManager.updateStatus('[支付] 开始提交信用卡信息');

    const response = await this.axios.request({
      url: 'https://api3.veritrans.co.jp/4gtoken',
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      data: {
        token_api_key: this.dgftTokenApiKey,
        card_number: this.taskInfo.cardNumber,
        card_expire:
          this.taskInfo.expiredMonth + '/' + this.taskInfo.expiredYear,
        security_code: this.taskInfo.securityCode,
        cardholder_name: this.taskInfo.cardName,
        lang: 'ja',
      },
    });
    console.info('submitFirstPaymentCreditCard response: ', response);

    if (response.data.code === 'success') {
      await TaskManager.updateStatus(`[支付] 提交信用卡信息成功`);
    } else {
      await TaskManager.updateStatus(
        `[支付] 提交信用卡信息失败: ${response.data.message}`,
      );
      throw new Error(`[支付] 提交信用卡信息失败: ${response.data.message}`);
    }
  }

  /**
   * 下单流程提交使用的信用卡
   */
  private async submitFirstPaymentCreditCardApi(): Promise<void> {
    if (!this.csrfToken) {
      await this.fetchShippingPage();
      if (!this.csrfToken) {
        await TaskManager.updateStatus('[支付] 没有找到csrfToken');
        throw new Error('[支付] 没有找到csrfToken');
      }
    }
    return this.axios.request({
      url: 'https://www.pokemoncenter-online.com/on/demandware.store/Sites-POL-Site/ja_JP/CheckoutServices-SubmitPayment',
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      data: {
        csrf_token: this.csrfToken,
        dwfrm_billing_paymentMethod: 'CREDIT_CARD',
        maskedNewCardNumber: '',
        creditCardtoken: '',
        dwfrm_billing_creditCardFields_cardType: '',
        dwfrm_billing_creditCardFields_expirationMonth: '',
        dwfrm_billing_creditCardFields_expirationYear: '',
      },
    });
  }

  public async getAccountInfo(): Promise<any> {
    if (!this.login_token) {
      await TaskManager.updateStatus('[获取账号信息] 没有找到login_token');
      return null;
    }
    const response = await this.axios.request({
      url: 'https://id.pokemoncenter-online.com/accounts.getAccountInfo',
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      data: {
        include: 'data,',
        lang: 'ja',
        APIKey: GIGYA_API_KEY,
        sdk: 'js_latest',
        login_token: this.login_token,
        authMode: 'cookie',
        pageURL:
          'https://www.pokemoncenter-online.com/order/?stage=placeOrder#placeOrder',
        sdkBuild: '18148',
        format: 'json',
      },
    });
    console.info('getAccountInfo response: ', response);
    const { errorMessage, errorCode, errorDetails } = response.data;
    if (errorCode > 10000) {
      throw new Error(
        `[获取账号信息] 获取账号信息失败: ${errorDetails || errorMessage}`,
      );
    }
    return response.data;
  }

  /**
   * 提交支付
   */
  public async submitPayment(): Promise<void> {
    await TaskManager.updateStatus('[支付] 开始支付流程');
    await this.getAccountInfo();
  }

  public async getCartInfo(): Promise<any> {
    return await fetch('https://www.pokemoncenter-online.com/cart/', {
      credentials: 'include',
      redirect: 'follow',
    })
      .then((res) => res.text())
      .then(async (html) => {
        // console.info("getCartInfo response: ", html)
        const document = new DOMParser().parseFromString(html, 'text/html');
        const errorMessage =
          document.querySelector('.error-message')?.textContent || '';
        if (errorMessage) {
          throw new Error(
            `[获取购物车信息] 获取购物车信息失败: ${errorMessage}`,
          );
        }
      });
  }

  public async getMyPageInfo(): Promise<any> {
    return await fetch('https://www.pokemoncenter-online.com/mypage/', {
      credentials: 'include',
      redirect: 'follow',
    })
      .then((res) => res.text())
      .then((html) => {
        // console.info("getMyPageInfo response: ", html)
        const document = new DOMParser().parseFromString(html, 'text/html');
        this.csrfToken =
          document
            .querySelector('input[name="csrf_token"]')
            ?.getAttribute('value') || this.csrfToken;
      })
      .catch((err) => {
        console.error('getMyPageInfo error: ', err);
      });
  }

  /**
   * 完整的订单流程
   */
  public async processOrder(): Promise<boolean> {
    try {
      await this.getMyPageInfo();
      await this.getCartInfo();
      await this.fetchShippingPage();
      if (!this.dgftTokenApiKey) await this.fetchPaymentPage();
      // 提交配送信息
      await this.submitShipping();

      let submitFirstPaymentCreditCardSuccess = false;
      // 提交信用卡信息
      for (let i = 0; i < 2; i++) {
        try {
          await this.submitFirstPaymentCreditCard();
          submitFirstPaymentCreditCardSuccess = true;
        } catch (error) {
          if (error?.message?.includes('没有找到')) break;
          continue;
        }
        break;
      }
      for (let i = 0; i < 3; i++) {
        try {
          await this.submitFirstPaymentCreditCardApi();
        } catch (error) {
          continue;
        }
        break;
      }

      // 支付流程
      if (submitFirstPaymentCreditCardSuccess) {
        location.href =
          'https://www.pokemoncenter-online.com/order/?stage=placeOrder';
        return;
      }
      await TaskManager.error('[订单流程] 订单流程失败');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await TaskManager.error(`[订单流程] 处理失败: ${errorMessage}`);
    }
  }
}
