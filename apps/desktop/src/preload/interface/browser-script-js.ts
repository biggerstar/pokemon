import { globalRendererPathParser } from "@/global/global-renderer-path-parser";
import { whenDocumentElementStart } from "@/utils/dom";
import { contextBridge } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * 如果没使用 node 集成的话， 在 preload 中导入的 js 在浏览器环境是被隔离的
 * 该函数将能直接将代码注入到 浏览器环境中, 且代码可以直接在 preload 调用
 * 该类的目的就是隔断 window 调用链获取到模块
 * 请注意如非必要， 不要将任何模块挂载到 window 和任何可通过访问链获取到的对象上
 * 当前提供了以下方式
 * 1. import  通过 import() 动态引入，将会在浏览器网络中发起请求，可被观测到
 * 2. eval   直接通过 fs 读取到代码在浏览器端执行, 不会有网络请求
 * */
export class BrowserScriptJs {
  private static _getFilePath(scriptPath: string): string {
    return globalRendererPathParser.resolveScriptJs(scriptPath).toString();
  }

  public static modules = new Map()

  public static async import<T extends any>(scriptName: string): Promise<T> {
    if (this.modules.has(scriptName)) return this.modules.get(scriptName) as T
    const fpPath = BrowserScriptJs._getFilePath(scriptName);
    const pathInfo = path.parse(fpPath);
    const moduleName = pathInfo.name
    const callbackFuncName = `$${Math.random().toString()}${Math.random().toString()}${moduleName + Date.now()}`
    const runCode = `$$$exportModule$$$.module = await import("${fpPath}").then((module) => module.default);`
    return this._patchScript(callbackFuncName, scriptName, runCode)
  }

  public static async eval<T extends any>(scriptName: string): Promise<T> {
    if (this.modules.has(scriptName)) return this.modules.get(scriptName) as T
    const fpPath = BrowserScriptJs._getFilePath(scriptName);
    let code = fs.readFileSync(fpPath, 'utf-8')
    // console.log(code)
    const pathInfo = path.parse(fpPath);
    const moduleName = pathInfo.name
    const callbackFuncName = `$${Math.random().toString()}${Math.random().toString()}${moduleName + Date.now()}`

    const exportIndex = code.lastIndexOf('export')
    if (exportIndex !== -1) {
      const startCode = code.slice(0, exportIndex)
      const exportCode = code.slice(exportIndex)
        .replace('export', '')

      const exportCodePart = exportCode
        .split('\n')
        .map(str => {
          if (!str.includes(' as ')) return str
          const [target, name] = str.replace(',', '').split(' as ')
          return `${name} : ${target},`
        })
      code = startCode + `\n$$$exportModule$$$.module = ` + exportCodePart.join('\n')
    }
    return this._patchScript(callbackFuncName, scriptName, code)
  }

  public static async _patchScript(callbackFuncName: string, scriptName: string, runCode: string) {
    let module = void 0
    const scriptEl = document.createElement('script')
    scriptEl.type = 'module'
    scriptEl.innerText = `
      (async ()=> {
        const $$$exportModule$$$ = {};
        ${runCode}
        ;window["${callbackFuncName}"].on($$$exportModule$$$.module.default || $$$exportModule$$$.module);
      })()
    `
    contextBridge.exposeInMainWorld(callbackFuncName, {
      on: (_module: any) => {
        if (module === null) return
        module = _module
      }
    });
    await whenDocumentElementStart()
    document.head.appendChild(scriptEl)
    scriptEl.remove()
    await whenDocumentElementStart(() => [module])
    this.modules.set(scriptName, module)
    const _module = module
    module = null
    return _module
  }
}
