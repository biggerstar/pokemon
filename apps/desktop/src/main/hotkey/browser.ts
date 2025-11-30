import { app, globalShortcut } from 'electron'
import { browserinternetView } from '../windows/browser/browser'

app.whenReady().then(() => {
  // 注册全局快捷键
  const ret = globalShortcut.register('CommandOrControl+E', () => {
    browserinternetView.currentShowStatus()
      ? browserinternetView.hideWindow()
      : browserinternetView.showWindow()
  })

  if (!ret) {
    console.error('注册 快捷键 CommandOrControl+E 失败')
  } else {
    console.log('注册 快捷键 CommandOrControl+E 成功')
  }
})
