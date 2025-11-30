/**
 * 该文件可自行根据业务逻辑进行调整
 */
import type { HttpResponse } from '@vben/request';

import { useAppConfig } from '@vben/hooks';
import { preferences } from '@vben/preferences';
import {
  authenticateResponseInterceptor,
  errorMessageResponseInterceptor,
  RequestClient,
} from '@vben/request';
import { useAccessStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { useAuthStore } from '#/store';

import { Api } from '.';

const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);

export function createRequestClient(baseURL: string) {
  const client = new RequestClient({
    baseURL,
  });

  let __errorCount = 0

  /**
   * 重新认证逻辑
   */
  async function doReAuthenticate(redirect: boolean = true, isHttp: boolean = true) {
    console.warn('Access token or refresh token is invalid or expired. ');
    const accessStore = useAccessStore();
    const authStore = useAuthStore();
    if (
      preferences.app.loginExpiredMode === 'modal' &&
      accessStore.isAccessChecked
    ) {
      accessStore.setLoginExpired(true);
    } else if (isHttp) {
      await authStore.logout(redirect);
    }
    accessStore.setAccessToken(null);
  }

  /**
   * 刷新token逻辑
   */
  async function doRefreshToken() {
    const accessStore = useAccessStore();
    const { accessToken, refreshToken } = await Api.core.auth.refreshTokenApi() || {};
    accessToken && accessStore.setAccessToken(accessToken);
    refreshToken && accessStore.setRefreshToken(refreshToken);
    return accessToken;
  }

  function formatToken(token: null | string) {
    return token ? `Bearer ${token}` : null;
  }

  // 请求头处理
  client.addRequestInterceptor({
    fulfilled: async (config) => {
      const accessStore = useAccessStore();
      config.headers.Authorization = formatToken(accessStore.accessToken);
      config.headers['Accept-Language'] = preferences.app.locale;
      return config;
    },
  });

  // response数据解构
  client.addResponseInterceptor<HttpResponse>({
    fulfilled: (response) => {
      const { data: responseData, status } = response;

      const { code, data } = responseData;

      if (status >= 200 && status < 400 && code === 200) {
        __errorCount = 0
        return data;
      }
      throw Object.assign({}, response, { response });
    },
  });

  // token过期适配后台数据结构的预处理，这里可以根据对接不同后台进行适配调整
  client.addResponseInterceptor({
    rejected: async (error) => {
      const { response } = error;
      const code = response?.data?.code;

      if (code && code >= 1100 && code < 1200) {
        if (++__errorCount <= 1) {
          error.response.status = 401;
          response.data = null
        }
        throw error;
      }

      if (code !== 200) {
        throw error;
      }
    },
  });

  // token过期的处理
  client.addResponseInterceptor(
    authenticateResponseInterceptor({
      client,
      doReAuthenticate,
      doRefreshToken,
      enableRefreshToken: preferences.app.enableRefreshToken,
      formatToken,
    }),
  );

  // 通用的错误处理,如果没有进入上面的错误处理逻辑，就会进入这里
  client.addResponseInterceptor(
    errorMessageResponseInterceptor((_msg: string, error) => {
      if (client.isRefreshing) return
      // 这里可以根据业务进行定制,你可以拿到 error 内的信息进行定制化处理，根据不同的 code 做不同的提示，而不是直接使用 message.error 提示 msg
      // 当前mock接口返回的错误字段是 error 或者 message
      const responseData = error?.response?.data ?? {};
      const errorMessage = responseData?.error ?? responseData?.message;
      // 如果没有错误信息，则会根据状态码进行提示
      errorMessage && message.error(errorMessage);
    }),
  );

  return client;
}

export const requestClient = createRequestClient(apiURL);

// export const requestAdminAuthClient = createRequestClient(apiURL);

export const baseRequestClient = new RequestClient({ baseURL: apiURL });
