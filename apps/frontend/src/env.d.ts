import { CustomTitlebar } from 'custom-electron-titlebar'


declare global {
  declare interface Window {
    electronTitlebar: CustomTitlebar
    __VBEN_ADMIN_METADATA__: Record<any, any>
    _SERVER_API_: string
  }

  declare const __API__: {
    login(form: any): Promise<any>
    showWindow(): Promise<void>
    hideWindow(): Promise<void>
    isShow(): Promise<boolean>
    loadURL(url: string): Promise<void>
    getURL(): Promise<void | string>
    isDev(): Promise<boolean>
    getPruductList(options: Record<any, any>): Promise<any>
    getTableList(options?: Record<any, any>): Promise<any>
    clearTableList(ids?: string[]): Promise<void>
    getOneList(id: string): Promise<any>
    deleteProduct(ids: string[]): Promise<void>
    openBrowserWindow(url: string, show?: boolean): Promise<void>
    saveConfig(key: string, value: string): Promise<any>
    getConfig(key: string): Promise<string | null>
    getAccounts(): Promise<any[]>
    saveAccounts(accounts: any[]): Promise<boolean>
    deleteAccounts(ids: string[]): Promise<boolean>
    // 任务相关 API
    getTask(): Promise<any | null>
    updateTaskStatus(mail: string, status: 'NONE' | 'PROCESSING' | 'DONE'): Promise<any>
    resetProcessingTasks(): Promise<{ success: boolean; count: number }>
    initAllTasks(): Promise<{ success: boolean; count: number }>
    startTasks(accountMails: string[], maxConcurrency?: number, show?: boolean, enableProxy?: boolean, clearBrowserData?: boolean, maxRetryCount?: number, addToCartTiming?: 'beforeLogin' | 'afterLogin'): Promise<{ success: boolean; message: string; taskCount?: number; maxConcurrency?: number }>
    stopTasks(): Promise<{ success: boolean; message: string }>
    stopSelectedTasks(accountMails: string[]): Promise<{ success: boolean; message: string }>
    getTaskQueueStatus(): Promise<{ queueLength: number; runningCount: number; maxConcurrency: number; isProcessing: boolean }>
    setMaxConcurrency(maxConcurrency: number): Promise<{ success: boolean; maxConcurrency: number }>
    resetAccountsStatus(accountMails: string[]): Promise<{ success: boolean; count: number }>
    clearBrowserData(accountMails?: string[]): Promise<{ success: boolean; message: string; clearedCount: number }>
    updateAccountsAddToCartTiming(accountMails: string[], timing: 'beforeLogin' | 'afterLogin'): Promise<{ success: boolean; count: number }>
    // 代理池相关 API
    getProxyPool(): Promise<Array<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date }>>
    addProxyToPool(proxy: string, name?: string): Promise<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date }>
    addProxiesToPool(proxies: Array<{ proxy: string; name?: string }>): Promise<Array<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date }>>
    updateProxyInPool(id: string, proxy?: string, name?: string, enabled?: boolean): Promise<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date }>
    deleteProxyFromPool(id: string): Promise<{ success: boolean; deleted: number }>
    deleteProxiesFromPool(ids: string[]): Promise<{ success: boolean; deleted: number }>
    getRandomProxyFromPool(): Promise<{ id: string; proxy: string; name?: string; enabled: boolean; created_time: Date; updated_time: Date } | null>
    // 打码平台配置相关 API
    getCaptchaConfig(): Promise<{ capmonsterToken: string; twoCaptchaToken: string; defaultService: 'capmonster' | '2captcha'; enableDevTools: boolean }>
    saveCaptchaConfig(capmonsterToken: string, twoCaptchaToken: string, defaultService: 'capmonster' | '2captcha', enableDevTools: boolean): Promise<{ success: boolean }>
  }

  interface Window {
    __API__: typeof __API__
  }

  declare const __TABLE_API__: {
    getAnchorList(options: any): any
    getBossList(options: any): any
    deleteAnchorList(ids: string[]): any
    deleteBossList(ids: string[]): any
  }
}
