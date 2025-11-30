
/**
 * 将代理过的对象转换为普通对象，返回的值都是最终从代理对象中获取的值
*/
export function toFinallyObject(obj: any) {
  const finallyObject = {}
  for (const key in obj) {
    //@ts-ignore
    finallyObject[key] = obj[key]
  }
  return finallyObject
}

