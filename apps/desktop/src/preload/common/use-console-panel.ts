/**
 * 在网页左上角显示 console.log 和 console.info 的输出
 * 用于 preload 脚本调试
 */

/** 面板布局位置 */
export type ConsolePanelLayout = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface ConsolePanelOptions {
  /** 面板宽度，默认 450px */
  width?: number;
  /** 面板高度，默认 500px */
  height?: number;
  /** 最大日志条数，默认 100 */
  maxLogs?: number;
  /** 初始位置 X，如果指定了 x/y 则忽略 layout */
  x?: number;
  /** 初始位置 Y，如果指定了 x/y 则忽略 layout */
  y?: number;
  /** 布局位置，支持四个角和中心，默认 'top-left'。如果指定了 x/y 则忽略此选项 */
  layout?: ConsolePanelLayout;
  /** 是否默认折叠，默认 false */
  collapsed?: boolean;
  /** 是否显示时间戳，默认 true */
  showTimestamp?: boolean;
  /** 是否自动滚动到底部，默认 true */
  autoScroll?: boolean;
  /** 字体大小，默认 12 */
  fontSize?: number;
  /** 透明度 0-1，默认 0.92 */
  opacity?: number;
  /** 是否可拖拽，默认 true */
  draggable?: boolean;
  /** 是否可调整大小，默认 true */
  resizable?: boolean;
  /** 日志过滤关键词（只显示包含关键词的日志） */
  filter?: string;
}

let panel: HTMLDivElement | null = null;
let logContainer: HTMLDivElement | null = null;
let isInitialized = false;
let currentOptions: Required<ConsolePanelOptions>;
let filterKeyword = '';
let isPaused = false;
let allLogs: Array<{ type: string; args: any[]; time: Date }> = [];
let isMinimized = false;
let savedPanelSize = { width: 0, height: 0 };

// 保存原始的 console 方法
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

const defaultOptions: Required<ConsolePanelOptions> = {
  width: 450,
  height: 500,
  maxLogs: 100,
  x: 0,
  y: 0,
  layout: 'top-left',
  collapsed: false,
  showTimestamp: true,
  autoScroll: true,
  fontSize: 12,
  opacity: 0.92,
  draggable: true,
  resizable: true,
  filter: '',
};

/** 边距常量 */
const PANEL_MARGIN = 10;

/**
 * 根据 layout 计算面板位置
 */
function calculatePosition(
  layout: ConsolePanelLayout,
  panelWidth: number,
  panelHeight: number
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  switch (layout) {
    case 'top-left':
      return { x: PANEL_MARGIN, y: PANEL_MARGIN };
    case 'top-right':
      return { x: viewportWidth - panelWidth - PANEL_MARGIN, y: PANEL_MARGIN };
    case 'bottom-left':
      return { x: PANEL_MARGIN, y: viewportHeight - panelHeight - PANEL_MARGIN };
    case 'bottom-right':
      return { x: viewportWidth - panelWidth - PANEL_MARGIN, y: viewportHeight - panelHeight - PANEL_MARGIN };
    case 'center':
      return {
        x: (viewportWidth - panelWidth) / 2,
        y: (viewportHeight - panelHeight) / 2,
      };
    default:
      return { x: PANEL_MARGIN, y: PANEL_MARGIN };
  }
}

function createStyles(): string {
  return `
    #console-panel {
      position: fixed;
      background: rgba(15, 15, 20, ${currentOptions.opacity});
      color: #e0e0e0;
      font-family: 'SF Mono', 'Monaco', 'Menlo', 'Consolas', 'Liberation Mono', monospace;
      font-size: ${currentOptions.fontSize}px;
      border-radius: 8px;
      z-index: 2147483647;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      flex-direction: column;
      ${currentOptions.resizable ? 'resize: both;' : ''}
    }
    #console-panel * {
      box-sizing: border-box;
    }
    #console-panel-header {
      padding: 8px 12px;
      background: linear-gradient(180deg, rgba(50, 50, 60, 0.9) 0%, rgba(35, 35, 45, 0.9) 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: ${currentOptions.draggable ? 'move' : 'default'};
      user-select: none;
      flex-shrink: 0;
    }
    #console-panel-title {
      color: #4ade80;
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #console-panel-title .count {
      background: rgba(74, 222, 128, 0.2);
      color: #4ade80;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
    }
    #console-panel-toolbar {
      padding: 6px 12px;
      background: rgba(30, 30, 40, 0.8);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
    }
    #console-panel-filter {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      padding: 4px 8px;
      color: #fff;
      font-size: 11px;
      outline: none;
    }
    #console-panel-filter:focus {
      border-color: rgba(74, 222, 128, 0.5);
    }
    #console-panel-filter::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
    #console-panel-buttons {
      display: flex;
      gap: 4px;
    }
    #console-panel-buttons button {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #ccc;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: all 0.15s ease;
    }
    #console-panel-buttons button:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    #console-panel-buttons button.active {
      background: rgba(74, 222, 128, 0.2);
      border-color: rgba(74, 222, 128, 0.4);
      color: #4ade80;
    }
    #console-panel-buttons button.danger:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
      color: #ef4444;
    }
    #console-panel-logs {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0;
    }
    #console-panel-logs::-webkit-scrollbar {
      width: 8px;
    }
    #console-panel-logs::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    #console-panel-logs::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }
    #console-panel-logs::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .console-log-entry {
      padding: 4px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
    }
    .console-log-entry:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .console-log-entry.log { border-left: 3px solid #4ade80; }
    .console-log-entry.info { border-left: 3px solid #38bdf8; }
    .console-log-entry.warn { border-left: 3px solid #fbbf24; background: rgba(251, 191, 36, 0.05); }
    .console-log-entry.error { border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.05); }
    .console-log-time {
      color: #666;
      font-size: 10px;
      flex-shrink: 0;
      min-width: 70px;
    }
    .console-log-icon {
      flex-shrink: 0;
      width: 14px;
      text-align: center;
    }
    .console-log-message {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .console-log-entry.log .console-log-message { color: #4ade80; }
    .console-log-entry.info .console-log-message { color: #38bdf8; }
    .console-log-entry.warn .console-log-message { color: #fbbf24; }
    .console-log-entry.error .console-log-message { color: #ef4444; }
    #console-panel-status {
      padding: 4px 12px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 10px;
      color: #666;
      display: flex;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .console-log-expanded {
      white-space: pre-wrap !important;
      word-break: break-all;
    }
    #console-panel.minimized {
      width: 80px !important;
      height: 80px !important;
      min-width: 80px !important;
      min-height: 80px !important;
      border-radius: 12px;
      resize: none !important;
    }
    #console-panel.minimized #console-panel-header {
      height: 100%;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: move;
      border-radius: 12px;
    }
    #console-panel.minimized #console-panel-title {
      display: none;
    }
    #console-panel.minimized #console-panel-buttons {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    #console-panel.minimized #console-panel-buttons button {
      display: none;
    }
    #console-panel.minimized #console-panel-buttons #btn-toggle {
      display: flex;
      width: 50px;
      height: 50px;
      font-size: 24px;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      background: rgba(74, 222, 128, 0.2);
      border-color: rgba(74, 222, 128, 0.4);
    }
    #console-panel.minimized #console-panel-toolbar,
    #console-panel.minimized #console-panel-logs,
    #console-panel.minimized #console-panel-status {
      display: none !important;
    }
    #console-panel.minimized .minimized-count {
      position: absolute;
      top: 4px;
      right: 4px;
      background: #ef4444;
      color: white;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      min-width: 18px;
      text-align: center;
    }
  `;
}

function createPanel(userOptions: ConsolePanelOptions): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'console-panel';

  // 如果用户指定了 x 或 y，使用用户指定的坐标；否则根据 layout 计算位置
  const hasCustomPosition = userOptions.x !== undefined || userOptions.y !== undefined;
  let posX: number;
  let posY: number;

  if (hasCustomPosition) {
    posX = userOptions.x ?? PANEL_MARGIN;
    posY = userOptions.y ?? PANEL_MARGIN;
  } else {
    const pos = calculatePosition(currentOptions.layout, currentOptions.width, currentOptions.height);
    posX = pos.x;
    posY = pos.y;
  }

  panel.style.cssText = `
    left: ${posX}px;
    top: ${posY}px;
    width: ${currentOptions.width}px;
    height: ${currentOptions.height}px;
    min-width: 300px;
    min-height: 200px;
  `;

  // 添加样式
  const style = document.createElement('style');
  style.textContent = createStyles();
  panel.appendChild(style);

  // 标题栏
  const header = document.createElement('div');
  header.id = 'console-panel-header';
  header.innerHTML = `
    <div id="console-panel-title">
      <span>🖥️ Console</span>
      <span class="count" id="console-panel-count">0</span>
    </div>
    <div id="console-panel-buttons">
      <button id="btn-scroll" title="自动滚动">📜</button>
      <button id="btn-pause" title="暂停">⏸️</button>
      <button id="btn-expand" title="展开/收起内容">📐</button>
      <button id="btn-clear" class="danger" title="清除">🗑️</button>
      <button id="btn-toggle" title="折叠面板">➖</button>
    </div>
  `;

  // 工具栏
  const toolbar = document.createElement('div');
  toolbar.id = 'console-panel-toolbar';
  toolbar.innerHTML = `
    <input type="text" id="console-panel-filter" placeholder="🔍 过滤日志..." />
    <button id="btn-log" class="active" title="显示 log">LOG</button>
    <button id="btn-info" class="active" title="显示 info">INFO</button>
    <button id="btn-warn" title="显示 warn">WARN</button>
    <button id="btn-error" title="显示 error">ERR</button>
  `;

  // 日志容器
  const container = document.createElement('div');
  container.id = 'console-panel-logs';

  // 状态栏
  const status = document.createElement('div');
  status.id = 'console-panel-status';
  status.innerHTML = `
    <span id="console-panel-info">Ready</span>
    <span id="console-panel-memory"></span>
  `;

  panel.appendChild(header);
  panel.appendChild(toolbar);
  panel.appendChild(container);
  panel.appendChild(status);

  return panel;
}

function formatValue(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const typeFilters: Record<string, boolean> = {
  log: true,
  info: true,
  warn: false,
  error: false,
};

let expandedMode = false;

function shouldShowLog(type: string, message: string): boolean {
  if (!typeFilters[type]) return false;
  if (filterKeyword && !message.toLowerCase().includes(filterKeyword.toLowerCase())) {
    return false;
  }
  return true;
}

function renderLogs() {
  if (!logContainer) return;

  logContainer.innerHTML = '';
  let visibleCount = 0;

  for (const log of allLogs) {
    const message = log.args.map(formatValue).join(' ');
    if (!shouldShowLog(log.type, message)) continue;

    visibleCount++;
    const entry = document.createElement('div');
    entry.className = `console-log-entry ${log.type}${expandedMode ? ' console-log-expanded' : ''}`;

    const time = log.time.toLocaleTimeString('zh-CN', { hour12: false });
    const icons: Record<string, string> = {
      log: '📝',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };

    entry.innerHTML = `
      ${currentOptions.showTimestamp ? `<span class="console-log-time">${time}</span>` : ''}
      <span class="console-log-icon">${icons[log.type] || '•'}</span>
      <span class="console-log-message">${escapeHtml(message)}</span>
    `;

    // 双击展开/收起单条日志
    entry.addEventListener('dblclick', () => {
      entry.classList.toggle('console-log-expanded');
    });

    logContainer.appendChild(entry);
  }

  updateCount(visibleCount);

  if (currentOptions.autoScroll && !isPaused) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

function addLog(type: string, args: any[]) {
  if (isPaused) return;

  allLogs.push({ type, args, time: new Date() });

  // 限制日志数量
  while (allLogs.length > currentOptions.maxLogs) {
    allLogs.shift();
  }

  renderLogs();
  updateMinimizedCount();
}

function updateCount(count?: number) {
  const countEl = document.getElementById('console-panel-count');
  if (countEl) {
    countEl.textContent = String(count ?? allLogs.length);
  }
}

function updateInfo(text: string) {
  const infoEl = document.getElementById('console-panel-info');
  if (infoEl) {
    infoEl.textContent = text;
  }
}

function setupDraggable(panel: HTMLDivElement) {
  if (!currentOptions.draggable) return;

  const header = document.getElementById('console-panel-header');
  if (!header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panel.style.left = `${Math.max(0, startLeft + dx)}px`;
    panel.style.top = `${Math.max(0, startTop + dy)}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 最小化状态下双击展开
  panel.addEventListener('dblclick', (e) => {
    if (isMinimized && !(e.target as HTMLElement).closest('button')) {
      toggleMinimize();
    }
  });
}

function toggleMinimize() {
  if (!panel) return;
  
  isMinimized = !isMinimized;
  const toggleBtn = document.getElementById('btn-toggle');
  
  if (isMinimized) {
    // 保存当前尺寸
    savedPanelSize.width = panel.offsetWidth;
    savedPanelSize.height = panel.offsetHeight;
    
    // 添加最小化类
    panel.classList.add('minimized');
    if (toggleBtn) toggleBtn.textContent = '🖥️';
    
    // 添加未读计数
    let countBadge = panel.querySelector('.minimized-count') as HTMLElement;
    if (!countBadge) {
      countBadge = document.createElement('span');
      countBadge.className = 'minimized-count';
      panel.appendChild(countBadge);
    }
    countBadge.textContent = String(allLogs.length);
    countBadge.style.display = allLogs.length > 0 ? 'block' : 'none';
  } else {
    // 移除最小化类
    panel.classList.remove('minimized');
    if (toggleBtn) toggleBtn.textContent = '➖';
    
    // 恢复尺寸
    if (savedPanelSize.width > 0) {
      panel.style.width = `${savedPanelSize.width}px`;
      panel.style.height = `${savedPanelSize.height}px`;
    }
    
    // 隐藏计数
    const countBadge = panel.querySelector('.minimized-count') as HTMLElement;
    if (countBadge) countBadge.style.display = 'none';
    
    // 滚动到底部
    if (logContainer && currentOptions.autoScroll) {
      setTimeout(() => {
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
      }, 50);
    }
  }
}

function updateMinimizedCount() {
  if (!isMinimized || !panel) return;
  const countBadge = panel.querySelector('.minimized-count') as HTMLElement;
  if (countBadge) {
    countBadge.textContent = String(allLogs.length);
    countBadge.style.display = allLogs.length > 0 ? 'block' : 'none';
  }
}

function setupButtons() {
  // 折叠/展开按钮
  document.getElementById('btn-toggle')?.addEventListener('click', toggleMinimize);

  // 清除按钮
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    allLogs = [];
    renderLogs();
    updateInfo('Cleared');
  });

  // 暂停按钮
  document.getElementById('btn-pause')?.addEventListener('click', function () {
    isPaused = !isPaused;
    this.textContent = isPaused ? '▶️' : '⏸️';
    this.classList.toggle('active', isPaused);
    updateInfo(isPaused ? 'Paused' : 'Recording');
  });

  // 自动滚动按钮
  document.getElementById('btn-scroll')?.addEventListener('click', function () {
    currentOptions.autoScroll = !currentOptions.autoScroll;
    this.classList.toggle('active', currentOptions.autoScroll);
    updateInfo(currentOptions.autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF');
  });

  // 展开模式按钮
  document.getElementById('btn-expand')?.addEventListener('click', function () {
    expandedMode = !expandedMode;
    this.classList.toggle('active', expandedMode);
    renderLogs();
    updateInfo(expandedMode ? 'Expanded mode' : 'Compact mode');
  });

  // 类型过滤按钮
  ['log', 'info', 'warn', 'error'].forEach((type) => {
    document.getElementById(`btn-${type}`)?.addEventListener('click', function () {
      typeFilters[type] = !typeFilters[type];
      this.classList.toggle('active', typeFilters[type]);
      renderLogs();
    });
  });

  // 过滤输入框
  document.getElementById('console-panel-filter')?.addEventListener('input', function () {
    filterKeyword = (this as HTMLInputElement).value;
    renderLogs();
  });

  // 初始化自动滚动按钮状态
  const scrollBtn = document.getElementById('btn-scroll');
  if (scrollBtn && currentOptions.autoScroll) {
    scrollBtn.classList.add('active');
  }
}

/**
 * 启用控制台面板
 * @param options 配置选项
 */
export function useConsolePanel(options: ConsolePanelOptions = {}) {
  if (isInitialized) {
    originalLog('[ConsolePanel] Already initialized');
    return;
  }

  currentOptions = { ...defaultOptions, ...options };
  filterKeyword = currentOptions.filter;

  const init = () => {
    if (document.getElementById('console-panel')) {
      return;
    }

    panel = createPanel(options);
    document.body.appendChild(panel);
    logContainer = document.getElementById('console-panel-logs') as HTMLDivElement;

    setupDraggable(panel);
    setupButtons();

    // 初始折叠状态
    if (currentOptions.collapsed) {
      document.getElementById('btn-toggle')?.click();
    }

    // 重写 console 方法
    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      addLog('log', args);
    };

    console.info = (...args: any[]) => {
      originalInfo.apply(console, args);
      addLog('info', args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      addLog('warn', args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      addLog('error', args);
    };

    isInitialized = true;
    originalLog('[ConsolePanel] 初始化成功', currentOptions);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

/**
 * 更新面板配置
 */
export function updateConsolePanelOptions(options: Partial<ConsolePanelOptions>) {
  if (!panel) return;

  currentOptions = { ...currentOptions, ...options };

  if (options.width) panel.style.width = `${options.width}px`;
  if (options.height) panel.style.height = `${options.height}px`;
  if (options.maxLogs) {
    while (allLogs.length > options.maxLogs) {
      allLogs.shift();
    }
    renderLogs();
  }
}

/**
 * 销毁控制台面板
 */
export function destroyConsolePanel() {
  if (panel && panel.parentNode) {
    panel.parentNode.removeChild(panel);
  }

  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;

  panel = null;
  logContainer = null;
  isInitialized = false;
  allLogs = [];
}

/**
 * 清除所有日志
 */
export function clearConsoleLogs() {
  allLogs = [];
  renderLogs();
}

/**
 * 导出日志为文本
 */
export function exportConsoleLogs(): string {
  return allLogs
    .map((log) => {
      const time = log.time.toISOString();
      const message = log.args.map(formatValue).join(' ');
      return `[${time}] [${log.type.toUpperCase()}] ${message}`;
    })
    .join('\n');
}
