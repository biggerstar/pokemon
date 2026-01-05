import { removeDebugger } from '../common/remove-debugger';
import { usePageLoading } from '../common/use-page-loading';
import { useDevtool } from '../common/use-devtool';
import { initPokemon } from '../site/pokemon-http/init';
import { TaskManager } from '../site/pokemon-http/common/task-manager';
import { processOrderPlaceOrder } from '../site/pokemon-http/order-place-order';
import { ipcRenderer } from 'electron';
import { useEventProxy } from '../common/use-event-proxy';

console.log('浏览器加载成功!');

window['__require__'] = require;
window['require'] = function () {
  return undefined;
} as any;

// useNavigator()
// useTrustedEvent();
usePageLoading();
removeDebugger();
// useEventProxy();
useDevtool({
  enableShortcut: true,
  enableButton: false,
});

if (location.href === 'about:blank') {
  // useAboutBlankPage();
  document.writeln('载入中...');

  // (async () => {
  //   const preLoginUrl = await ipcRenderer.invoke('get-config', 'preLoginUrl')
  //   location.href = preLoginUrl && preLoginUrl.trim() !== '' ? preLoginUrl : DEFAULT_PRE_LOGIN_URL
  // })()
  // location.href = 'http://baidu.com/'
  // location.href = 'https://www.browserscan.net/zh/ipcheck/';
  // location.href = 'https://www.pokemoncenter-online.com/cart/';
  location.href = 'https://www.pokemoncenter-online.com/login/?rurl=1';
}

if (location.href.includes('chrome-error://chromewebdata/')) {
  document.writeln('chrome-error://chromewebdata');
  // location.href = 'https://www.pokemoncenter-online.com/login/';

  // 在 chrome-error 页面，localStorage 不可用，直接通过 IPC 更新任务状态
  // 主进程会通过 event.sender 获取当前窗口，然后找到对应的账号 mail
  ipcRenderer
    .invoke('update-task-status-by-window', '网络或者代理不可用', 'ERROR', true)
    .then(() => {
      console.log('[browser] 已通过窗口标识更新任务状态');
    })
    .catch((error) => {
      console.error('[browser] 更新任务状态失败:', error);
      // 降级处理：尝试使用 TaskManager（可能会失败，因为 localStorage 不可用）
      TaskManager.errorComplete('网络或者代理不可用').catch((err) => {
        console.error('[browser] TaskManager.errorComplete 也失败:', err);
      });
    });
}

// if (location.href.startsWith('https://www.browserscan.net/zh/ipcheck/')) {
//   setTimeout(() => {
//     location.href = 'https://www.pokemoncenter-online.com/mypage/';
//   }, 8000);
// }

if (location.href.includes('https://www.pokemoncenter-online.com/login')) {
  initPokemon();
}

if (
  location.href.includes(
    'https://www.pokemoncenter-online.com/order/?stage=placeOrder',
  )
) {
  TaskManager.updateStatus('下单中...');
  window.addEventListener('load', async () => {
    processOrderPlaceOrder();
  });
}

if (
  location.href.includes('https://www.pokemoncenter-online.com/order-complete/')
) {
  TaskManager.complete('下单成功!').catch((error) => {
    console.error('[browser] 完成任务失败:', error);
  });
}
