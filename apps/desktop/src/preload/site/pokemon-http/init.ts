import { TaskManager } from '@/preload/site/pokemon-http/common/task-manager';
import { ipcRenderer } from 'electron';
import { usePokemonHttp } from '@/preload/site/pokemon-http/pokemon-http';
import { useConsolePanel } from '@/preload/common/use-console-panel';
import { whenDocumentElementStart } from '@/utils/dom';
import { sleep } from '@/utils/time';

async function addCoverElement() {
  const coverElement = document.createElement('div');
  coverElement.style.position = 'fixed';
  coverElement.style.top = '0';
  coverElement.style.left = '0';
  coverElement.style.width = '100vw';
  coverElement.style.height = '100vh';
  coverElement.style.backgroundColor = '#FFFFFF';
  coverElement.style.zIndex = '1000000';
  coverElement.style.display = 'flex';
  coverElement.style.flexDirection = 'column';
  coverElement.style.justifyContent = 'flex-end';
  coverElement.style.alignItems = 'center';
  coverElement.style.paddingBottom = '15%';
  coverElement.style.fontSize = '24px';
  coverElement.style.fontFamily = 'Arial, sans-serif';
  coverElement.style.opacity = 'rgba(255, 255, 255, 0.8)';

  // 创建主文本
  const mainText = document.createElement('div');
  mainText.textContent = '已就绪';
  mainText.style.marginBottom = '10px';

  // 创建代理状态文本
  const proxyText = document.createElement('div');
  proxyText.style.fontSize = '16px';
  proxyText.style.marginTop = '10px';

  // 创建代理信息文本
  const proxyInfoText = document.createElement('div');
  proxyInfoText.style.fontSize = '14px';
  proxyInfoText.style.color = '#666666';
  proxyInfoText.style.marginTop = '5px';
  proxyInfoText.style.textAlign = 'center';
  proxyInfoText.style.maxWidth = '80%';
  proxyInfoText.style.wordBreak = 'break-all';

  coverElement.appendChild(mainText);
  coverElement.appendChild(proxyText);
  coverElement.appendChild(proxyInfoText);

  document.body.appendChild(coverElement);

  // 获取实际使用的代理信息
  const updateProxyStatus = async () => {
    try {
      // 通过 IPC 获取当前窗口实际使用的代理信息
      const proxyInfo = (await ipcRenderer.invoke('get-current-proxy')) as {
        host: string;
        port: string;
        username: string;
        password: string;
        displayString: string;
      } | null;

      if (proxyInfo) {
        // 有代理
        proxyText.textContent = '已启用代理';
        console.log('已启用代理', proxyInfo);
        proxyText.style.color = '#52c41a';

        // 显示完整的代理信息（不隐藏）
        const proxyDetails = [
          `代理地址: ${proxyInfo.host}:${proxyInfo.port}`,
          proxyInfo.username ? `用户名: ${proxyInfo.username}` : '',
          proxyInfo.password ? `密码: ${proxyInfo.password}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        proxyInfoText.textContent = proxyDetails;
        proxyInfoText.style.color = '#333333';
        proxyInfoText.style.whiteSpace = 'pre-line';
      } else {
        // 没有代理
        // proxyText.textContent = '未使用代理';
        proxyText.style.color = '#999999';
        proxyInfoText.textContent = '';
      }
    } catch (error) {
      console.warn('[init] 获取代理信息失败:', error);
      proxyText.textContent = '获取代理信息失败';
      proxyText.style.color = '#ff4d4f';
      proxyInfoText.textContent = '';
    }
  };

  // 立即获取一次
  await updateProxyStatus();

  // 每2秒更新一次代理状态
  setInterval(updateProxyStatus, 2000);
}

function listenSetCurrentAccountMail() {
  // 监听主进程发送的账号邮箱信息（作为备用，主要是在 dom-ready 时通过 executeJavaScript 设置）
  ipcRenderer.on('set-current-account-mail', (_event, mail: string) => {
    const oldMail = TaskManager.getCurrentAccountMail();
    TaskManager.setCurrentAccountMail(mail);

    // 如果账号邮箱发生变化，清除旧的任务数据
    if (oldMail && oldMail !== mail) {
      console.log(
        `[Browser] 账号邮箱发生变化: ${oldMail} -> ${mail}，清除旧任务数据`,
      );
      TaskManager.clear();
    }
  });
}

export function initPokemon() {
  Object.defineProperty(window, 'sessionStorage', {
    get: () => localStorage,
  });
  TaskManager.clear();
  console.clear();
  listenSetCurrentAccountMail();
  document.addEventListener('DOMContentLoaded', () => {
    addCoverElement();
    useConsolePanel();
  });
  whenDocumentElementStart(() => {
    const loginBox = document.querySelector('.comLoginBox');
    return [!!loginBox];
  }, 60 * 1000)
    .then(() => {
      useConsolePanel();
      usePokemonHttp();
      sleep(5000).then(() => {
        addCoverElement();
      });
    })
    .catch(() => {
      TaskManager.errorComplete('登录页面加载超时');
    });
  setTimeout(() => {
    useConsolePanel();
  }, 1000);
}
