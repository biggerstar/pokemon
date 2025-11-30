import { ipcRenderer } from "electron";
import { removeDebugger } from "../common/remove-debugger";
import { useNavigator } from "../common/use-navigator";
import { usePageLoading } from "../common/use-page-loading";

console.log('detach-window 浏览器加载成功!')

useNavigator({
  backButton: false,
  refreshButton: false,
  forwardButton: false
})
usePageLoading()
removeDebugger()


function recordDbUrl() {
  window['foundDB'] = false
  setInterval(() => {
    if (window['foundDB']) return
    if (location.href.startsWith('https://pc.next.')) {
      console.log('找到 DB URL', location)
      const dbLaunchUrl = location.origin
      const token = localStorage.getItem('token')
      
      // 保存 DB Launch URL
      ipcRenderer.invoke('save-config', { key: 'dbLaunchUrl', value: dbLaunchUrl }).then(() => {
        console.log('DB Launch URL 已保存到主进程数据库')
      }).catch((error) => {
        console.error('保存 DB Launch URL 失败:', error)
      })

      // 保存 token
      if (token) {
        ipcRenderer.invoke('save-config', { key: 'dbToken', value: token }).then(() => {
          console.log('DB Token 已保存到主进程数据库')
        }).catch((error) => {
          console.error('保存 DB Token 失败:', error)
        })
      }

  
      window['foundDB'] = true
    }
  }, 5000)
}
recordDbUrl()


