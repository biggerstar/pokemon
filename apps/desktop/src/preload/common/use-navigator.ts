interface NavigatorOptions {
  /**
   * 是否启用后退按钮
   * @default true
   */
  backButton?: boolean;

  /**
   * 是否启用前进按钮
   * @default true
   */
  forwardButton?: boolean;

  /**
   * 是否启用刷新按钮
   * @default false
   */
  refreshButton?: boolean;

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
   * 按钮大小级别 (1-10)
   * @default 8
   */
  buttonSize?: number;

  /**
   * 距离顶部的距离 (px或%)
   * @default '0'
   */
  top?: string;

  /**
   * 距离左侧的距离 (px或%)
   * @default '0'
   */
  left?: string;
}

function createNavigatorContainer(options: NavigatorOptions = {}) {
  // 合并默认选项
  const {
    backButton = true,
    forwardButton = true,
    refreshButton = true,
    defaultOpacity = 0.3,
    hoverOpacity = 1,
    buttonSize = 8,
    top = '0',
    left = '0'
  } = options;

  // 计算按钮实际大小 (15px - 42px)
  const size = Math.min(10, Math.max(1, buttonSize));
  const buttonWidthHeight = `${15 + (size - 1) * 3}px`;
  const buttonFontSize = `${7 + (size - 1) * 0.8}px`;
  // 刷新按钮使用更大的字体
  const refreshButtonFontSize = `${12 + (size - 1) * 0.8}px`;

  // 创建按钮容器
  const navContainer = document.createElement('div');
  navContainer.style.position = 'fixed';
  navContainer.style.top = top;
  navContainer.style.left = left;
  navContainer.style.zIndex = '2147483647'; // 最大z-index值
  navContainer.style.display = 'flex';
  navContainer.style.alignItems = 'center'; // 垂直居中
  navContainer.style.gap = '4px'; // 减小按钮间距
  navContainer.style.padding = '0'; // 移除内边距
  navContainer.style.margin = '0'; // 移除外边距
  navContainer.style.borderRadius = '0 0 8px 0'; // 减小圆角
  navContainer.style.transition = 'opacity 0.2s ease';
  navContainer.style.opacity = String(defaultOpacity);

  // 鼠标悬停效果 - 只改变透明度，不添加背景
  navContainer.addEventListener('mouseenter', () => {
    navContainer.style.opacity = String(hoverOpacity);
  });

  navContainer.addEventListener('mouseleave', () => {
    navContainer.style.opacity = String(defaultOpacity);
  });

  // 创建按钮数组以便控制顺序
  const buttons = [];

  // 创建后退按钮
  if (backButton) {
    const backButton = createNavButton('←', '后退', buttonWidthHeight, buttonFontSize);
    backButton.addEventListener('click', () => {
      window.history.back();
    });
    buttons.push(backButton);
  }

  // 创建刷新按钮（如果启用则放在中间）
  if (refreshButton) {
    const refreshButton = createNavButton('↻', '刷新', buttonWidthHeight, refreshButtonFontSize);
    refreshButton.addEventListener('click', () => {
      window.location.reload();
    });
    // 如果有后退按钮，则插入到中间位置
    if (backButton && forwardButton) {
      buttons.splice(1, 0, refreshButton);
    } else {
      buttons.push(refreshButton);
    }
  }

  // 创建前进按钮
  if (forwardButton) {
    const forwardButton = createNavButton('→', '前进', buttonWidthHeight, buttonFontSize);
    forwardButton.addEventListener('click', () => {
      window.history.forward();
    });
    buttons.push(forwardButton);
  }

  // 按顺序添加按钮
  buttons.forEach(button => navContainer.appendChild(button));

  // 添加到文档
  document.body.appendChild(navContainer);

  // 创建导航按钮的辅助函数
  function createNavButton(
    text: string,
    title: string,
    size: string,
    fontSize: string
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title;
    button.style.width = size;
    button.style.height = size;
    button.style.borderRadius = '50%';
    button.style.border = 'none';
    button.style.background = 'rgba(255, 255, 255, 0.8)';
    button.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
    button.style.cursor = 'pointer';
    button.style.fontSize = fontSize;
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.transition = 'all 0.2s ease';
    button.style.margin = '0'; // 移除按钮外边距

    // 悬停效果
    button.addEventListener('mouseenter', () => {
      button.style.boxShadow = '0 1px 3px 0 rgba(60, 64, 67, 0.302), 0 4px 8px 3px rgba(60, 64, 67, 0.149)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
    });

    // 点击效果
    button.addEventListener('mousedown', () => {
      button.style.transform = 'scale(0.95)';
    });

    button.addEventListener('mouseup', () => {
      button.style.transform = 'scale(1)';
    });

    return button;
  }
}

export function useNavigator(options: NavigatorOptions = {}) {
  if (document.readyState === 'complete') {
    createNavigatorContainer(options);
  } else {
    window.addEventListener('DOMContentLoaded', () => createNavigatorContainer(options));
  }
}
