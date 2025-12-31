/**
 * 重写事件的 isTrusted 属性，使所有事件都返回 true
 * 用于绕过网站对自动化事件的检测
 */

let isPatched = false;

export function useTrustedEvent() {
  if (isPatched) {
    console.log('[TrustedEvent] 已经加载过，跳过');
    return;
  }

  try {
    // 保存原始的 isTrusted 描述符
    const originalDescriptor = Object.getOwnPropertyDescriptor(Event.prototype, 'isTrusted');
    
    // 重写 Event.prototype.isTrusted
    Object.defineProperty(Event.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 同样处理 MouseEvent
    Object.defineProperty(MouseEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 KeyboardEvent
    Object.defineProperty(KeyboardEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 InputEvent
    Object.defineProperty(InputEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 FocusEvent
    Object.defineProperty(FocusEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 WheelEvent
    Object.defineProperty(WheelEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 PointerEvent
    Object.defineProperty(PointerEvent.prototype, 'isTrusted', {
      get() {
        return true;
      },
      configurable: false,
    });

    // 处理 TouchEvent (如果存在)
    if (typeof TouchEvent !== 'undefined') {
      Object.defineProperty(TouchEvent.prototype, 'isTrusted', {
        get() {
          return true;
        },
        configurable: false,
      });
    }

    isPatched = true;
    console.log('[TrustedEvent] 事件 isTrusted 属性已重写为 true');

    // 返回恢复函数（如果需要的话）
    return () => {
      if (originalDescriptor) {
        Object.defineProperty(Event.prototype, 'isTrusted', originalDescriptor);
        console.log('[TrustedEvent] 已恢复原始 isTrusted');
      }
    };
  } catch (error) {
    console.error('[TrustedEvent] 重写失败:', error);
  }
}

/**
 * 检测当前事件是否被重写
 */
export function isTrustedEventPatched(): boolean {
  return isPatched;
}

