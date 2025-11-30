import type { FingerPrintGenerator } from "@marketing/fingerprint-server"


function chromeInterface(targetWindow: WindowProxy, config: FingerPrintGenerator) {
  const isChrome = /Chrome/.test(config.userAgent)
  if (!isChrome) return
  try {
    //@ts-ignore
    targetWindow.chrome
  } catch (e) {
    return
  }
  //@ts-ignore
  targetWindow.chrome = targetWindow.chrome || targetWindow.parent.chrome || {}
}

/**
 * 为当前的 frame 窗口补全环境
*/
export function complementariesEnvironment(targetWindow: WindowProxy, config: FingerPrintGenerator) {
  chromeInterface(targetWindow, config)
}

