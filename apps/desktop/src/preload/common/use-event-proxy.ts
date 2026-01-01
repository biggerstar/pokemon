/**
 * 通过 Proxy 拦截所有事件，将 isTrusted 属性永远设置为 true
 * 用于绕过网站对自动化事件的检测
 * 
 * 这个实现只拦截 addEventListener，在监听器回调中用 Proxy 包装事件对象
 */

let isPatched = false;

// 使用 WeakMap 保存原始监听器和包装后的监听器的映射关系
const listenerMap = new WeakMap<EventListenerOrEventListenerObject, EventListener>();

/**
 * 创建事件对象的 Proxy，拦截 isTrusted 属性
 * 使用多个 trap 确保所有访问方式都能被拦截
 */
function createEventProxy<T extends Event>(event: T): T {
  return new Proxy(event, {
    get(target: T, prop: string | symbol): unknown {
      if (prop === 'isTrusted') {
        return true;
      }
      const value = Reflect.get(target, prop);
      // 如果返回的是函数，需要绑定正确的 this
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
    has(target: T, prop: string | symbol): boolean {
      if (prop === 'isTrusted') {
        return true;
      }
      return Reflect.has(target, prop);
    },
    ownKeys(target: T): Array<string | symbol> {
      const keys = Reflect.ownKeys(target);
      if (!keys.includes('isTrusted')) {
        return [...keys, 'isTrusted'];
      }
      return keys;
    },
    getOwnPropertyDescriptor(target: T, prop: string | symbol): PropertyDescriptor | undefined {
      if (prop === 'isTrusted') {
        return {
          value: true,
          writable: false,
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

/**
 * 包装事件监听器，在调用时拦截事件对象
 */
function wrapEventListener(
  originalListener: EventListenerOrEventListenerObject | null,
): EventListener {
  if (!originalListener) {
    return () => {};
  }

  const wrappedListener: EventListener = function (event: Event): void {
    // 用 Proxy 包装事件对象，修改 isTrusted 属性
    const proxiedEvent = createEventProxy(event);

    // 调用原始监听器，传入 Proxy 包装后的事件对象
    if (typeof originalListener === 'function') {
      originalListener.call(this, proxiedEvent);
    } else if (originalListener && typeof originalListener === 'object' && 'handleEvent' in originalListener) {
      originalListener.handleEvent(proxiedEvent);
    }
  };

  // 保存映射关系，用于 removeEventListener
  listenerMap.set(originalListener, wrappedListener);

  return wrappedListener;
}

/**
 * 拦截 EventTarget 的 addEventListener 方法
 */
function patchAddEventListener(): void {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (listener) {
      // 包装监听器，在回调中用 Proxy 包装事件对象
      const wrappedListener = wrapEventListener(listener);
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };
}

/**
 * 拦截 EventTarget 的 removeEventListener 方法
 */
function patchRemoveEventListener(): void {
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  
  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener) {
      // 查找包装后的监听器
      const wrappedListener = listenerMap.get(listener);
      if (wrappedListener) {
        return originalRemoveEventListener.call(this, type, wrappedListener, options);
      }
    }
    return originalRemoveEventListener.call(this, type, listener, options);
  };
}

/**
 * 启用事件代理拦截
 */
export function useEventProxy(): void {
  if (isPatched) {
    console.log('[EventProxy] 已经加载过，跳过');
    return;
  }

  try {
    // 只拦截 addEventListener 和 removeEventListener
    patchAddEventListener();
    patchRemoveEventListener();

    isPatched = true;
    console.log('[EventProxy] 事件代理拦截已启用，所有事件的 isTrusted 属性将返回 true');
  } catch (error) {
    console.error('[EventProxy] 启用失败:', error);
  }
}

/**
 * 检测当前事件代理是否已启用
 */
export function isEventProxyPatched(): boolean {
  return isPatched;
}

