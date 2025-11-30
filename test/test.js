import proxy from 'set-global-proxy';
import whistle from 'whistle';

const port = 9020;
const localhost = '127.0.0.1';

whistle({ port }, (w2) => {
  const isSettingSucess = proxy.enableProxy({
    host: localhost,
    port: port,
    sudo: true,
  });
  console.log(` 已经成功运行 - http://${localhost}:${port}`);
  if (isSettingSucess) console.log(' 成功设置全局代理');
});
