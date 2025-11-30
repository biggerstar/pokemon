import { requestClient } from '#/api/request';
import type { Recordable } from '@vben/types';
import { message } from 'ant-design-vue';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams extends Recordable<any> {
    password: string;
    username: string;
    captchaId?: string;
    verifyCode?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
    refreshToken: string;
  }
}

/**
 * 登录
 */
export async function loginApi(form: any) {
  const data = await __API__.login(form)
  console.log("🚀 ~ loginApi ~ data:", data)
  if (data?.code !== 0) {
    message.error(data?.message)
    return
  }

  const loginedData = {
    id: 0,
    realName: data.data.loginName,
    roles: [
      "super"
    ],
    username: data.data.username,
    accessToken: data.data.token,
    userId: data.data.userId,
  }
  localStorage.setItem('loginedData', JSON.stringify(loginedData))
  return loginedData
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi(): Promise<AuthApi.LoginResult> {
  return requestClient.post<AuthApi.LoginResult>('/auth/refresh', {});
}

