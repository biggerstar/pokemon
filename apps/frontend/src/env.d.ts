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
