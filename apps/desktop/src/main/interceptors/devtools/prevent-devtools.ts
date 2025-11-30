import { globalEnv } from "@/global/global-env"
import { protocol, type Session } from "electron"

const privileges: Electron.Privileges = {
  standard: true,
  secure: true,
  bypassCSP: false,
  supportFetchAPI: false
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'devtools',
    privileges
  },
])

/**
 * 阻止某个 session 打开开发工具
 * 可以直接从源头上解决问题，完全阻止 ctrl + shift + i, 或者 菜单栏 toggle developer tools  等任何方式打开开发者工具
*/
export function preventDevtools(session: Session) {
  if (globalEnv.isDev) return
  session.webRequest.onBeforeRequest(
    {
      urls: ['devtools://*/*']
    },
    (_details, callback) => {
      callback({ cancel: true })
    })
}

