import globalProxy from 'set-global-proxy';
import VProxy from 'v-proxy';
console.log(`🚀 ~ VProxy:`, VProxy)

const port = 8899;
const localhost = '127.0.0.1';
const isSettingSucess = globalProxy.enableProxy({
  host: localhost,
  port: port,
  sudo: true,
});
if (isSettingSucess) console.log(' 成功设置全局代理');
