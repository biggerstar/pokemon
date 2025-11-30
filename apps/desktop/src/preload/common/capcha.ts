import { ipcRenderer } from "electron";

export async function capchaSolve() {
  const keys = Object.keys(localStorage);
  const teaCacheTokens = keys.filter(key => key.startsWith('__tea_cache_tokens_'));
  console.log(`🚀 ~ capchaSolve ~ teaCacheTokens:`, teaCacheTokens)
  if (teaCacheTokens.length === 0) return
  let webId: string | undefined
  teaCacheTokens.forEach(key => {
    if (localStorage.getItem(key)) {
      try {
        const json = JSON.parse(localStorage.getItem(key))
        const web_id = json.web_id
        if (web_id?.startsWith('verify_')) webId = web_id
      } catch (e) {
      }
    }
  });
  console.log('验证码 webId', webId)
  if (!webId) return
  const data = {
    "region": "sg",
    "subtype": "3d",
    "detail": "",
    "fp": webId,
    "server_sdk_env": "{\"idc\":\"sg1\",\"region\":\"ALISG\",\"server_type\":\"passport\"}",
    "did": "0",
    "msToken": "",
    "user_agent": navigator.userAgent
  }
  return ipcRenderer
    .invoke('capcha-solve', data)
    .then(result => {
      console.log(`验证码验证结果`, new Date(), result)
      if (result?.data?.code === 200) {
        location.reload()
        // alert('验证通过')
      }
    })
    .catch(error => console.log('error', error));
}


