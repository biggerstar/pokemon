import { session } from 'electron';

// 代理信息接口
export interface ProxyInfo {
  host: string;
  port: string;
  username: string;
  password: string;
}

// 存储当前账号的代理信息（用于认证回调）
export const proxyInfoMap = new Map<string, ProxyInfo>();

// 存储 webContents 的 login 事件监听器，用于清理
export const loginEventListeners = new Map<number, any>();

/**
 * 解析代理字符串格式: http://username:password@host:port
 * 或 host:port:username:password
 */
export function parseProxyString(proxyString?: string): ProxyInfo | null {
  if (!proxyString || typeof proxyString !== 'string' || !proxyString.trim()) {
    return null;
  }

  try {
    let urlString = proxyString.trim();

    // 支持 host:port:username:password 纯分隔格式
    const parts = urlString.split(':');
    if (!urlString.includes('://') && parts.length === 4) {
      const [host, port, username, password] = parts.map((p) => p.trim());
      if (!host || !port) {
        console.error('代理格式错误：缺少主机或端口');
        return null;
      }
      return {
        host,
        port,
        username: decodeURIComponent(username),
        password: decodeURIComponent(password),
      };
    }

    if (!urlString.includes('://')) {
      urlString = `http://${urlString}`;
    }

    const urlInfo = new URL(urlString);

    if (!urlInfo.hostname) {
      console.error('代理格式错误：缺少主机名');
      return null;
    }

    return {
      host: urlInfo.hostname,
      port: urlInfo.port,
      username: decodeURIComponent(urlInfo.username),
      password: decodeURIComponent(urlInfo.password),
    };
  } catch (error) {
    console.error(
      '代理格式解析失败:',
      error instanceof Error ? error.message : String(error),
    );
    console.error('代理字符串:', proxyString);
    return null;
  }
}

/**
 * 清除指定 partition 的所有浏览器数据，还原成纯净状态
 * @param partition partition 名称
 */
export async function clearBrowserData(partition: string): Promise<void> {
  try {
    const targetSession = session.fromPartition(partition);

    console.log(`[Browser] 清除浏览器数据: ${partition}`);

    // 清除所有存储数据
    await targetSession.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'indexdb',
        'websql',
        'cachestorage',
        'shadercache',
        'serviceworkers',
        'filesystem',
      ],
      quotas: [
        'temporary',
        // 'syncable'
      ],
    });

    // 清除缓存
    await targetSession.clearCache();

    // 清除 HTTP 缓存
    await targetSession.clearHostResolverCache();

    console.log(`[Browser] 浏览器数据清除完成: ${partition}`);
  } catch (error) {
    console.error(
      `[Browser] 清除浏览器数据失败 (${partition}):`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * 统一的代理设置函数
 */
export function setupProxyForSession(
  session: Electron.Session,
  proxyInfo: ProxyInfo | null,
  sessionKey: string,
  webContents?: Electron.WebContents,
): void {
  if (!proxyInfo) {
    console.warn('未提供代理信息，跳过代理设置');
    // 即使没有代理信息，也先重置 session 的代理设置，确保是干净状态
    resetSessionProxy(session);
    return;
  }

  // 先清理可能存在的旧代理信息（如果有相同的 sessionKey）
  const oldProxyInfo = proxyInfoMap.get(sessionKey);
  if (oldProxyInfo) {
    console.log(`[Proxy] 清理旧的代理信息: ${sessionKey}`);
    proxyInfoMap.delete(sessionKey);
  }

  // 如果 webContents 存在，先移除旧的监听器
  if (webContents && !webContents.isDestroyed()) {
    const oldListener = loginEventListeners.get(webContents.id);
    if (oldListener) {
      webContents.removeListener('login', oldListener);
      loginEventListeners.delete(webContents.id);
    }
  }

  const proxyRules = `http=${proxyInfo.host}:${proxyInfo.port};https=${proxyInfo.host}:${proxyInfo.port}`;

  // 存储代理信息到 map 中，用于认证回调
  proxyInfoMap.set(sessionKey, proxyInfo);

  // 设置代理规则
  session
    .setProxy({
      mode: 'fixed_servers',
      proxyRules: proxyRules,
    })
    .then(() => {
      console.log('代理设置成功:', proxyInfo);
    })
    .catch((err) => {
      console.error('代理设置失败:', err);
    });

  // 在 webContents 上监听代理认证事件（局部处理）
  if (webContents) {
    // 先移除旧的监听器（如果存在）
    const oldListener = loginEventListeners.get(webContents.id);
    if (oldListener) {
      webContents.removeListener('login', oldListener);
    }

    // 创建新的监听器
    const loginListener = (
      event: Electron.Event,
      authenticationResponseDetails: Electron.AuthenticationResponseDetails,
      authInfo: Electron.AuthInfo,
      callback: (username?: string, password?: string) => void,
    ) => {
      if (!authInfo.isProxy) {
        callback();
        return;
      }

      const sessionProxyInfo = proxyInfoMap.get(sessionKey);
      if (
        sessionProxyInfo &&
        authInfo.host === sessionProxyInfo.host &&
        authInfo.port === parseInt(sessionProxyInfo.port)
      ) {
        callback(sessionProxyInfo.username, sessionProxyInfo.password);
        console.log(
          '代理认证成功:',
          sessionProxyInfo.host,
          sessionProxyInfo.port,
        );
        return;
      }

      callback();
    };

    webContents.on('login', loginListener);
    loginEventListeners.set(webContents.id, loginListener);
  }
}

/**
 * 清理代理设置函数
 */
export function clearProxyForSession(
  session: Electron.Session,
  sessionKey: string,
  webContents?: Electron.WebContents,
): void {
  // 移除代理信息
  proxyInfoMap.delete(sessionKey);

  // 移除事件监听器
  if (webContents && !webContents.isDestroyed()) {
    const listener = loginEventListeners.get(webContents.id);
    if (listener) {
      webContents.removeListener('login', listener);
      loginEventListeners.delete(webContents.id);
    }
  }

  // 重置代理设置为系统默认
  session
    .setProxy({
      mode: 'system',
    })
    .then(() => {
      console.log('代理已清除:', sessionKey);
    })
    .catch((err) => {
      console.error('清除代理失败:', err);
    });
}

/**
 * 重置 session 的代理设置（用于创建新窗口前清理）
 */
export function resetSessionProxy(session: Electron.Session): Promise<void> {
  return session
    .setProxy({
      mode: 'system',
    })
    .then(() => {
      console.log('[Session] 代理已重置为系统默认');
    })
    .catch((err) => {
      console.error('[Session] 重置代理失败:', err);
    });
}

