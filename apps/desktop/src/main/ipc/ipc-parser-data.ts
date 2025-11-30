import { ProductEntity } from "@/orm/entities/product";
import { ipcMain } from "electron";

ipcMain.handle('save-product-data', async (_, data) => {
  if (!data) return;
  const found = await ProductEntity.findOne({ where: { id: data.id } })
  const product = new ProductEntity();
  Object.assign(product, data);
  await product.save()
  const isFound = !!found
  if (!isFound) {
    console.log(data.type, ' - 入库成功: ', product.title)
  } else {
    console.log(data.type, ' - 已存在: ', product.title)
  }
  return isFound
})
