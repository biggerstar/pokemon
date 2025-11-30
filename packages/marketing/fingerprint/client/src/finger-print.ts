import { complementariesEnvironment } from "./indicators/complementaries-environment";
import { setupNavigator } from "./indicators/navigator";


/**
 * script-js 可以直接使用该函数注入指纹信息到浏览器页面中
 * */
export async function injectFingerPrint(config: any, targetWindow?: WindowProxy) {
  targetWindow = targetWindow ?? window
  setupNavigator(targetWindow, config)
  complementariesEnvironment(targetWindow, config)
}

