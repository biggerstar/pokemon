import { app, globalShortcut } from 'electron'
import { browserinternetView } from '../windows/browser/browser'

app.whenReady().then(() => {
  // 注册全局快捷键
  const ret = globalShortcut.register('CommandOrControl+T', () => {
    if (browserinternetView.win) {
      browserinternetView.win.webContents.openDevTools({ mode: 'right' })
    }
  })

  if (!ret) {
    console.error('注册 快捷键 CommandOrControl+T 失败')
  } else {
    console.log('注册 快捷键 CommandOrControl+T 成功')
  }
})
