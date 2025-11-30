import { ElectronWindowEventEnum } from "@/enum/event";
import { contextBridge, ipcRenderer } from 'electron';

const exportApiName = '$fingerPrint'

export function setupFingerPrintIpc() {
  contextBridge.exposeInMainWorld(exportApiName, {
    openView() {
      ipcRenderer.send(ElectronWindowEventEnum.FP_OPEN_VIEW)
    },
    closeView() {
      ipcRenderer.send(ElectronWindowEventEnum.FP_CLOSE_VIEW)
    },
    /** 打开测试指纹窗口 */
    openTestView() {
      ipcRenderer.send(ElectronWindowEventEnum.FP_OPEN_TEST_VIEW)
    },
    /** 关闭测试指纹窗口 */
    closeTestView() {
      ipcRenderer.send(ElectronWindowEventEnum.FP_CLOSE_TEST_VIEW)
    }
  })
}
