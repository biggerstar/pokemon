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
   * 更新任务状态
   * @param statusText 状态文本描述（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   * @param status 状态（可选，默认使用 PROCESSING）
   * @param taskMail 任务邮箱（可选，默认使用当前任务）
   */
  static async updateStatus(
    statusText?: string | null,
    status?: string,
    taskMail?: string,
  ): Promise<boolean> {
    const mail = taskMail || this.get()?.mail;
    if (!mail) {
      console.warn('[TaskManager] 没有当前任务，无法更新状态');
      return false;
    }

    const finalStatus = status || 'PROCESSING';

    try {
      await ipcRenderer.invoke(
        'update-task-status',
        mail,
        finalStatus,
        statusText,
      );
      // 在 updateStatus 里面打印日志
      if (statusText) {
        console.log(`[${finalStatus}] ${statusText}`);
      } else {
        console.log(`[${finalStatus}]`);
      }

      // 注意：不要在 updateStatus 中清除任务信息，因为 complete() 和 error() 需要任务信息来关闭窗口
      // 清除任务信息的逻辑应该在 complete() 和 error() 中处理
      return true;
    } catch (error) {
      console.error('[TaskManager] 更新状态失败:', error);
      return false;
    }
  }

  /**
   * 标记当前任务为完成
   * @param statusText 状态文本（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   */
  static async complete(statusText?: string | null): Promise<boolean> {
    // 先获取 mail，因为 updateStatus 可能会清除任务信息
    const mail = this.getCurrentAccountMail() || this.get()?.mail;

    if (!mail) {
      console.warn('[TaskManager] complete 无法获取账号邮箱，无法更新状态');
      return false;
    }

    const result = await this.updateStatus(statusText, 'DONE', mail);
    console.log(`[TaskManager] complete 结果: ${result}, mail: ${mail}`);

    // 无论 updateStatus 是否成功，都尝试关闭窗口
    // 因为任务已经完成，窗口应该关闭
    try {
      // 请求关闭窗口（不算重试，会触发主进程清理所有缓存）
      await this.close(false);
      console.log(`[TaskManager] 已请求关闭窗口`);
    } catch (error) {
      console.error('[TaskManager] 关闭窗口失败:', error);
    }

    // 关闭窗口后再清理 localStorage 中的任务信息
    this.clear();

    return result;
  }

  /**
   * 标记错误, 不会修改状态
   * @param statusText 错误描述
   */
  static async error(statusText: string): Promise<boolean> {
    // 先获取 mail，确保能正确更新状态
    const mail = this.getCurrentAccountMail() || this.get()?.mail;

    if (!mail) {
      console.warn('[TaskManager] error 无法获取账号邮箱，无法更新状态');
      return false;
    }

    // 直接更新状态为 ERROR，以便主进程能够正确处理重试逻辑
    return this.updateStatus(statusText || '发生错误', 'ERROR', mail);
  }

  /**
   * 标记错误, 会修改状态为 ERROR
   * @param statusText 错误描述（可选，如果为空字符串、null 或 undefined，则不更新 statusText）
   */
  static async errorComplete(statusText?: string | null): Promise<void> {
    // 先获取 mail，因为 updateStatus 可能会清除任务信息
    const mail = this.getCurrentAccountMail() || this.get()?.mail;

    if (!mail) {
      console.warn('[TaskManager] errorComplete 无法获取账号邮箱，无法更新状态');
      return;
    }

    await this.updateStatus(statusText, 'ERROR', mail);

    // 无论 updateStatus 是否成功，都尝试关闭窗口
    // 因为任务已经错误，窗口应该关闭
    try {
      // 请求关闭窗口（不算重试，会触发主进程清理所有缓存）
      await this.close(true);
      console.log(`[TaskManager] 已请求关闭窗口`);
    } catch (error) {
      console.error('[TaskManager] 关闭窗口失败:', error);
    }

    // 关闭窗口后再清理 localStorage 中的任务信息
    this.clear();
  }

  /**
   * 请求关闭窗口
   * @param shouldCountRetry 是否算作一次重试（默认 true，如果任务成功完成应该传 false）
   */
  static async close(shouldCountRetry: boolean = true): Promise<void> {
    // 优先使用当前账号邮箱，如果没有则从任务中获取
    let mail = this.getCurrentAccountMail();
    if (!mail) {
      const task = this.get();
      mail = task?.mail;
    }

    if (!mail) {
      console.warn(
        '[TaskManager] 无法获取账号邮箱，将传递 undefined 给主进程，主进程会尝试自动查找',
      );
    }

    try {
      // 通过 IPC 请求主进程关闭窗口（即使 mail 为 undefined，主进程也会尝试查找）
      const result = await ipcRenderer.invoke(
        'request-close-window',
        mail,
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
    localStorage.removeItem(STORAGE_KEY);
  }
}
