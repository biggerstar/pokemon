import { DEFAULT_PRE_LOGIN_URL } from '@/preload/constant/define';
import { ipcRenderer } from 'electron';

export async function useKaiyunPage() {
  console.log('kaiyun 页面加载成功!');
  let isNextReload = false;
  setInterval(async () => {
    const isSHow = await ipcRenderer.invoke('is-window-show');
    if (isSHow) {
      if (isNextReload) {
        ipcRenderer.invoke('save-config', { key: 'isRunning', value: false });
        const preLoginUrl = await ipcRenderer.invoke(
          'get-config',
          'preLoginUrl',
        );
        if (preLoginUrl && preLoginUrl.trim() !== '') {
          window.location.href = preLoginUrl;
          return;
        }
        location.href = DEFAULT_PRE_LOGIN_URL;
      }
    } else {
      isNextReload = true;
      document.body.style.opacity = '0';
    }
  }, 500);
}
