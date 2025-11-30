
/**
 * 伪造函数原型模仿原生 toString 和 valueOf 行为，防止被检测
 * */
export function fakeFunctionPrototype(func: Function, funcNativeName: string) {
  const call = () => `function ${funcNativeName}() { [native code] }`

  Object.defineProperty(func, 'toString', {
    value: call,
  })
  Object.defineProperty(func, 'valueOf', {
    value: call,
  })
}

/**
 * 使用 defineProperty 合并某个对象上的值到目标对象
*/
export function mergeObjectAttribute(target: Record<any, any>, from: Record<any, any>, keys?: string[]) {
  keys = keys ?? Object.keys(from)
  keys.forEach(key => {
    Object.defineProperty(target, key, {
      value: from[key],
    })
  })
}
