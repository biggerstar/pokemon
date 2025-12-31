import { ipcRenderer } from 'electron';
import { TaskManager } from './task-manager';

export class CaptchaRsolver {
  static async resolveRecaptchaV3Enterprise(pageurl: string) {
    // 从任务信息中获取验证码服务类型，如果没有则使用默认服务
    const task = TaskManager.get();
    const captchaService = task?.data?.captchaService || 'capmonster';
    
    // 使用 IPC 调用主进程的验证码解析服务（从配置读取 token）
    const captchaToken = await ipcRenderer.invoke('resolve-recaptcha-unified', pageurl, captchaService);
    return captchaToken || null;
  }
}
