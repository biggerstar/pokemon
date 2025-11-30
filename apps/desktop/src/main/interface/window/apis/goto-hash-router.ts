import { globalEnv } from "@/global/global-env";
import type { LoadFileOptions, LoadURLOptions } from "electron";

type URLCustomOptions = {
  /**
   * 载入页面的 search
   * */
  search?: string | URLSearchParams;
  /**
   * 载入页面的 hash,
   * 传入支持携带 #， 例如#/router,
   * 也可以不带 #, 例如 /router
   * */
  hash: string;
}

export type LoadURLCustomOptions = LoadURLOptions & URLCustomOptions
export type LoadFileCustomOptions = LoadFileOptions & URLCustomOptions
export type GoToUrlCustomOptions = LoadURLCustomOptions | LoadFileCustomOptions

/**
 * 封装了 loadURL 和 loadFile 方法， 方便直接传入一个路径即可加载本地主应用的页面, 如果没传入 url 则默认载入主应用首页, 支持 url 或者 文件系统路径
 * */
export function gotoHashRouter(options: GoToUrlCustomOptions) {
  const clientEncryptor = true
  const clientEncryptorName = 'myclient'
  const urlWhiteList = ['http:', 'https:'];
  const appRootUrl = globalEnv.getWebRootUrl();
  const isHttpUrl = urlWhiteList.some(prefix => appRootUrl?.startsWith(prefix));
  if (isHttpUrl) {
    const urlInfo = new URL(appRootUrl, 'myclient://');
    if (options.hash) urlInfo.hash = urlInfo.hash.startsWith('#') ? urlInfo.hash : `#${options.hash}`;
    if (options.search) urlInfo.search = options.search.toString();
    return this.loadURL(urlInfo.toString(), options as LoadURLCustomOptions);
  }
  // else if (clientEncryptor) {
  //   const urlInfo = new URL(`${clientEncryptorName}:/${appRootUrl}`);
  //   if (options.hash) urlInfo.hash = urlInfo.hash.startsWith('#') ? urlInfo.hash : `#${options.hash}`;
  //   if (options.search) urlInfo.search = options.search.toString();
  //   return this.loadFile(urlInfo.toString(), options as LoadURLCustomOptions);
  // }
  else {
    if (options.hash) options.hash = options.hash.startsWith('#') ? options.hash : `#${options.hash}`;
    if (options.search) options.search = options.search.toString();
    return this.loadFile(`${appRootUrl}/index.html`, options as LoadFileCustomOptions);
  }
}
