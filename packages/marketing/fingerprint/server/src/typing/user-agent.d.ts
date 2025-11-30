
export type Filter = Partial<UserAgentData> | RegExp | ((data: UserAgentData) => boolean) | string;

export interface Connection {
  downlink?: number | undefined;
  downlinkMax?: any;
  effectiveType?: string | undefined;
  rtt?: number | undefined;
  type?: string | undefined;
}
export interface Platform {

  appCodeName?: string
  appVersion?: string
  versionShort?: string

  /**
   * The platform description.
   */
  description?: string | undefined;
  /**
   * The name of the browser's layout engine.
   *
   * The list of common layout engines include:
   * "Blink", "EdgeHTML", "Gecko", "Trident" and "WebKit"
   */
  layout?: string | undefined;
  /**
   * The name of the product's manufacturer.
   *
   * The list of manufacturers include:
   * "Apple", "Archos", "Amazon", "Asus", "Barnes & Noble", "BlackBerry",
   * "Google", "HP", "HTC", "LG", "Microsoft", "Motorola", "Nintendo",
   * "Nokia", "Samsung" and "Sony"
   */
  manufacturer?: string | undefined;
  /**
   * The name of the browser/environment.
   *
   * The list of common browser names include:
   * "Chrome", "Electron", "Firefox", "Firefox for iOS", "IE",
   * "Microsoft Edge", "PhantomJS", "Safari", "SeaMonkey", "Silk",
   * "Opera Mini" and "Opera"
   *
   * Mobile versions of some browsers have "Mobile" appended to their name:
   * eg. "Chrome Mobile", "Firefox Mobile", "IE Mobile" and "Opera Mobile"
   */
  name?: string | undefined;
  /**
   * The alpha/beta release indicator.
   */
  prerelease?: string | undefined;
  /**
   * The name of the product hosting the browser.
   *
   * The list of common products include:
   *
   * "BlackBerry", "Galaxy S4", "Lumia", "iPad", "iPod", "iPhone", "Kindle",
   * "Kindle Fire", "Nexus", "Nook", "PlayBook", "TouchPad" and "Transformer"
   */
  product?: string | undefined;
  /**
   * The browser's user agent string.
   */
  ua?: string | undefined;
  /**
   * The version of the OS.
   */
  version?: string | undefined;
  /**
   * The name of the operating system.
   */
  os?: OperatingSystem | undefined;
  /**
   * Creates a new platform object.
   * @param [ua=navigator.userAgent] The user agent string or
   *  context object.
   */
  parse(ua?: object | string): Platform;
  /**
   * Returns `platform.description` when the platform object is coerced to a string.
   */
  toString(): string;
}

export type UserAgentData = {
  agent: Platform;
  /**
   *  The value of navigator.appName
   */
  appName: string;
  /**
   *  The value of navigator.connection
   */
  connection?: Connection | undefined;
  /**
   *  The value of navigator.cpuClass
   */
  cpuClass?: string | undefined;
  /**
   * One of desktop, mobile, or tablet depending on the type of device
   */
  deviceCategory?: string | undefined;
  /**
   *  The value of navigator.oscpu
   */
  oscpu?: string | undefined;
  /**
   * The value of navigator.platform
   */
  platform: string;
  /**
   * The value of navigator.plugins.length
   */
  pluginsLength: number;
  /**
   *  The value of screen.height
   */
  screenHeight: number;
  /**
   * The value of screen.width
   */
  screenWidth: number;
  /**
   * The value of navigator.vendor
   */
  vendor: string;
  /**
   * The value of navigator.userAgent
   */
  userAgent: string;
  /**
   * The value of window.innerHeight
   */
  viewportHeight: number;
  /**
   * The value of window.innerWidth
   */
  viewportWidth: number;
}
