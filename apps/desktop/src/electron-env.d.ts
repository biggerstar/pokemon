/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    VSCODE_DEBUG?: 'true';
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬ dist-electron
     * │ ├─┬ main
     * │ │ └── index.js    > Electron-Main
     * │ └─┬ preload
     * │   └── index.mjs   > Preload-Scripts
     * ├─┬ dist
     * │ └── index.html    > Electron-Renderer
     * ```
     */
    APP_ROOT: string;
    /** /dist/ or /public/ */
    APP_PUBLIC: string;
    WEB_DIST: string;
    __dirname: string;
  }

  interface ProcessVersions {
    app: string;
  }
}

declare global {
  declare const ELECTRON_DEV_SERVER_URL: string;
  interface Window {
    __socket__: any
    __require__: any
    FetchUtils: any
  }
}

interface Window {
  __HOME_PAGE_HTML__: string
}

interface Document {
  /**
   * 保存所有的 script-js 导出的模块
   * */
  SCRIPT_JS_MODULES: Record<any, any>
  /**
   * 获取 script-js 导出的模块
   * */
  getScriptJsModule(moduleName: string): Record<any, any> | void

}
