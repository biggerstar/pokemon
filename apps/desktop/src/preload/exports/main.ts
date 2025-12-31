import { ipcRenderer } from "electron/renderer";
import { useTitlebar } from "../common/titlebar";

console.log('main preload 加载成功');

useTitlebar({
  color: '#FFFFFF',
  resetPosition: true,
  overflowHidden: true,
  titleSuffix: {
    suffix: ` `,
    showVersion: false,
    // separator: ' - ',
  }
})

const __API__ = {
  async login(options = {}) {
    return ipcRenderer.invoke('login', options)
  },
  async getPruductList(options = {}) {
    return ipcRenderer.invoke('get-product-data', options)
  },
  async getOneList(options = {}) {
    return ipcRenderer.invoke('get-one-product', options)
  },
  async deleteProduct(ids = {}) {
    return ipcRenderer.invoke('delete-product', ids)
  },
  async getTableList(options = {}) {
    return ipcRenderer.invoke('get-table-list', options)
  },
  async clearTableList(ids?: string[]) {
    return ipcRenderer.invoke('clear-table-list', ids)
  },
  showWindow() {
    return ipcRenderer.invoke('show-window');
  },
  hideWindow() {
    return ipcRenderer.invoke('hide-window');
  },
  isShow() {
    return ipcRenderer.invoke('is-window-show');
  },
  loadURL(url: string) {
    return ipcRenderer.invoke('load-url', url);
  },
  getURL() {
    return ipcRenderer.invoke('get-current-url');
  },
  openBrowserWindow(url: string, show: boolean = false) {
    return ipcRenderer.invoke('open-browser-window', url, show);
  },
  saveConfig(key: string, value: string) {
    return ipcRenderer.invoke('save-config', { key, value });
  },
  getConfig(key: string) {
    return ipcRenderer.invoke('get-config', key);
  },
  isDev() {
    return ipcRenderer.invoke('is-dev');
  },
  getAccounts() {
    return ipcRenderer.invoke('get-accounts');
  },
  saveAccounts(accounts: any[]) {
    return ipcRenderer.invoke('save-accounts', accounts);
  },
  deleteAccounts(ids: string[]) {
    return ipcRenderer.invoke('delete-accounts', ids);
  },
  // 任务相关 API
  getTask() {
    return ipcRenderer.invoke('get-task');
  },
  updateTaskStatus(id: string, status: string, statusText?: string) {
    return ipcRenderer.invoke('update-task-status', id, status, statusText || '');
  },
  resetProcessingTasks() {
    return ipcRenderer.invoke('reset-processing-tasks');
  },
  initAllTasks() {
    return ipcRenderer.invoke('init-all-tasks');
  },
  // 获取所有账号（用于调试）
  getAllAccountsStatus() {
    return ipcRenderer.invoke('get-accounts');
  },
  startTasks(accountIds: string[], maxConcurrency?: number, show?: boolean, enableProxy?: boolean, clearBrowserData?: boolean, maxRetryCount?: number, addToCartTiming?: 'beforeLogin' | 'afterLogin') {
    return ipcRenderer.invoke('start-tasks', accountIds, maxConcurrency, show, enableProxy, clearBrowserData, maxRetryCount, addToCartTiming);
  },
  clearBrowserData(accountMails?: string[]) {
    return ipcRenderer.invoke('clear-browser-data', accountMails);
  },
  stopTasks() {
    return ipcRenderer.invoke('stop-tasks');
  },
  stopSelectedTasks(accountIds: string[]) {
    return ipcRenderer.invoke('stop-selected-tasks', accountIds);
  },
  getTaskQueueStatus() {
    return ipcRenderer.invoke('get-task-queue-status');
  },
  setMaxConcurrency(maxConcurrency: number) {
    return ipcRenderer.invoke('set-max-concurrency', maxConcurrency);
  },
  resetAccountsStatus(accountIds: string[]) {
    return ipcRenderer.invoke('reset-accounts-status', accountIds);
  },
  // 代理池相关 API
  getProxyPool() {
    return ipcRenderer.invoke('get-proxy-pool');
  },
  addProxyToPool(proxy: string, name?: string) {
    return ipcRenderer.invoke('add-proxy-to-pool', proxy, name);
  },
  addProxiesToPool(proxies: Array<{ proxy: string; name?: string }>) {
    return ipcRenderer.invoke('add-proxies-to-pool', proxies);
  },
  updateProxyInPool(id: string, proxy?: string, name?: string, enabled?: boolean) {
    return ipcRenderer.invoke('update-proxy-in-pool', id, proxy, name, enabled);
  },
  deleteProxyFromPool(id: string) {
    return ipcRenderer.invoke('delete-proxy-from-pool', id);
  },
  deleteProxiesFromPool(ids: string[]) {
    return ipcRenderer.invoke('delete-proxies-from-pool', ids);
  },
  getRandomProxyFromPool() {
    return ipcRenderer.invoke('get-random-proxy-from-pool');
  },
  checkProxyStatus(proxy: string) {
    return ipcRenderer.invoke('check-proxy-status', proxy);
  },
  checkProxiesStatus(proxyIds?: string[]) {
    return ipcRenderer.invoke('check-proxies-status', proxyIds);
  },
  // 打码平台配置相关 API
  getCaptchaConfig() {
    return ipcRenderer.invoke('get-captcha-config');
  },
  saveCaptchaConfig(capmonsterToken: string, twoCaptchaToken: string, defaultService: 'capmonster' | '2captcha', enableDevTools: boolean) {
    return ipcRenderer.invoke('save-captcha-config', capmonsterToken, twoCaptchaToken, defaultService, enableDevTools);
  }
}

window['__API__'] = __API__

// window.addEventListener('DOMContentLoaded', () => {
//   useKaiyunPage()
// })
