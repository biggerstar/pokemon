import { ipcMain } from 'electron';
import { ProxyPoolEntity } from '@/orm/entities/proxy-pool';
import { AppDataSource } from '@/orm/data-source';
import { ensureDataSourceReady } from './utils';

export function registerProxyPoolHandlers(ipcMain: typeof import('electron').ipcMain) {
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
}

