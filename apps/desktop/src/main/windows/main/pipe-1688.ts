import { ProductEntity } from '@/orm/entities/product';
import { mainWindow } from '../app/app';

function getScriptContent(b64) {
  const html = new TextDecoder('utf-8').decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const targetEl = Array.from(dom.querySelectorAll('script')).find(node => node.innerText.includes('(window.contextPath'))
  return targetEl.innerText
}

export async function parse1688(searchKeyword = '', content: string) {
  if (!content) return
  const scriptContent = await mainWindow.win.webContents.executeJavaScript(`
    (()=> {
      var base64 = "${Buffer.from(content, 'utf8').toString('base64')}";
        var func = ${getScriptContent.toString()};
        var result = func(base64);
        delete base64;
        delete func;
        return result;
    })()
    `);
  const func = new Function('window', scriptContent);
  const win: any = {};
  func(win);
  const serverResult = win.context?.result
  if (!serverResult) return
  const dataJson = serverResult.data?.Root?.fields?.dataJson
  if (!dataJson) return

  const title = dataJson.tempModel?.offerTitle || ''
  const itemId = dataJson.tempModel?.offerId || dataJson.qrCode
  let product: ProductEntity | null = await ProductEntity.findOne({ where: { id: itemId } })
  if (!product) {
    product = new ProductEntity()
    product.id = itemId
  }
  product.title = title
  product.keyword = searchKeyword
  product.detailUrl = dataJson.qrCode
  product.deliveryDay = 0
  product.type = '1688'
  product.skuList = Object
    .values(dataJson.skuModel.skuInfoMap || dataJson.skuModel.skuInfoMapOriginal)
    .map((item: Record<any, any>) => {
      item.specAttrs = (item.specAttrs as string).replace('&gt', '')
      return item
    })
  product.save()
    .then(() => console.log('1688 入库成功: ', searchKeyword, title))
    .catch((err) => console.error('1688 入库失败: ', searchKeyword, title, err.message))
}
