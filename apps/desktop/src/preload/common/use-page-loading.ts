interface LoadingOptions {
  /**
   * 指示器大小 (px)
   * @default 16
   */
  size?: number;

  /**
   * 指示器颜色
   * @default '#3498db'
   */
  color?: string;

  /**
   * 背景颜色
   * @default 'rgba(255, 255, 255, 0.8)'
   */
  backgroundColor?: string;

  /**
   * 距离顶部的距离 (px或%)
   * @default '20px'
   */
  top?: string;

  /**
   * 距离右侧的距离 (px或%)
   * @default '20px'
   */
  right?: string;

  /**
   * 旋转速度 (ms)
   * @default 800
   */
  speed?: number;

  /**
   * 默认透明度 (0-1)
   * @default 0.7
   */
  defaultOpacity?: number;

  /**
   * 悬停透明度 (0-1)
   * @default 1
   */
  hoverOpacity?: number;

  /**
   * 是否启用页面跳转守卫
   * @default true
   */
  enableNavigationGuard?: boolean;

  /**
   * 跳转守卫触发延迟时间 (ms)
   * @default 50
   */
  navigationGuardDelay?: number;

  /**
   * 最长显示时间 (ms)，防止loading一直显示
   * @default 10000
   */
  maxLoadingTime?: number;
}

function createLoadingContainer(options: LoadingOptions = {}) {
  // 合并默认选项
  const {
    size = 16,
    color = '#3498db',
    backgroundColor = 'rgba(255, 255, 255, 0.8)',
    top = '6px',
    right = '6px',
    speed = 800,
    defaultOpacity = 0.7,
    hoverOpacity = 1
  } = options;

  // 创建加载指示器容器
  const loadingContainer = document.createElement('div');
  loadingContainer.style.position = 'fixed';
  loadingContainer.style.top = top;
  loadingContainer.style.right = right;
  loadingContainer.style.zIndex = '2147483647';
  loadingContainer.style.width = `${size}px`;
  loadingContainer.style.height = `${size}px`;
  loadingContainer.style.borderRadius = '50%';
  loadingContainer.style.transition = 'opacity 0.2s ease';
  loadingContainer.style.opacity = String(defaultOpacity);
  loadingContainer.style.cursor = 'pointer';
  loadingContainer.title = '加载中...';

  // 创建旋转动画元素
  const spinner = document.createElement('div');
  spinner.style.width = '100%';
  spinner.style.height = '100%';
  spinner.style.border = `2px solid rgba(0, 0, 0, 0.1)`;
  spinner.style.borderRadius = '50%';
  spinner.style.borderTopColor = color;
  spinner.style.backgroundColor = backgroundColor;
  spinner.style.animation = `spin ${speed}ms linear infinite`;
  spinner.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';

  // 鼠标悬停效果
  loadingContainer.addEventListener('mouseenter', () => {
    loadingContainer.style.opacity = String(hoverOpacity);
    spinner.style.boxShadow = '0 1px 3px 0 rgba(60, 64, 67, 0.302), 0 4px 8px 3px rgba(60, 64, 67, 0.149)';
  });

  loadingContainer.addEventListener('mouseleave', () => {
    loadingContainer.style.opacity = String(defaultOpacity);
    spinner.style.boxShadow = '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)';
  });

  // 点击刷新
  loadingContainer.addEventListener('click', () => {
    window.location.reload();
  });

  // 添加旋转动画
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  // 组装元素
  loadingContainer.appendChild(spinner);
  document.body.appendChild(loadingContainer);

  // 返回控制方法
  return {
    /**
     * 隐藏加载指示器
     */
    hide: () => {
      loadingContainer.style.opacity = '0';
      setTimeout(() => {
        if (document.body.contains(loadingContainer)) {
          loadingContainer.remove();
        }
        if (document.head.contains(style)) {
          style.remove();
        }
      }, 300);
    },

    /**
     * 显示加载指示器
     */
    show: () => {
      if (!document.body.contains(loadingContainer)) {
        document.body.appendChild(loadingContainer);
      }
      if (!document.head.contains(style)) {
        document.head.appendChild(style);
      }
      loadingContainer.style.opacity = String(defaultOpacity);
    },

    /**
     * 完全移除指示器
     */
    destroy: () => {
      if (document.body.contains(loadingContainer)) {
        loadingContainer.remove();
      }
      if (document.head.contains(style)) {
        style.remove();
      }
    }
  };
}

export function usePageLoading(options: LoadingOptions = {}) {
  const {
    enableNavigationGuard = true,
    navigationGuardDelay = 50,
    maxLoadingTime = 10000,
    ...loadingOptions
  } = options;

  let loadingInstance: ReturnType<typeof createLoadingContainer> | null = null;
  let navigationTimer: number | null = null;
  let maxTimer: number | null = null;
  let isNavigating = false;
  let originalPushState: typeof history.pushState;
  let originalReplaceState: typeof history.replaceState;
  let currentUrl = window.location.href;

  const init = () => {
    if (!loadingInstance) {
      loadingInstance = createLoadingContainer(loadingOptions);
    }
    return loadingInstance;
  };

  // 清理所有定时器
  const clearTimers = () => {
    if (navigationTimer) {
      clearTimeout(navigationTimer);
      navigationTimer = null;
    }
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  };

  // 等待URL真正发生变化
  const waitForUrlChange = (expectedUrl?: string) => {
    return new Promise<void>((resolve) => {
      let checkCount = 0;
      const maxChecks = 50; // 最多检查5秒
      
      const checkUrl = () => {
        checkCount++;
        const newUrl = window.location.href;
        
        if (newUrl !== currentUrl) {
          currentUrl = newUrl;
          
          // URL变化后，等待页面内容加载
          setTimeout(() => {
            resolve();
          }, 1000); // 给页面1秒加载时间
          return;
        }
        
        if (checkCount >= maxChecks) {
          resolve();
          return;
        }
        
        setTimeout(checkUrl, 100);
      };
      
      // 开始检查
      setTimeout(checkUrl, 100);
    });
  };

  // 显示loading
  const showLoading = () => {
    if (!isNavigating) {
      isNavigating = true;
      currentUrl = window.location.href;
      
      navigationTimer = window.setTimeout(() => {
        init().show();
        
        // 设置最大显示时间，防止loading一直显示
        maxTimer = window.setTimeout(() => {
          hideLoading();
        }, maxLoadingTime);
      }, navigationGuardDelay);
    }
  };

  // 隐藏loading
  const hideLoading = () => {
    clearTimers();
    if (isNavigating) {
      loadingInstance?.hide();
      isNavigating = false;
    }
  };

  // 拦截 history.pushState
  const interceptPushState = () => {
    originalPushState = history.pushState;
    history.pushState = function(state: any, title: string, url?: string | URL | null) {
      showLoading();
      
      // 调用原始方法
      const result = originalPushState.call(this, state, title, url);
      
      // 等待URL变化和页面加载
      waitForUrlChange(url?.toString()).then(() => {
        hideLoading();
      });
      
      return result;
    };
  };

  // 拦截 history.replaceState
  const interceptReplaceState = () => {
    originalReplaceState = history.replaceState;
    history.replaceState = function(state: any, title: string, url?: string | URL | null) {
      showLoading();
      
      // 调用原始方法
      const result = originalReplaceState.call(this, state, title, url);
      
      // 等待URL变化和页面加载
      waitForUrlChange(url?.toString()).then(() => {
        hideLoading();
      });
      
      return result;
    };
  };

  // 监听 popstate 事件（浏览器前进后退）
  const handlePopState = (event: PopStateEvent) => {
    showLoading();
    
    // 等待URL变化和页面加载
    waitForUrlChange().then(() => {
      hideLoading();
    });
  };

  // 监听页面卸载
  const handleBeforeUnload = () => {
    showLoading();
  };

  // 拦截链接点击
  const handleLinkClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const link = target.closest('a[href]') as HTMLAnchorElement;
    
    if (link && link.href) {
      const href = link.getAttribute('href');
      
      // 检查是否是页面跳转链接
      if (href && 
          !href.startsWith('#') && 
          !href.startsWith('javascript:') && 
          !href.startsWith('mailto:') && 
          !href.startsWith('tel:') &&
          !link.target // 不是新窗口打开
         ) {
        // 如果是外部链接或页面跳转
        if (href.startsWith('http') || href.startsWith('/') || href.includes('.html')) {
          showLoading();
        }
      }
    }
  };

  // 监听表单提交
  const handleFormSubmit = () => {
    showLoading();
  };

  // 自动检测页面加载状态
  if (document.readyState === 'complete') {
    // 页面已加载，不显示指示器
  } else {
    let loading: ReturnType<typeof createLoadingContainer>;
    window.addEventListener('DOMContentLoaded', () => {
      loading = init();
      loading.show();
    });
    window.addEventListener('load', () => {
      loading?.hide();
    });
  }

  // 设置页面跳转守卫
  if (enableNavigationGuard) {
    // 拦截 history API
    interceptPushState();
    interceptReplaceState();
    
    // 监听各种事件
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleLinkClick, true);
    document.addEventListener('submit', handleFormSubmit, true);
  }

  return {
    /**
     * 显示加载指示器
     */
    show: () => init().show(),

    /**
     * 隐藏加载指示器
     */
    hide: () => hideLoading(),

    /**
     * 完全移除指示器并清理
     */
    destroy: () => {
      clearTimers();
      
      // 恢复原始的 history 方法
      if (originalPushState) {
        history.pushState = originalPushState;
      }
      if (originalReplaceState) {
        history.replaceState = originalReplaceState;
      }
      
      // 移除事件监听器
      if (enableNavigationGuard) {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('click', handleLinkClick, true);
        document.removeEventListener('submit', handleFormSubmit, true);
      }
      
      loadingInstance?.destroy();
      loadingInstance = null;
      isNavigating = false;
    },

    /**
     * 手动触发导航loading
     */
    triggerNavigationLoading: () => showLoading(),

    /**
     * 重置状态
     */
    reset: () => {
      hideLoading();
    },

    /**
     * 获取当前导航状态
     */
    isNavigating: () => isNavigating
  };
}
