/**
 * 当出现 document.documentElement 出现时返回，正常用于 preload 脚本保证 DOM 已经加载完成
 * 此时加载时机类似 浏览器拓展 document_start 阶段, 此时已经加载了首页 html 的 DOM，但不包括样式和脚本
 * */
export function whenDocumentElementStart(condition?: (window: Window) => boolean[], timeout: number = 500): Promise<void> {
  if (!condition) condition = () => []
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (document.documentElement && condition(window).every(Boolean)) {
        clearInterval(timer);
        resolve(void 0);
      }
      if (Date.now() - startTime > timeout) {
        clearInterval(timer);
        reject(new Error('whenDocumentElementStart timeout'));
      }
    });
  });
}
