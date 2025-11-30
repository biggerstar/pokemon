type HookerDescriptor<Target = Record<any, any>> = PropertyDescriptor | ((originValue: any, target: Target) => PropertyDescriptor)

/**
 * 重定义 js 对象的基础类
 * */
export class BasePropertyHooker {
  /** 通过 defineProperty 重定义 JS 对象 */
  public static defineProperty<Target = Record<any, any>>(
    target: Record<any, any> | Target,
    key: keyof Target,
    descriptor: HookerDescriptor<Target>,
  ) {
    if (!target || typeof target !== 'object') {
      console.error(`[BaseObjectHooker] target is required. key: ${key.toString()}`);
      return
    }
    if (!descriptor) {
      console.error(`[BaseObjectHooker] descriptor is required. key: ${key.toString()}`);
      return;
    }
    if (typeof descriptor === 'function') {
      descriptor = descriptor(target[key], target);
    }
    Object.defineProperty(target, key, descriptor);
  }

  /**  */
  public static defineProperties<Target = Record<any, any>>(
    target: Target,
    defineInfo: Record<keyof Target, HookerDescriptor<Target>>,
  ) {
    for (const defineKey in defineInfo) {
      BasePropertyHooker.defineProperty<Target>(target, defineKey, defineInfo[defineKey]);
    }
  }
}
