import { ProductEntity } from "@/orm/entities/product";

export function parseTaobaoSkuData(data) {
  const props = data.skuBase.props;
  const skus = data.skuBase.skus;
  const sku2info = data.skuCore.sku2info;

  const skuList = skus.map(skuInfo => {
    const propPath: string = skuInfo.propPath
    const skuId = skuInfo.skuId
    const pathLit = propPath.split(';').map(str => str.split(':')).flat(5)
    const result = {}
    for (let i = 0; i < pathLit.length; i += 2) {
      const propsIndex = i / 2
      const curVid = pathLit[i + 1]
      const propsInfo = props[propsIndex]
      const value = propsInfo.values.find(val => val.vid === curVid)
      result[propsIndex] = value
    }
    Object.assign(result, sku2info[skuId])
    return result
  })
  return skuList
}

function parseDeliveryDay(agingDesc) {
  if (agingDesc.includes('24小时内')) return 1
  if (agingDesc.includes('48小时内')) return 2
  if (agingDesc.includes('72小时内')) return 3
  if (agingDesc.includes('天内发货')) {
    const pattern = /(\d+)天内发货/;
    const days = agingDesc.match(pattern)?.[1];
    return +days
  }
  if (agingDesc.includes('明天发货')) return 2
  if (agingDesc.includes('今天发货')) return 1
  return 1
}

export async function parseTaobao(searchKeyword = '', jsonBody) {
  // const regex = /限购(\d+)件/;
  const resultData = jsonBody.data
  const title = resultData.item.title
  const itemId = resultData.item.itemId
  const detailUrl = `https://detail.tmall.com/item.htm?id=${itemId}`
  const agingDesc = resultData.componentsVO?.deliveryVO?.agingDesc || '明天发货'
  const deliveryDay = parseDeliveryDay(agingDesc)
  const skuList = parseTaobaoSkuData(resultData)
  // console.log(`🚀 ~ parseTaobao ~ data:`, data)
  let product: ProductEntity | null = await ProductEntity.findOne({ where: { id: itemId } })
  if (!product) {
    product = new ProductEntity()
    product.id = itemId
  }
  product.title = title
  product.keyword = searchKeyword
  product.detailUrl = detailUrl
  product.skuList = skuList
  product.deliveryDay = deliveryDay
  product.type = 'taobao'
  product.save()
    .then(() => {
      console.log('taobao 入库成功: ',searchKeyword,  title)
    })
    .catch((err) => {
      console.error('taobao 入库失败: ', searchKeyword, title, err.message)
    })
}
