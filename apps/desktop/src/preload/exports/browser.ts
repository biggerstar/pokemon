import { ipcRenderer } from "electron";
import { message } from "ant-design-vue";
import { removeDebugger } from "../common/remove-debugger";
import { usePageLoading } from "../common/use-page-loading";
import { useDBPersonPage } from "../site/db-person/db-person";
import { useKaiyunPage } from "../site/kaiyun/kaiyun";
import { DEFAULT_PRE_LOGIN_URL } from "../constant/define";

console.log('浏览器加载成功!')

// useNavigator()
usePageLoading()
removeDebugger()

message.config({
  top: "120px"
})

if (location.href === 'about:blank') {
  // useAboutBlankPage();
  (async () => {
    const preLoginUrl = await ipcRenderer.invoke('get-config', 'preLoginUrl')
    location.href = preLoginUrl && preLoginUrl.trim() !== '' ? preLoginUrl : DEFAULT_PRE_LOGIN_URL
  })()
  // location.href = 'http://baidu.com/'
}

window.addEventListener('load', ()=> {
  // useKaiyunPage()
  useDBPersonPage()
})

