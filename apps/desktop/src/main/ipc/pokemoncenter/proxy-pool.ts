import { ipcMain, BrowserWindow, session } from 'electron';
import { ProxyPoolEntity } from '@/orm/entities/proxy-pool';
import { AppDataSource } from '@/orm/data-source';
import { ensureDataSourceReady } from './utils';
import { parseProxyString, setupProxyForSession, resetSessionProxy } from '@/main/windows/browser/browser/common';

export function registerProxyPoolHandlers(ipcMain: typeof import('electron').ipcMain) {
  // 移除可能存在的旧处理器，避免重复注册
  ipcMain.removeHandler('get-proxy-pool');
  ipcMain.removeHandler('add-proxy-to-pool');
  ipcMain.removeHandler('add-proxies-to-pool');
  ipcMain.removeHandler('update-proxy-in-pool');
  ipcMain.removeHandler('delete-proxy-from-pool');
  ipcMain.removeHandler('delete-proxies-from-pool');
  ipcMain.removeHandler('get-random-proxy-from-pool');
  ipcMain.removeHandler('check-proxy-status');
  ipcMain.removeHandler('check-proxies-status');

  /**
   * 获取代理池列表
   */
  ipcMain.handle('get-proxy-pool', async () => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);
    const proxies = await repo.find({
      order: {
        created_time: 'DESC',
      },
    });
    return proxies;
  });

  /**
   * 添加单个代理到代理池
   */
  ipcMain.handle('add-proxy-to-pool', async (_event, proxy: string, name?: string) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    // 检查是否已存在相同的代理地址
    const existing = await repo.findOne({ where: { proxy } });
    if (existing) {
      throw new Error('该代理地址已存在');
    }

    const entity = repo.create({
      proxy,
      name: name || undefined,
      enabled: true,
    });

    const saved = await repo.save(entity);
    return saved;
  });

  /**
   * 批量添加代理到代理池
   */
  ipcMain.handle('add-proxies-to-pool', async (_event, proxies: Array<{ proxy: string; name?: string }>) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    const savedProxies: ProxyPoolEntity[] = [];

    for (const proxyData of proxies) {
      // 检查是否已存在相同的代理地址
      const existing = await repo.findOne({ where: { proxy: proxyData.proxy } });
      if (existing) {
        continue; // 跳过已存在的代理
      }

      const entity = repo.create({
        proxy: proxyData.proxy,
        name: proxyData.name || undefined,
        enabled: true,
      });

      const saved = await repo.save(entity);
      savedProxies.push(saved);
    }

    return savedProxies;
  });

  /**
   * 更新代理池中的代理
   */
  ipcMain.handle('update-proxy-in-pool', async (_event, id: string, proxy?: string, name?: string, enabled?: boolean) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    const entity = await repo.findOne({ where: { id } });
    if (!entity) {
      throw new Error('代理不存在');
    }

    if (proxy !== undefined) {
      // 如果更新代理地址，检查是否与其他代理重复
      const existing = await repo.findOne({ where: { proxy } });
      if (existing && existing.id !== id) {
        throw new Error('该代理地址已被其他代理使用');
      }
      entity.proxy = proxy;
    }

    if (name !== undefined) {
      entity.name = name || undefined;
    }

    if (enabled !== undefined) {
      entity.enabled = enabled;
    }

    const updated = await repo.save(entity);
    return updated;
  });

  /**
   * 从代理池删除单个代理
   */
  ipcMain.handle('delete-proxy-from-pool', async (_event, id: string) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    const result = await repo.delete(id);
    return {
      success: true,
      deleted: result.affected || 0,
    };
  });

  /**
   * 从代理池批量删除代理
   */
  ipcMain.handle('delete-proxies-from-pool', async (_event, ids: string[]) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    const result = await repo.delete(ids);
    return {
      success: true,
      deleted: result.affected || 0,
    };
  });

  /**
   * 从代理池随机获取一个启用的代理
   */
  ipcMain.handle('get-random-proxy-from-pool', async () => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    const proxies = await repo.find({
      where: { enabled: true },
    });

    if (proxies.length === 0) {
      return null;
    }

    // 随机选择一个
    const randomIndex = Math.floor(Math.random() * proxies.length);
    return proxies[randomIndex] || null;
  });

  /**
   * 内部函数：检查单个代理状态
   */
  async function checkSingleProxy(proxyString: string): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const testUrl = 'http://httpbin.org/ip'; // 测试URL
    const timeout = 10000; // 10秒超时
    const partition = `temp-proxy-check-${Date.now()}-${Math.random()}`;
    
    let testWindow: BrowserWindow | null = null;
    
    try {
      // 解析代理字符串
      const proxyInfo = parseProxyString(proxyString);
      if (!proxyInfo) {
        return {
          success: false,
          error: '代理格式错误',
        };
      }

      // 创建临时session用于测试
      const testSession = session.fromPartition(partition);
      
      // 设置代理
      await new Promise<void>((resolve, reject) => {
        const proxyRules = `http=${proxyInfo.host}:${proxyInfo.port};https=${proxyInfo.host}:${proxyInfo.port}`;
        testSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: proxyRules,
        }).then(() => {
          resolve();
        }).catch((err) => {
          reject(new Error(`设置代理失败: ${err.message}`));
        });
      });

      // 监听代理认证（如果需要用户名和密码）
      if (proxyInfo.username && proxyInfo.password) {
        testSession.setProxy({
          mode: 'fixed_servers',
          proxyRules: `http=${proxyInfo.host}:${proxyInfo.port};https=${proxyInfo.host}:${proxyInfo.port}`,
        });
        
        // 监听登录事件以提供代理认证
        testSession.on('login', (event, details, callback) => {
          event.preventDefault();
          callback(proxyInfo.username, proxyInfo.password);
        });
      }

      // 创建隐藏的测试窗口
      testWindow = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        webPreferences: {
          session: testSession,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // 记录开始时间
      const startTime = Date.now();

      // 加载测试URL并等待响应
      const result = await Promise.race([
        new Promise<{ success: boolean; latency: number; error?: string }>((resolve) => {
          let resolved = false;
          
          const timeoutId = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve({
                success: false,
                latency: timeout,
                error: '请求超时',
              });
            }
          }, timeout);

          testWindow!.webContents.once('did-finish-load', () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              const latency = Date.now() - startTime;
              resolve({
                success: true,
                latency,
              });
            }
          });

          testWindow!.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              const latency = Date.now() - startTime;
              resolve({
                success: false,
                latency,
                error: `加载失败: ${errorDescription} (${errorCode})`,
              });
            }
          });

          // 开始加载
          testWindow!.loadURL(testUrl);
        }),
        new Promise<{ success: boolean; latency: number; error: string }>((resolve) => {
          setTimeout(() => {
            resolve({
              success: false,
              latency: timeout,
              error: '请求超时',
            });
          }, timeout);
        }),
      ]);

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 清理资源
      if (testWindow && !testWindow.isDestroyed()) {
        testWindow.close();
      }
      
      // 清理临时session
      try {
        const testSession = session.fromPartition(partition);
        await resetSessionProxy(testSession);
        await testSession.clearStorageData();
      } catch (error) {
        // 忽略清理错误
        console.warn('清理测试session失败:', error);
      }
    }
  }

  /**
   * 检查代理状态（IPC处理器）
   */
  ipcMain.handle('check-proxy-status', async (_event, proxyString: string) => {
    return await checkSingleProxy(proxyString);
  });

  /**
   * 批量检查代理状态
   * @param proxyIds 代理ID数组，如果为空则检查所有启用的代理
   * @returns 检查结果数组
   */
  ipcMain.handle('check-proxies-status', async (_event, proxyIds?: string[]) => {
    await ensureDataSourceReady();
    const repo = AppDataSource.getRepository(ProxyPoolEntity);

    let proxies: ProxyPoolEntity[];
    if (proxyIds && proxyIds.length > 0) {
      proxies = await repo.find({
        where: proxyIds.map(id => ({ id })),
      });
    } else {
      proxies = await repo.find({
        where: { enabled: true },
      });
    }

    const results: Array<{
      id: string;
      proxy: string;
      success: boolean;
      latency?: number;
      error?: string;
    }> = [];

    // 并发检查，但限制并发数
    const concurrency = 5;
    for (let i = 0; i < proxies.length; i += concurrency) {
      const batch = proxies.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (proxy) => {
          const result = await checkSingleProxy(proxy.proxy);
          return {
            id: proxy.id,
            proxy: proxy.proxy,
            ...result,
          };
        })
      );
      results.push(...batchResults);
    }

    return results;
  });
}

