
export function removeDebugger() {
  console.log('debugger loaded');
  // 保存原生 setInterval 方法
  const originalSetInterval = window.setInterval;

  // 重写 setInterval
  (window as any).setInterval = function (callback, delay, ...args) {
    // 1. 处理回调函数的不同形式（函数/字符串）
    let callbackStr = '';
    if (typeof callback === 'function') {
      callbackStr = callback.toString(); // 函数转字符串
    } else if (typeof callback === 'string') {
      callbackStr = callback; // 直接传入的代码字符串
    }

    // 2. 检测是否包含 debugger 关键字（忽略空格/换行）
    const hasDebugger = /\bdebugger\b/.test(callbackStr.replace(/\s+/g, ''));

    if (hasDebugger) {
      // 拒绝创建定时器并抛出错误
      console.error('[拦截提示] 禁止创建包含 debugger 的 setInterval 定时器');
      throw new Error('setInterval 回调函数包含 debugger，已拦截');
    }

    // 3. 无 debugger 则执行原生 setInterval
    return originalSetInterval.call(window, callback, delay, ...args);
  };
} 
