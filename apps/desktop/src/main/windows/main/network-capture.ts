import { networkCapture } from "@/net/network-capture";
import { parseJsonpSafeByBase64 } from "@/utils/jsonp";
import * as iconv from 'iconv-lite';
import { parse1688 } from "./pipe-1688";
import { parseTaobao } from "./pipe-taobao";

let lastTaobaoSetachKeyWord = ''
let last1688SetachKeyWord = ''

networkCapture.onResponseItem((item: Record<any, any> = {}) => {
  const { reqError, res, url } = item as Record<string, any>
  if (reqError || !url) return
  if (!res.size) return

  const content = res.base64 ? Buffer.from(res.base64, 'base64').toString('utf8') : ''

  if (url.startsWith('https://item') && url.includes('/item.htm?')) {
    const urls = new URL(url)
    if (urls.searchParams.get('query')) lastTaobaoSetachKeyWord = urls.searchParams.get('query')
  }
  if (url.startsWith('https://s.1688.com/selloffer/offer_search.htm')) {
    const query = url?.split('?')[1] || ''
    const queryMap = {}
    query.split('&').map((str) => queryMap[str.split('=')[0]] = str.split('=')[1])
    if (queryMap['charset'] === 'utf8') {
      last1688SetachKeyWord = decodeURIComponent(queryMap['keywords'])
    } else if (queryMap['keywords']) {
      const keywords = queryMap['keywords']
      const buffer = Buffer.from(keywords.replace(/%/g, ''), 'hex');
      last1688SetachKeyWord = iconv.decode(buffer, 'gbk');
    }
  }

  if (url.startsWith('https://detail.1688.com/offer') && url.includes('.html')) {
    parse1688(last1688SetachKeyWord, content)
  }

  let jsonBody = parseJsonpSafeByBase64(res.base64);
  if (jsonBody) {
    if (url.includes('mtop.taobao.pcdetail.data.get')) {
      parseTaobao(lastTaobaoSetachKeyWord, jsonBody)
    }
  }
})


