import { ipcRenderer } from 'electron';

export class CaptchaRsolver {
  static async resolveRecaptchaV3Enterprise(pageurl: string) {
    // 使用 IPC 调用主进程的验证码解析服务（从配置读取 token）
    const captchaToken = await ipcRenderer.invoke(
      'resolve-recaptcha-unified',
      pageurl,
    );
    return captchaToken || null;
  }
}
