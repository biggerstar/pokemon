/**
 * 动态加载 Eruda 移动端调试控制台
 * https://github.com/liriliri/eruda
 */

export interface ErudaOptions {
  /** 是否自动初始化，默认 true */
  autoInit?: boolean;
  /** 按钮初始位置，默认 { x: 10, y: 10 } */
  position?: { x: number; y: number };
  /** 默认打开的面板，如 'console', 'elements', 'network' 等 */
  defaultPanel?: string;
  /** 透明度 0-1，默认 1 */
  opacity?: number;
  /** 主题色 */
  theme?: 'light' | 'dark';
  /** CDN 地址，默认 unpkg */
  cdnUrl?: string;
  /** 是否使用 DOM 插件 */
  useDomPlugin?: boolean;
  /** 是否使用 Orientation 插件 */
  useOrientationPlugin?: boolean;
  /** 是否使用 Touch 插件 */
  useTouchPlugin?: boolean;
  /** 是否使用 FPS 插件 */
  useFpsPlugin?: boolean;
  /** 是否使用 Features 插件 */
  useFeaturesPlugin?: boolean;
  /** 是否使用 Timing 插件 */
  useTimingPlugin?: boolean;
  /** 是否使用 Memory 插件 */
  useMemoryPlugin?: boolean;
  /** 是否使用 Code 插件 */
  useCodePlugin?: boolean;
  /** 是否使用 Benchmark 插件 */
  useBenchmarkPlugin?: boolean;
  /** 是否使用 Geolocation 插件 */
  useGeolocationPlugin?: boolean;
}

declare global {
  interface Window {
    eruda: any;
    erudaDom: any;
    erudaOrientation: any;
    erudaTouch: any;
    erudaFps: any;
    erudaFeatures: any;
    erudaTiming: any;
    erudaMemory: any;
    erudaCode: any;
    erudaBenchmark: any;
    erudaGeolocation: any;
  }
}

const defaultOptions: Required<ErudaOptions> = {
  autoInit: true,
  position: { x: 10, y: 10 },
  defaultPanel: 'console',
  opacity: 1,
  theme: 'dark',
  cdnUrl: 'https://unpkg.com',
  useDomPlugin: false,
  useOrientationPlugin: false,
  useTouchPlugin: false,
  useFpsPlugin: false,
  useFeaturesPlugin: false,
  useTimingPlugin: false,
  useMemoryPlugin: false,
  useCodePlugin: false,
  useBenchmarkPlugin: false,
  useGeolocationPlugin: false,
};

let isLoading = false;
let isLoaded = false;
let currentOptions: Required<ErudaOptions>;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

async function loadEruda(options: Required<ErudaOptions>): Promise<void> {
  const { cdnUrl } = options;

  // 加载主库
  await loadScript(`${cdnUrl}/eruda`);

  // 加载插件
  const plugins: Array<{ name: string; global: string; enabled: boolean }> = [
    { name: 'eruda-dom', global: 'erudaDom', enabled: options.useDomPlugin },
    { name: 'eruda-orientation', global: 'erudaOrientation', enabled: options.useOrientationPlugin },
    { name: 'eruda-touches', global: 'erudaTouch', enabled: options.useTouchPlugin },
    { name: 'eruda-fps', global: 'erudaFps', enabled: options.useFpsPlugin },
    { name: 'eruda-features', global: 'erudaFeatures', enabled: options.useFeaturesPlugin },
    { name: 'eruda-timing', global: 'erudaTiming', enabled: options.useTimingPlugin },
    { name: 'eruda-memory', global: 'erudaMemory', enabled: options.useMemoryPlugin },
    { name: 'eruda-code', global: 'erudaCode', enabled: options.useCodePlugin },
    { name: 'eruda-benchmark', global: 'erudaBenchmark', enabled: options.useBenchmarkPlugin },
    { name: 'eruda-geolocation', global: 'erudaGeolocation', enabled: options.useGeolocationPlugin },
  ];

  for (const plugin of plugins) {
    if (plugin.enabled) {
      try {
        await loadScript(`${cdnUrl}/${plugin.name}`);
      } catch (e) {
        console.warn(`[Eruda] Failed to load plugin: ${plugin.name}`);
      }
    }
  }
}

function initEruda(options: Required<ErudaOptions>): void {
  if (!window.eruda) {
    console.error('[Eruda] eruda not loaded');
    return;
  }

  // 初始化 eruda
  window.eruda.init({
    container: document.body,
    tool: ['console', 'elements', 'network', 'resources', 'info', 'snippets', 'sources'],
    autoScale: true,
    useShadowDom: true,
  });

  // 设置位置
  window.eruda.position(options.position);

  // 加载插件
  const pluginMap: Record<string, { global: string; enabled: boolean }> = {
    dom: { global: 'erudaDom', enabled: options.useDomPlugin },
    orientation: { global: 'erudaOrientation', enabled: options.useOrientationPlugin },
    touches: { global: 'erudaTouch', enabled: options.useTouchPlugin },
    fps: { global: 'erudaFps', enabled: options.useFpsPlugin },
    features: { global: 'erudaFeatures', enabled: options.useFeaturesPlugin },
    timing: { global: 'erudaTiming', enabled: options.useTimingPlugin },
    memory: { global: 'erudaMemory', enabled: options.useMemoryPlugin },
    code: { global: 'erudaCode', enabled: options.useCodePlugin },
    benchmark: { global: 'erudaBenchmark', enabled: options.useBenchmarkPlugin },
    geolocation: { global: 'erudaGeolocation', enabled: options.useGeolocationPlugin },
  };

  for (const [name, config] of Object.entries(pluginMap)) {
    if (config.enabled && window[config.global as keyof Window]) {
      window.eruda.add(window[config.global as keyof Window]);
      console.log(`[Eruda] Plugin loaded: ${name}`);
    }
  }

  // 设置透明度
  if (options.opacity < 1) {
    const erudaEl = document.querySelector('.eruda-container') as HTMLElement;
    if (erudaEl) {
      erudaEl.style.opacity = String(options.opacity);
    }
  }

  // 打开默认面板
  if (options.defaultPanel) {
    window.eruda.show(options.defaultPanel);
  }

  console.log('[Eruda] 初始化成功');
}

/**
 * 加载并初始化 Eruda 调试控制台
 * 
 * @example
 * ```ts
 * // 基本使用
 * useEruda();
 * 
 * // 自定义配置
 * useEruda({
 *   position: { x: 100, y: 100 },
 *   defaultPanel: 'network',
 *   useFpsPlugin: true,
 *   useMemoryPlugin: true,
 * });
 * ```
 */
export async function useEruda(options: ErudaOptions = {}): Promise<void> {
  if (isLoaded) {
    console.log('[Eruda] Already loaded');
    return;
  }

  if (isLoading) {
    console.log('[Eruda] Loading in progress...');
    return;
  }

  currentOptions = { ...defaultOptions, ...options };
  isLoading = true;

  const init = async () => {
    try {
      console.log('[Eruda] Loading...');
      await loadEruda(currentOptions);
      isLoaded = true;

      if (currentOptions.autoInit) {
        initEruda(currentOptions);
      }
    } catch (error) {
      console.error('[Eruda] Failed to load:', error);
    } finally {
      isLoading = false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    await init();
  }
}

/**
 * 手动初始化 Eruda（当 autoInit 为 false 时使用）
 */
export function initErudaManually(): void {
  if (!isLoaded) {
    console.error('[Eruda] Not loaded yet. Call useEruda() first.');
    return;
  }
  initEruda(currentOptions);
}

/**
 * 显示 Eruda 面板
 * @param panel 面板名称，如 'console', 'elements', 'network' 等
 */
export function showEruda(panel?: string): void {
  if (window.eruda) {
    window.eruda.show(panel);
  }
}

/**
 * 隐藏 Eruda 面板
 */
export function hideEruda(): void {
  if (window.eruda) {
    window.eruda.hide();
  }
}

/**
 * 销毁 Eruda
 */
export function destroyEruda(): void {
  if (window.eruda) {
    window.eruda.destroy();
    isLoaded = false;
    console.log('[Eruda] Destroyed');
  }
}

/**
 * 获取 Eruda 实例
 */
export function getEruda(): any {
  return window.eruda;
}

/**
 * 设置 Eruda 位置
 */
export function setErudaPosition(x: number, y: number): void {
  if (window.eruda) {
    window.eruda.position({ x, y });
  }
}

/**
 * 向 Eruda 控制台输出日志
 */
export function erudaLog(...args: any[]): void {
  console.log(...args);
}

/**
 * 在 Eruda 中执行代码片段
 */
export function erudaRun(code: string): any {
  if (window.eruda) {
    try {
      return eval(code);
    } catch (e) {
      console.error('[Eruda] Eval error:', e);
    }
  }
}

