import { ipcRenderer } from 'electron';

export interface AccountData {
  productId?: string;
  retailer?: string;
  mode?: string;
  proxy?: string;
  profileTitle?: string;
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  country?: string;
  state?: string;
  city?: string;
  address1?: string;
  address2?: string;
  phoneNumber?: string;
  zipCode?: string;
  cardName?: string;
  cardNumber?: string;
  expiredMonth?: string;
  expiredYear?: string;
  securityCode?: string;
  loginId?: string;
  loginPass?: string;
  extra1?: string;
  codeMail?: string;
  smtp?: string;
  // IMAP 配置
  imapHost?: string;
  imapPort?: number | string;
  imapTls?: boolean;
  // 验证码服务配置: 'capmonster' | '2captcha'，默认为 'capmonster'
  captchaService?: 'capmonster' | '2captcha';
  // 添加购物车时机: 'beforeLogin' | 'afterLogin'，默认为 'beforeLogin'
  addToCartTiming?: 'beforeLogin' | 'afterLogin';
}

export interface TaskInfo {
  mail: string; // mail 作为主键
  status: string;
  statusText: string;
  data: AccountData;
}

const STORAGE_KEY = 'currentTask';
const ACCOUNT_MAIL_KEY = 'currentAccountMail';
const cloneFunc = window.close.bind(window);

/**
 * 任务管理器
 * 用于跨页面共享任务信息，所有数据存储在 localStorage 中
 */
export class TaskManager {
  /**
   * 设置当前窗口的账号邮箱（由主进程调用）
   */
  static setCurrentAccountMail(mail: string): void {
    localStorage.setItem(ACCOUNT_MAIL_KEY, mail);
    console.log(`[TaskManager] 设置当前账号邮箱: ${mail}`);
  }

  /**
   * 获取当前窗口的账号邮箱
   */
  static getCurrentAccountMail(): string | null {
    return localStorage.getItem(ACCOUNT_MAIL_KEY);
  }

  /**
   * 从后端获取一个待处理的任务，自动保存到 localStorage
   * 如果当前窗口有指定的账号邮箱，则获取该账号；否则获取任意一个待处理的账号
   */
  static async fetchTask(): Promise<TaskInfo | null> {
    try {
      // 优先使用当前窗口指定的账号邮箱
      const currentAccountMail = this.getCurrentAccountMail();
      const task = (await ipcRenderer.invoke(
        'get-task',
        currentAccountMail || undefined,
      )) as TaskInfo | null;

      if (task) {
        this.save(task);
        if (currentAccountMail && task.mail !== currentAccountMail) {
          console.error(
            `[TaskManager] 严重错误：获取的任务邮箱 ${task.mail} 与指定的账号邮箱 ${currentAccountMail} 不一致！`,
          );
        } else if (currentAccountMail && task.mail === currentAccountMail) {
        }
      }
      return task;
    } catch (error) {
      console.error('[TaskManager] 获取任务失败:', error);
      return null;
    }
  }

  /**
   * 保存任务信息到 localStorage
   */
  static save(task: TaskInfo): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(task));
  }

  /**
   * 从 localStorage 获取当前任务信息
   */
  static get(): TaskInfo | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TaskInfo;
    } catch {
      return null;
    }
  }

  /**
   * 获取任务数据
   */
  static getData(): AccountData | null {
    return this.get()?.data ?? null;
  }

  /**
   * 更新任务状态（安全版本：后端自动从窗口识别账号）
   * @param statusText 状态文本描述（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   * @param status 状态（可选，默认使用 PROCESSING）
   */
  static async updateStatus(
    statusText?: string | null,
    status?: string,
  ): Promise<boolean> {
    const finalStatus = status || 'PROCESSING';

    try {
      // 不再传递 mail 参数，后端会从 event.sender 自动识别窗口对应的账号
      await ipcRenderer.invoke('update-task-status', finalStatus, statusText);
      // 在 updateStatus 里面打印日志
      if (statusText) {
        console.log(`[${finalStatus}] ${statusText}`);
      } else {
        console.log(`[${finalStatus}]`);
      }

      // 注意：不要在 updateStatus 中清除任务信息，因为 complete() 和 errorComplete() 需要任务信息来关闭窗口
      // 清除任务信息的逻辑应该在 complete() 和 errorComplete() 中处理
      return true;
    } catch (error) {
      console.error('[TaskManager] 更新状态失败:', error);
      return false;
    }
  }

  /**
   * 标记当前任务为完成
   * complete 必须关闭窗口，并且不需要重试
   * @param statusText 状态文本（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   */
  static async complete(statusText?: string | null): Promise<boolean> {
    // 更新状态为 DONE（后端会自动从窗口识别账号）
    const result = await this.updateStatus(statusText, 'DONE');
    console.log(`[TaskManager] complete 结果: ${result}`);

    // 无论 updateStatus 是否成功，都必须关闭窗口
    // 因为任务已经完成，窗口应该关闭，且不需要重试
    try {
      // 请求关闭窗口（不算重试，shouldCountRetry = false）
      await this.close(false);
      console.log(`[TaskManager] 已请求关闭窗口（任务完成，不重试）`);
    } catch (error) {
      console.error('[TaskManager] 关闭窗口失败:', error);
      // 即使关闭失败，也要清理任务信息
    }

    // 关闭窗口后再清理 localStorage 中的任务信息
    this.clear();

    return result;
  }

  /**
   * 标记错误, 不会修改状态（仅更新状态文本，不关闭窗口）
   * @param statusText 错误描述
   */
  static async error(statusText: string): Promise<boolean> {
    // 直接更新状态为 ERROR（后端会自动从窗口识别账号）
    return this.updateStatus(statusText || '发生错误', 'ERROR');
  }

  /**
   * 标记错误, 会修改状态为 ERROR
   * errorComplete 必须关闭窗口，并且需要根据最大重试次数进行重试
   * @param statusText 错误描述（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   */
  static async errorComplete(statusText?: string | null): Promise<void> {
    // 更新状态为 ERROR（后端会自动从窗口识别账号）
    await this.updateStatus(statusText, 'ERROR');

    // 无论 updateStatus 是否成功，都必须关闭窗口
    // 因为任务已经错误，窗口应该关闭，且需要根据最大重试次数进行重试
    try {
      // 请求关闭窗口（算作重试，shouldCountRetry = true）
      await this.close(true);
      console.log(`[TaskManager] 已请求关闭窗口（任务失败，需要重试）`);
    } catch (error) {
      console.error('[TaskManager] 关闭窗口失败:', error);
      // 即使关闭失败，也要清理任务信息
    }

    // 关闭窗口后再清理 localStorage 中的任务信息
    this.clear();
  }

  /**
   * 请求关闭窗口（安全版本：后端自动从窗口识别账号）
   * @param shouldCountRetry 是否算作一次重试（默认 true，如果任务成功完成应该传 false）
   */
  static async close(shouldCountRetry: boolean = true): Promise<void> {
    try {
      // 不再传递 mail 参数，后端会从 event.sender 自动识别窗口对应的账号
      const result = await ipcRenderer.invoke(
        'request-close-window',
        shouldCountRetry,
      );
      console.log(`[TaskManager] 关闭窗口请求成功:`, result);
    } catch (error) {
      console.error('[TaskManager] 请求关闭窗口失败:', error);
      // 如果 IPC 调用失败，延迟后直接关闭（降级处理）
      console.warn('[TaskManager] 使用降级处理：直接关闭窗口');
      setTimeout(() => {
        try {
          cloneFunc();
        } catch (e) {
          console.error('[TaskManager] 降级关闭窗口也失败:', e);
        }
      }, 1000);
    }
  }

  /**
   * 清除当前任务信息
   */
  static clear(): void {
    return localStorage.removeItem(STORAGE_KEY);
  }
}
