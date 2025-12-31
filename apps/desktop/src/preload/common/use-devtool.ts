import { ipcRenderer } from 'electron';

interface DevtoolOptions {
  /**
   * 是否启用快捷键 (Ctrl+T)
   * @default true
   */
  enableShortcut?: boolean;

  /**
   * 是否显示按钮
   * @default false
   */
  enableButton?: boolean;

  /**
   * 按钮位置
   * @default { top: '10px', right: '10px' }
   */
  buttonPosition?: { top?: string; right?: string; bottom?: string; left?: string };

  /**
   * 按钮默认透明度 (0-1)
   * @default 0.3
   */
  defaultOpacity?: number;

  /**
   * 按钮悬停透明度 (0-1)
   * @default 1
   */
  hoverOpacity?: number;

  /**
   * 按钮大小 (px)
   * @default 32
   */
  buttonSize?: number;
}

let devtoolButton: HTMLButtonElement | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let buttonStartX = 0;
let buttonStartY = 0;

function getButtonPosition(): { top: string; left: string } | null {
  const saved = localStorage.getItem('devtool-button-position');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveButtonPosition(top: string, left: string) {
  localStorage.setItem('devtool-button-position', JSON.stringify({ top, left }));
}

function createDevtoolButton(options: DevtoolOptions = {}) {
  if (devtoolButton && document.body.contains(devtoolButton)) {
    return devtoolButton;
  }

  const {
    buttonPosition = { top: '10px', right: '10px' },
    defaultOpacity = 0.3,
    hoverOpacity = 1,
    buttonSize = 32
  } = options;

  if (devtoolButton) {
    document.body.removeChild(devtoolButton);
  }

  const savedPosition = getButtonPosition();
  const initialTop = savedPosition?.top || buttonPosition.top || '10px';
  const initialLeft = savedPosition?.left || (buttonPosition.left || 'auto');
  const initialRight = savedPosition ? 'auto' : (buttonPosition.right || 'auto');

  const button = document.createElement('button');
  button.textContent = '🔧';
  button.title = '打开开发者工具 (Ctrl+T) - 可拖动';
  button.style.position = 'fixed';
  button.style.top = initialTop;
  button.style.left = initialLeft;
  button.style.right = initialRight;
  button.style.bottom = 'auto';
  button.style.width = `${buttonSize}px`;
  button.style.height = `${buttonSize}px`;
  button.style.borderRadius = '50%';
  button.style.border = 'none';
  button.style.background = 'rgba(255, 255, 255, 0.8)';
  button.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
  button.style.cursor = 'move';
  button.style.fontSize = `${Math.floor(buttonSize * 0.5)}px`;
  button.style.display = 'flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.transition = 'opacity 0.2s ease, box-shadow 0.2s ease';
  button.style.zIndex = '2147483647';
  button.style.opacity = String(defaultOpacity);
  button.style.userSelect = 'none';

  let clickStartTime = 0;
  let clickStartX = 0;
  let clickStartY = 0;

  button.addEventListener('mousedown', (e) => {
    clickStartTime = Date.now();
    clickStartX = e.clientX;
    clickStartY = e.clientY;
    
    if (e.button === 0) {
      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      
      const rect = button.getBoundingClientRect();
      buttonStartX = rect.left;
      buttonStartY = rect.top;
      
      button.style.cursor = 'grabbing';
      button.style.transition = 'none';
      button.style.opacity = String(hoverOpacity);
      
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - dragStartX;
        const deltaY = moveEvent.clientY - dragStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > 5) {
          isDragging = true;
        }
        
        if (isDragging) {
          const newX = buttonStartX + deltaX;
          const newY = buttonStartY + deltaY;
          
          button.style.left = `${newX}px`;
          button.style.top = `${newY}px`;
          button.style.right = 'auto';
          button.style.bottom = 'auto';
        }
      };
      
      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        button.style.cursor = 'move';
        button.style.transition = 'opacity 0.2s ease, box-shadow 0.2s ease';
        
        if (isDragging) {
          const rect = button.getBoundingClientRect();
          saveButtonPosition(`${rect.top}px`, `${rect.left}px`);
          button.style.opacity = String(defaultOpacity);
        } else {
          const clickDuration = Date.now() - clickStartTime;
          const clickDistance = Math.sqrt(
            Math.pow(upEvent.clientX - clickStartX, 2) + 
            Math.pow(upEvent.clientY - clickStartY, 2)
          );
          
          if (clickDuration < 300 && clickDistance < 5) {
            button.style.opacity = String(defaultOpacity);
            button.click();
          } else {
            button.style.opacity = String(defaultOpacity);
          }
        }
        
        isDragging = false;
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  });

  button.addEventListener('mouseenter', () => {
    if (!isDragging) {
      button.style.opacity = String(hoverOpacity);
      button.style.boxShadow = '0 1px 3px 0 rgba(60, 64, 67, 0.302), 0 4px 8px 3px rgba(60, 64, 67, 0.149)';
    }
  });

  button.addEventListener('mouseleave', () => {
    if (!isDragging) {
      button.style.opacity = String(defaultOpacity);
      button.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
    }
  });

  button.addEventListener('click', async (e) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipcRenderer.invoke('system:open-devtools');
    } catch (error) {
      console.error('[Devtool] 按钮点击 - 打开开发者工具失败:', error);
    }
  });

  if (document.body) {
    document.body.appendChild(button);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(button);
    });
  }

  devtoolButton = button;
  return button;
}

let shortcutHandler: ((event: KeyboardEvent) => Promise<void>) | null = null;

function setupShortcut(options: DevtoolOptions = {}) {
  const { enableShortcut = true } = options;

  if (!enableShortcut) {
    if (shortcutHandler) {
      window.removeEventListener('keydown', shortcutHandler as any, true);
      shortcutHandler = null;
    }
    return;
  }

  if (shortcutHandler) {
    window.removeEventListener('keydown', shortcutHandler as any, true);
  }

  shortcutHandler = async (event: KeyboardEvent) => {
    if ((event.ctrlKey) && (event.key === 't' || event.key === 'T')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      try {
        await ipcRenderer.invoke('system:open-devtools');
      } catch (error) {
        console.error('[Devtool] 打开开发者工具失败:', error);
      }
    }
  };

  window.addEventListener('keydown', shortcutHandler, true);
}

let isInitialized = false;
let currentOptions: DevtoolOptions | null = null;

function initDevtool(options: DevtoolOptions = {}) {
  currentOptions = options;
  const {
    enableButton = false
  } = options;

  setupShortcut(options);

  if (enableButton) {
    if (document.body) {
      createDevtoolButton(options);
    } else {
      const handler = () => {
        createDevtoolButton(options);
      };
      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', handler, { once: true });
      } else {
        handler();
      }
    }
  } else {
    if (devtoolButton && document.body.contains(devtoolButton)) {
      document.body.removeChild(devtoolButton);
      devtoolButton = null;
    }
  }
}

export function useDevtool(options: DevtoolOptions = {}) {
  if (!isInitialized) {
    initDevtool(options);
    isInitialized = true;

    window.addEventListener('load', () => {
      if (currentOptions) {
        initDevtool(currentOptions);
      }
    });

    window.addEventListener('DOMContentLoaded', () => {
      if (currentOptions) {
        initDevtool(currentOptions);
      }
    });
  } else {
    initDevtool(options);
  }
}

