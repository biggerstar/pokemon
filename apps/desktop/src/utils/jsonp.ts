/**
 * 通用 JSONP/JSON 解析器
 * 可以解析 JSONP 格式或普通 JSON 格式的文本
 * @param {string} text - JSONP 或 JSON 格式的文本
 * @returns {Object|null} - 解析后的 JavaScript 对象，失败时返回 null
 */
export function parseJsonp(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    // 去除首尾空白字符
    const cleanText = text.trim();

    // 方法1：尝试直接解析为 JSON（最常见的情况）
    try {
      return JSON.parse(cleanText);
    } catch (jsonError) {
      // JSON 解析失败，继续尝试 JSONP 解析
    }

    // 方法2：使用正则表达式匹配 JSONP 格式
    // 匹配 callback_name({...}) 或 callback_name([...]) 格式
    const jsonpRegex = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*(.+)\s*\)$/;
    const match = cleanText.match(jsonpRegex);

    if (match) {
      const jsonString = match[2];
      return JSON.parse(jsonString);
    }

    // 方法3：如果正则匹配失败，尝试更宽松的解析
    // 找到第一个 '(' 和最后一个 ')'
    const firstParen = cleanText.indexOf('(');
    const lastParen = cleanText.lastIndexOf(')');

    if (firstParen !== -1 && lastParen !== -1 && firstParen < lastParen) {
      const jsonString = cleanText.substring(firstParen + 1, lastParen);
      return JSON.parse(jsonString);
    }

    return null;

  } catch (error) {
    // 所有解析方法都失败，返回 null
    return null;
  }
}

/**
* 安全的 JSONP/JSON 解析器（使用 VM 沙箱）
* 更安全但性能稍差的解析方式
* @param {string} text - JSONP 或 JSON 格式的文本
* @returns {Object|null} - 解析后的 JavaScript 对象，失败时返回 null
*/
export function parseJsonpSafe(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  try {
    const cleanText = text.trim();

    // 首先尝试直接解析为 JSON
    try {
      return JSON.parse(cleanText);
    } catch (jsonError) {
      // JSON 解析失败，继续尝试 JSONP 解析
    }

    const vm = require('vm');
    let result = null;

    // 创建一个沙箱环境
    const sandbox = {
      // 创建一个通用的回调函数，它会捕获传入的数据
      __jsonp_callback__: function (data) {
        result = data;
      }
    };

    // 将所有可能的回调函数名都指向同一个处理函数
    const callbackMatch = cleanText.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);

    if (callbackMatch) {
      const callbackName = callbackMatch[1];
      sandbox[callbackName] = sandbox.__jsonp_callback__;
    }

    // 在沙箱中执行 JSONP 代码
    vm.createContext(sandbox);
    vm.runInContext(cleanText, sandbox, { timeout: 1000 });
    return result;
  } catch (error) {
    // 如果 VM 方法失败，回退到正则方法
    return parseJsonp(text);
  }
}

export function parseJsonpSafeByBase64(base64) {
  try {
    return parseJsonpSafe(Buffer.from(base64, 'base64').toString('utf8'))
  } catch (_e) {
    return null
  }
}

