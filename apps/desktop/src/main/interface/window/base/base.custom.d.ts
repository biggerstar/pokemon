import { BrowserWindowConstructorOptions, WebContentsViewConstructorOptions } from "electron";

type PreloadName = 'main' 

interface CommonCustomOptions {
  /**
   * 指定当前窗口的 preload 文件, 这里直接使用文件名就行(不包含后缀)，默认应用文件为打包后 preload 文件夹下的对应 js 文件
   * 需要注意的是, 使用 preload 需要手动将 webPreferences.sandbox 关闭
   * */
  preloadName?: PreloadName;
  /**
   * 同 preloadName， 不过这里 preloadCjsName 使用的是 cjs 模块
   * */
  preloadCjsName?: PreloadName;

  /**
   * 使用的入口 html 文件， 暂时未实现
   * */
  // entryHtmlName?: string;

  /**
   * 是否打开开发者工具, 只在开发模式下生效， 默认为 false
   * */
  openDevTools?: boolean;
}

export interface BaseHashRouterWebContentsViewOptions extends CommonCustomOptions, WebContentsViewConstructorOptions {
}

export interface BaseHashRouterBrowserWindowOptions extends CommonCustomOptions, BrowserWindowConstructorOptions {
  /**
   * 指定当前窗口的 icon, 这里直接使用文件名就行了(需包含后缀)，默认应用文件为打包后 images 文件夹下的对应图片资源文件
   * */
  iconName?: string;

  /**
   * 窗口准备好后延迟显示的时间， 需要打开 autoShow 才能生效 ，不指定则在 ready-to-show 事件后立刻显示
   * */
  delayShowTime?: number

  /**
   * 当点击窗口关闭的时候进行窗口隐藏， 默认为 false
   * */
  hideOnClose?: boolean

  /**
   * 指定该窗口是否自动显示, 默认为 false
   * */
  autoShow?: boolean
}
