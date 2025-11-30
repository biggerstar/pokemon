import { AppConfigEntity } from "@/orm/entities/app-config"
import { ProductEntity } from "@/orm/entities/product"
import { ipcMain } from "electron"

ipcMain.handle('get-product-data', async (_ev, options = {}) => {
  const startIndex = options.pageSize && options.pageSize ? options.pageSize * (options.currentPage - 1) : 0
  const [result, count] = await ProductEntity.findAndCount({
    where: options.where,
    take: options.pageSize || 50,
    skip: startIndex ?? 0
  })
  result.forEach((item: any, index) => {
    item.index = startIndex + index + 1
  })
  return {
    code: 0,
    data: {
      items: result,
      total: count
    }
  }
})

ipcMain.handle('get-one-product', async (_ev, id: string) => {
  try {
    // 使用 findOne 方法获取单条数据
    const product = await ProductEntity.findOne({
      where: { id: id.toString() } // 根据ID查询
    });

    if (!product) {
      return {
        code: 404,
        message: 'Product not found'
      };
    }

    return {
      code: 0,
      data: product
    };
  } catch (error) {
    console.error('Error fetching product:', error);
    return {
      code: 500,
      message: 'Internal server error'
    };
  }
});

ipcMain.handle('delete-product', (_ev: any, ids: string[]) => {
  ProductEntity.delete(ids)
})

// 保存 DB Launch URL 到 AppConfig
ipcMain.handle('save-config', async (_ev, { key, value }: { key: string; value: string }) => {
  try {
    // 查找是否已存在配置
    const existingConfig = await AppConfigEntity.findOne({
      where: { key }
    })

    if (existingConfig) {
      // 如果存在，更新值
      existingConfig.value = value
      await existingConfig.save()
    } else {
      // 如果不存在，创建新记录
      const newConfig = new AppConfigEntity()
      newConfig.key = key
      newConfig.value = value
      await newConfig.save()
    }

    return {
      code: 0,
      message: '配置保存成功'
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    return {
      code: 500,
      message: '保存配置失败',
      error: error.message
    }
  }
})

// 获取多个配置
ipcMain.handle('get-configs', async (_ev, keys: string[]) => {
  try {
    // 获取所有配置然后过滤，避免依赖复杂的 ORM 查询语法
    const configs = await AppConfigEntity.find()
    const result: Record<string, any> = {}
    
    configs.forEach(c => {
       if (!keys || keys.length === 0 || keys.includes(c.key)) {
         result[c.key] = c.value
       }
    })
    
    return result
  } catch (error) {
    console.error('批量获取配置失败:', error)
    return {}
  }
})
// 获取 DB Launch URL
ipcMain.handle('get-config', async (_ev, key: string) => {
    try {
      const config = await AppConfigEntity.findOne({
        where: { key }
      })

      if (config) {
        return config.value
      } else {
        return null
      }
    } catch (error) {
      console.error('获取配置失败:', error)
      return null
    }
  })
