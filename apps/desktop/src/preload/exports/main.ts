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
  }
}

window['__API__'] = __API__

// window.addEventListener('DOMContentLoaded', () => {
//   useKaiyunPage()
// })
