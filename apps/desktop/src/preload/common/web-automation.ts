/**
 * WebAutomation - 网页自动化框架
 * 
 * 使用方式：
 * await automation.move('#input').wait(200).click().input('hello').run();
 * await automation.move('#btn').click().run(); // 可以继续链式调用
 */

// ==================== 类型定义 ====================

export interface Point {
  x: number;
  y: number;
}

export type Target = string | HTMLElement | Element | Point;

/** 日志过滤函数类型 */
export type LogFilter = (action: ActionType, args: any[]) => boolean;

/** 日志格式化函数类型 */
export type LogFormatter = (action: ActionType, args: any[]) => string;

export interface AutomationConfig {
  /** 是否显示虚拟鼠标指针 */
  showCursor?: boolean;
  /** 是否显示移动轨迹 */
  showTrail?: boolean;
  /** 轨迹长度 */
  trailLength?: number;
  /** 指针颜色 */
  cursorColor?: string;
  /** 轨迹颜色 */
  trailColor?: string;
  /** 指针大小 */
  cursorSize?: number;
  /** 默认移动速度（像素/秒） */
  moveSpeed?: number;
  /** 抖动强度 0-10 */
  jitter?: number;
  /** 是否触发 DOM 事件 */
  dispatchEvents?: boolean;
  /** 默认打字间隔（毫秒） */
  inputDelay?: number;
  /** 是否启用日志 */
  enableLog?: boolean;
  /** 日志前缀 */
  logPrefix?: string;
}

// 操作类型
export type ActionType =
  | 'move' | 'click' | 'doubleClick' | 'rightClick' | 'hover' | 'drag' | 'scroll' | 'scrollTo'
  | 'input' | 'fill' | 'clear' | 'press' | 'keyDown' | 'keyUp' | 'combo'
  | 'focus' | 'blur' | 'check' | 'uncheck' | 'select'
  | 'wait' | 'waitElement' | 'waitHidden' | 'waitText' | 'waitFor'
  | 'autoPoint' | 'selectText'
  | 'eval' | 'log';

interface Action {
  type: ActionType;
  args: any[];
}

// ==================== 工具函数 ====================

function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

// 生成噪声值（Perlin-like噪声简化版）
function noise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

// 生成平滑的随机噪声曲线
function smoothNoise(t: number, seed: number, frequency: number = 3): number {
  const x = t * frequency;
  const i = Math.floor(x);
  const f = x - i;
  const smooth = f * f * (3 - 2 * f); // smoothstep
  return noise(i, 0, seed) * (1 - smooth) + noise(i + 1, 0, seed) * smooth;
}

// 生成带弧度的移动路径点（更圆滑版本）
function generateRandomPath(start: Point, end: Point, segments: number = 8): Point[] {
  const path: Point[] = [start];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = distance(start, end);

  if (dist < 1) return [start, end];

  // 增加分段数使弧度更圆滑
  const actualSegments = Math.max(6, Math.min(segments + 2, Math.floor(dist / 50) + 5));

  // 垂直于路径的方向（安全计算）
  const perpX = dist > 0 ? -dy / dist : 0;
  const perpY = dist > 0 ? dx / dist : 0;

  // 弧度方向（随机选择向左或向右弯曲）
  const arcDirection = Math.random() > 0.5 ? 1 : -1;
  // 弧度强度：适中的弧度（距离的 5%-10%）
  const arcStrength = dist * random(0.05, 0.10);

  for (let i = 1; i < actualSegments; i++) {
    const t = i / actualSegments;

    // 使用 smoothstep 使基础路径更平滑
    const smoothT = t * t * (3 - 2 * t);
    const baseX = start.x + dx * smoothT;
    const baseY = start.y + dy * smoothT;

    // 使用平滑的正弦函数生成更圆滑的弧度（中间最大，两端为0）
    const sinValue = Math.sin(t * Math.PI);
    // 使用 smoothstep 进一步平滑弧度
    const smoothArc = sinValue * sinValue * (3 - 2 * sinValue);
    const arcOffset = smoothArc * arcStrength * arcDirection;

    // 组合偏移（圆滑的弧度）
    path.push({
      x: baseX + perpX * arcOffset,
      y: baseY + perpY * arcOffset,
    });
  }

  path.push(end);
  return path;
}

// 添加抖动（带方向性）- 更顺滑版本
function addJitter(point: Point, strength: number, direction?: { x: number; y: number }): Point {
  // 降低抖动强度
  const j = strength * 0.2;
  let jx = random(-j, j);
  let jy = random(-j, j);

  // 如果有方向，偏向垂直于该方向的抖动（更自然）
  if (direction) {
    const len = Math.sqrt(direction.x ** 2 + direction.y ** 2);
    if (len > 0) {
      const perpX = -direction.y / len;
      const perpY = direction.x / len;
      const perpJitter = random(-j, j);
      jx = perpX * perpJitter * 0.5 + random(-j * 0.2, j * 0.2);
      jy = perpY * perpJitter * 0.5 + random(-j * 0.2, j * 0.2);
    }
  }

  return {
    x: point.x + jx,
    y: point.y + jy
  };
}

// 生成速度曲线（完全平滑，无任何随机变化或噪声）
function getVelocity(t: number, hasOvershoot: boolean, seed: number = 0): number {
  // 使用完全平滑的多阶段速度曲线
  let velocity: number;

  if (t < 0.15) {
    // 起步阶段：缓慢加速
    velocity = t * t * 20;
  } else if (t < 0.4) {
    // 快速加速阶段
    const localT = (t - 0.15) / 0.25;
    velocity = 0.045 + localT * localT * 0.4;
  } else if (t < 0.7) {
    // 最高速阶段：完全平滑
    const localT = (t - 0.4) / 0.3;
    velocity = 0.445 + localT * 0.35;
  } else {
    // 减速阶段
    const localT = (t - 0.7) / 0.3;
    velocity = 0.795 + (1 - 0.795) * (1 - Math.pow(1 - localT, 2.5));
  }

  // 完全移除所有噪声和随机变化，确保绝对平滑
  // 如果会过头，在接近目标时有特殊处理
  if (hasOvershoot && t > 0.8) {
    const overshootT = (t - 0.8) / 0.2;
    velocity = velocity * (1 + Math.sin(overshootT * Math.PI * 0.5) * 0.08);
  }

  return clamp(velocity, 0, 1);
}

// 计算过头位置（更自然的过头，带椭圆弧度方向）
function calculateOvershoot(target: Point, start: Point, overshootFactor: number = 1.15): Point {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dist = distance(start, target);
  const overshootDist = dist * (overshootFactor - 1) * random(0.8, 1.2);
  const angle = Math.atan2(dy, dx);

  // 较小的角度偏移（形成椭圆弧度的一部分，不是直线）
  const angleOffset = random(-Math.PI / 6, Math.PI / 6); // 减小到30度范围

  // 过头位置（形成椭圆弧度的一部分）
  return {
    x: target.x + Math.cos(angle + angleOffset) * overshootDist,
    y: target.y + Math.sin(angle + angleOffset) * overshootDist,
  };
}

// 生成回退路径（过头后返回目标，使用更圆滑的椭圆形状弧度）
function generateReturnPath(overshootPoint: Point, target: Point): Point[] {
  const path: Point[] = [overshootPoint];
  const dx = target.x - overshootPoint.x;
  const dy = target.y - overshootPoint.y;
  const dist = distance(overshootPoint, target);

  if (dist < 1) return [overshootPoint, target];

  // 增加分段数，使弧度更圆滑
  const segments = Math.max(12, Math.min(20, Math.floor(dist / 20) + 8));

  // 垂直于路径的方向（用于椭圆弧度）
  const perpX = dist > 0 ? -dy / dist : 0;
  const perpY = dist > 0 ? dx / dist : 0;

  // 椭圆弧度方向（随机选择向左或向右弯曲）
  const arcDirection = Math.random() > 0.5 ? 1 : -1;
  // 椭圆弧度强度（距离的 12%-20%，形成圆滑的椭圆）
  const arcStrength = dist * random(0.12, 0.20);

  for (let i = 1; i < segments; i++) {
    const t = i / segments;

    // 基础直线路径（使用缓动函数使路径更平滑）
    const easedT = t * t * (3 - 2 * t); // smoothstep
    const baseX = overshootPoint.x + dx * easedT;
    const baseY = overshootPoint.y + dy * easedT;

    // 更圆滑的椭圆弧度（使用平滑的椭圆函数）
    // 使用 smoothstep 包装的 sin 函数，使弧度更圆滑
    const ellipseT = t * Math.PI; // 0 到 π
    const smoothEllipse = Math.sin(ellipseT);
    // 使用 smoothstep 进一步平滑
    const smoothArc = smoothEllipse * smoothEllipse * (3 - 2 * smoothEllipse);
    const arcOffset = smoothArc * arcStrength * arcDirection;

    // 组合偏移（圆滑的椭圆弧度）
    path.push({
      x: baseX + perpX * arcOffset,
      y: baseY + perpY * arcOffset,
    });
  }

  path.push(target);
  return path;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ==================== 主类 ====================

export class WebAutomation {
  private config: Required<AutomationConfig>;
  private pos: Point;
  private queue: Action[] = [];
  private running = false;
  private stopped = false;
  private frameId: number | null = null;
  private lastHovered: Element | null = null;
  private trails: Point[] = [];

  // DOM
  private container: HTMLDivElement | null = null;
  private cursor: HTMLDivElement | null = null;

  // 日志
  private logEnabled: boolean;
  private logFilter: LogFilter | null = null;
  private logFormatter: LogFormatter | null = null;
  private logPrefix: string;

  constructor(config: AutomationConfig = {}) {
    this.config = {
      showCursor: config.showCursor ?? true,
      showTrail: config.showTrail ?? true,
      trailLength: config.trailLength ?? 20,
      cursorColor: config.cursorColor ?? '#FF4136',
      trailColor: config.trailColor ?? 'rgba(255, 65, 54, 0.6)',
      cursorSize: config.cursorSize ?? 20,
      moveSpeed: config.moveSpeed ?? 500,
      jitter: config.jitter ?? 3,
      dispatchEvents: config.dispatchEvents ?? true,
      inputDelay: config.inputDelay ?? 80,
      enableLog: config.enableLog ?? false,
      logPrefix: config.logPrefix ?? '[Auto]',
    };
    this.pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.logEnabled = this.config.enableLog;
    this.logPrefix = this.config.logPrefix;
  }

  // ==================== 内部方法 ====================

  private getElement(target: Target): HTMLElement | null {
    if (typeof target === 'string') return document.querySelector(target);
    if (target instanceof HTMLElement) return target;
    if (target instanceof Element) return target as HTMLElement;
    return null;
  }

  private getPoint(target: Target): Point | null {
    if (typeof target === 'object' && 'x' in target && 'y' in target) {
      return target as Point;
    }
    const el = this.getElement(target);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + random(-rect.width * 0.1, rect.width * 0.1),
      y: rect.top + rect.height / 2 + random(-rect.height * 0.1, rect.height * 0.1),
    };
  }

  private initVisual(): void {
    if (this.container) return;
    if (!document.body) return; // 安全检查

    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'web-auto-container';
    const containerStyle = this.container.style;
    containerStyle.position = 'fixed';
    containerStyle.top = '0';
    containerStyle.left = '0';
    containerStyle.width = '100vw';
    containerStyle.height = '100vh';
    containerStyle.pointerEvents = 'none';
    containerStyle.zIndex = '2147483647';
    containerStyle.overflow = 'hidden';

    // 创建轨迹容器（使用 CSS 动画代替 Canvas，更稳定）
    if (this.config.showTrail) {
      this.trailContainer = document.createElement('div');
      this.trailContainer.id = 'web-auto-trail';
      this.trailContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      this.container.appendChild(this.trailContainer);
    }

    // 创建虚拟鼠标指针
    if (this.config.showCursor) {
      this.cursor = document.createElement('div');
      const cursorStyle = this.cursor.style;
      cursorStyle.position = 'absolute';
      cursorStyle.width = `${this.config.cursorSize}px`;
      cursorStyle.height = `${this.config.cursorSize}px`;
      cursorStyle.pointerEvents = 'none';
      cursorStyle.transform = 'translate(-50%, -50%)';
      cursorStyle.zIndex = '1';
      cursorStyle.willChange = 'left, top';
      cursorStyle.transition = 'none'; // 禁用 transition 以避免延迟

      this.cursor.innerHTML = `
        <svg width="${this.config.cursorSize}" height="${this.config.cursorSize}" viewBox="0 0 24 24" fill="none">
          <path d="M4 4L10.5 20.5L13 13L20.5 10.5L4 4Z" fill="${this.config.cursorColor}" stroke="#fff" stroke-width="1.5"/>
          <circle cx="13" cy="13" r="3" fill="${this.config.cursorColor}" stroke="#fff" stroke-width="1"/>
        </svg>
      `;
      this.container.appendChild(this.cursor);
    }

    document.body.appendChild(this.container);
  }

  // 轨迹容器（用于 CSS 动画方式）
  private trailContainer: HTMLDivElement | null = null;
  private trailDots: HTMLDivElement[] = [];

  private updateCursor(p: Point): void {
    if (this.cursor) {
      this.cursor.style.left = `${p.x}px`;
      this.cursor.style.top = `${p.y}px`;
    }
  }

  private addTrail(p: Point): void {
    this.trails.push({ ...p });
    if (this.trails.length > this.config.trailLength) this.trails.shift();
  }

  // 使用 CSS 动画绘制轨迹（更稳定，避免 Canvas 崩溃问题）
  private drawTrail(): void {
    if (!this.trailContainer || !document.body.contains(this.trailContainer)) return;
    if (this.trails.length < 2) return;

    // 清理旧的轨迹点
    while (this.trailDots.length > this.config.trailLength) {
      const oldDot = this.trailDots.shift();
      if (oldDot && oldDot.parentNode) {
        oldDot.parentNode.removeChild(oldDot);
      }
    }

    // 添加新的轨迹点
    const last = this.trails[this.trails.length - 1];
    const dot = document.createElement('div');
    dot.style.cssText = `
      position: absolute;
      left: ${last.x}px;
      top: ${last.y}px;
      width: 8px;
      height: 8px;
      margin: -4px 0 0 -4px;
      border-radius: 50%;
      background: ${this.config.trailColor};
      pointer-events: none;
      opacity: 0.8;
      animation: trail-fade 0.5s ease-out forwards;
    `;
    this.trailContainer.appendChild(dot);
    this.trailDots.push(dot);

    // 添加动画样式（只添加一次）
    if (!document.getElementById('web-auto-trail-style')) {
      const style = document.createElement('style');
      style.id = 'web-auto-trail-style';
      style.textContent = `
        @keyframes trail-fade {
          0% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.3); }
        }
      `;
      document.head.appendChild(style);
    }

    // 自动清理已完成动画的点
    setTimeout(() => {
      if (dot && dot.parentNode) {
        dot.parentNode.removeChild(dot);
      }
      const idx = this.trailDots.indexOf(dot);
      if (idx > -1) this.trailDots.splice(idx, 1);
    }, 500);
  }

  private fireMouseEvent(type: string, p: Point, opts: Partial<MouseEventInit> = {}): Element | null {
    // 安全检查
    if (!this.isDomValid()) return null;

    try {
      const target = document.elementFromPoint(p.x, p.y) || document.body;
      if (!target) return null;

      if (this.config.dispatchEvents) {
        target.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: p.x, clientY: p.y,
          screenX: p.x + window.screenX, screenY: p.y + window.screenY,
          ...opts,
        }));

        if (type === 'mousemove' && target !== this.lastHovered) {
          if (this.lastHovered && document.body.contains(this.lastHovered)) {
            this.lastHovered.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, view: window, clientX: p.x, clientY: p.y }));
            this.lastHovered.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, view: window, clientX: p.x, clientY: p.y, relatedTarget: target }));
          }
          target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, view: window, clientX: p.x, clientY: p.y }));
          target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, view: window, clientX: p.x, clientY: p.y, relatedTarget: this.lastHovered }));
          this.lastHovered = target;
        }
      }
      return target;
    } catch (e) {
      console.warn('[Automation] fireMouseEvent error:', e);
      return null;
    }
  }

  private fireKeyEvent(type: string, key: string, target: Element, mods: Partial<KeyboardEventInit> = {}): void {
    if (!this.config.dispatchEvents) return;
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code, ...mods }));
  }

  private fireInputEvent(el: Element, data?: string): void {
    if (!this.config.dispatchEvents) return;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data, inputType: data ? 'insertText' : 'deleteContentBackward' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private fireFocusEvent(type: 'focus' | 'blur' | 'focusin' | 'focusout', el: Element): void {
    if (!this.config.dispatchEvents) return;
    el.dispatchEvent(new FocusEvent(type, { bubbles: type === 'focusin' || type === 'focusout', view: window }));
  }

  // 检查 DOM 是否有效
  private isDomValid(): boolean {
    return !!(document && document.body && !this.stopped);
  }

  // 移动到目标点并等待完成（用于 selectText 的前置移动）
  private async moveToPointAndWait(target: Point): Promise<void> {
    await sleep(1200);

    return new Promise<void>((resolve) => {
      if (!this.isDomValid()) {
        resolve();
        return;
      }

      // 关键修复：使用当前的 this.pos 作为起点
      const actualStart = { ...this.pos };
      const dist = distance(actualStart, target);

      // 如果距离很近，直接设置位置并等待
      if (dist < 3) {
        this.pos = { ...target };
        this.updateCursor(this.pos);
        this.fireMouseEvent('mousemove', this.pos);
        // 等待一小段时间确保事件处理完成
        setTimeout(() => resolve(), 50);
        return;
      }

      this.running = true;
      this.stopped = false;
      this.initVisual();

      // 完全移除随机时间变化，确保平滑
      const moveDuration = (dist / this.config.moveSpeed) * 1000;
      // 从当前的 this.pos 开始生成路径
      const path = generateRandomPath(actualStart, target, Math.max(4, Math.floor(dist / 60)));
      // 关键修复：强制路径的第一点就是当前的 this.pos
      if (path.length > 0) {
        path[0] = { ...this.pos };
      }
      const startTime = performance.now();
      // 关键修复：lastPos 从当前的 this.pos 开始
      let lastPos = { ...this.pos };
      let completed = false;
      let animationFrameId: number | null = null;
      let isFirstFrame = true;

      // 超时保护
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
          }
          this.pos = { ...target };
          this.updateCursor(this.pos);
          this.fireMouseEvent('mousemove', this.pos);
          this.running = false;
          // 等待确保事件处理完成
          setTimeout(() => resolve(), 50);
        }
      }, moveDuration * 2 + 1000);

      const finish = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutId);
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
        // 确保最终位置正确
        this.pos = { ...target };
        this.updateCursor(this.pos);
        this.fireMouseEvent('mousemove', this.pos);
        this.running = false;
        // 等待一小段时间确保所有事件和渲染完成
        setTimeout(() => resolve(), 100);
      };

      const animate = (now: number) => {
        if (completed) return;

        if (this.stopped || !this.isDomValid()) {
          finish();
          return;
        }

        // 第一帧：确保从当前位置开始，不瞬移
        if (isFirstFrame) {
          lastPos = { ...this.pos };
          // 如果当前位置和路径起点不一致，需要平滑过渡
          if (path.length > 0) {
            const pathStartDist = distance(this.pos, path[0]);
            if (pathStartDist > 5) {
              // 当前位置和路径起点差距较大，需要平滑过渡
              const transitionRatio = Math.min(1, 5 / pathStartDist);
              const pathStart = path[0];
              this.pos = {
                x: this.pos.x + (pathStart.x - this.pos.x) * transitionRatio,
                y: this.pos.y + (pathStart.y - this.pos.y) * transitionRatio,
              };
              lastPos = { ...this.pos };
            }
          }
          isFirstFrame = false;
        }

        const elapsed = now - startTime;
        const progress = clamp(elapsed / moveDuration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 2.5);

        if (path.length >= 2) {
          const pathProgress = eased * (path.length - 1);
          const pathIdx = clamp(Math.floor(pathProgress), 0, path.length - 2);
          const pathT = pathProgress - pathIdx;

          const p1 = path[pathIdx];
          const p2 = path[pathIdx + 1];

          if (p1 && p2) {
            let pt = {
              x: p1.x + (p2.x - p1.x) * pathT,
              y: p1.y + (p2.y - p1.y) * pathT,
            };

            // 增加最大步长，使移动更平滑
            const maxStep = Math.max(8, dist * 0.12);
            const stepDist = distance(lastPos, pt);
            if (stepDist > maxStep) {
              const ratio = maxStep / stepDist;
              pt = {
                x: lastPos.x + (pt.x - lastPos.x) * ratio,
                y: lastPos.y + (pt.y - lastPos.y) * ratio,
              };
            }

            this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
            lastPos = { ...this.pos };
          }
        }

        this.updateCursor(this.pos);
        this.addTrail(this.pos);
        this.drawTrail();
        this.fireMouseEvent('mousemove', this.pos);

        if (progress < 1) {
          animationFrameId = requestAnimationFrame(animate);
        } else {
          // 动画完成，验证位置并完成
          const finalDist = distance(this.pos, target);
          if (finalDist > 2) {
            // 如果还没到位，再等待一帧
            this.pos = { ...target };
            this.updateCursor(this.pos);
            this.fireMouseEvent('mousemove', this.pos);
          }
          finish();
        }
      };

      animationFrameId = requestAnimationFrame(animate);
    });
  }

  // 简单移动到目标点（用于 selectText 的前置移动）
  private async moveToPointSimple(target: Point): Promise<void> {
    if (!this.isDomValid()) return;

    // 关键修复：使用当前的 this.pos 作为起点
    const actualStart = { ...this.pos };
    const dist = distance(actualStart, target);
    if (dist < 1) {
      this.pos = { ...target };
      this.updateCursor(this.pos);
      this.fireMouseEvent('mousemove', this.pos);
      return;
    }

    this.running = true;
    this.stopped = false;
    this.initVisual();

    // 完全移除随机时间变化，确保平滑
    const moveDuration = (dist / this.config.moveSpeed) * 1000;
    // 从当前的 this.pos 开始生成路径
    const path = generateRandomPath(actualStart, target, Math.max(4, Math.floor(dist / 60)));
    // 关键修复：强制路径的第一点就是当前的 this.pos
    if (path.length > 0) {
      path[0] = { ...this.pos };
    }

    return new Promise<void>(resolve => {
      const startTime = performance.now();
      // 关键修复：lastPos 从当前的 this.pos 开始
      let lastPos = { ...this.pos };
      let resolved = false;
      let isFirstFrame = true;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.pos = { ...target };
          this.updateCursor(this.pos);
          this.fireMouseEvent('mousemove', this.pos);
          this.running = false;
          resolve();
        }
      }, moveDuration * 2 + 500);

      const animate = (now: number) => {
        if (resolved) return;

        if (this.stopped || !this.isDomValid()) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.running = false;
            resolve();
          }
          return;
        }

        // 第一帧：确保从当前位置开始，不瞬移
        if (isFirstFrame) {
          lastPos = { ...this.pos };
          // 如果当前位置和路径起点不一致，需要平滑过渡
          if (path.length > 0) {
            const pathStartDist = distance(this.pos, path[0]);
            if (pathStartDist > 5) {
              // 当前位置和路径起点差距较大，需要平滑过渡
              const transitionRatio = Math.min(1, 5 / pathStartDist);
              const pathStart = path[0];
              this.pos = {
                x: this.pos.x + (pathStart.x - this.pos.x) * transitionRatio,
                y: this.pos.y + (pathStart.y - this.pos.y) * transitionRatio,
              };
              lastPos = { ...this.pos };
            }
          }
          isFirstFrame = false;
        }

        const elapsed = now - startTime;
        const progress = clamp(elapsed / moveDuration, 0, 1);

        // 使用缓动函数
        const eased = 1 - Math.pow(1 - progress, 2.5);

        if (path.length >= 2) {
          const pathProgress = eased * (path.length - 1);
          const pathIdx = clamp(Math.floor(pathProgress), 0, path.length - 2);
          const pathT = pathProgress - pathIdx;

          const p1 = path[pathIdx];
          const p2 = path[pathIdx + 1];

          if (p1 && p2) {
            let pt = {
              x: p1.x + (p2.x - p1.x) * pathT,
              y: p1.y + (p2.y - p1.y) * pathT,
            };

            // 增加最大步长，使移动更平滑
            const maxStep = Math.max(8, dist * 0.12);
            const stepDist = distance(lastPos, pt);
            if (stepDist > maxStep) {
              const ratio = maxStep / stepDist;
              pt = {
                x: lastPos.x + (pt.x - lastPos.x) * ratio,
                y: lastPos.y + (pt.y - lastPos.y) * ratio,
              };
            }

            this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
            lastPos = { ...this.pos };
          }
        }

        this.updateCursor(this.pos);
        this.addTrail(this.pos);
        this.drawTrail();
        this.fireMouseEvent('mousemove', this.pos);

        if (progress < 1) {
          this.frameId = requestAnimationFrame(animate);
        } else {
          // 确保最终位置正确
          this.pos = { ...target };
          this.updateCursor(this.pos);
          this.fireMouseEvent('mousemove', this.pos);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.running = false;
            resolve();
          }
        }
      };

      this.frameId = requestAnimationFrame(animate);
    });
  }

  // 模拟真人滚动
  private async doScroll(
    element: Element,
    startScrollTop: number,
    targetScrollTop: number,
    scrollLeft: number
  ): Promise<void> {
    if (!this.isDomValid()) return;

    const scrollDelta = targetScrollTop - startScrollTop;
    if (Math.abs(scrollDelta) < 1) {
      // 滚动距离太小，直接完成
      return;
    }

    // 计算滚动时间（基于滚动距离，模拟真人滚动速度）
    // 真人滚动速度大约 50-100px/100ms
    const scrollSpeed = 80; // px/100ms
    const duration = Math.max(200, Math.min(800, Math.abs(scrollDelta) / scrollSpeed * 100));

    return new Promise<void>(resolve => {
      const startTime = performance.now();
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          element.scrollTop = targetScrollTop;
          resolve();
        }
      }, duration + 200);

      let lastScrollTop = startScrollTop;
      let isFirstFrame = true;

      const animate = (now: number) => {
        if (resolved) return;

        if (this.stopped || !this.isDomValid()) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
          return;
        }

        const elapsed = now - startTime;
        const progress = clamp(elapsed / duration, 0, 1);

        // 使用缓动函数（ease-out，模拟真人滚动）
        const eased = 1 - Math.pow(1 - progress, 2.5);

        // 计算当前滚动位置
        const currentScrollTop = startScrollTop + scrollDelta * eased;
        
        // 第一帧：初始化 lastScrollTop
        if (isFirstFrame) {
          lastScrollTop = startScrollTop;
          isFirstFrame = false;
        }

        // 计算这一帧的滚动增量
        const deltaY = currentScrollTop - lastScrollTop;
        
        // 设置滚动位置
        element.scrollTop = currentScrollTop;
        
        // 触发 wheel 事件来模拟真实的滚动行为
        if (Math.abs(deltaY) > 0.1) {
          const wheelEvent = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: deltaY * 100, // 转换为 wheel 事件的 deltaY
            deltaMode: 0,
            clientX: this.pos.x,
            clientY: this.pos.y,
          });
          element.dispatchEvent(wheelEvent);
        }

        lastScrollTop = currentScrollTop;

        if (progress < 1) {
          this.frameId = requestAnimationFrame(animate);
        } else {
          // 确保最终位置正确
          element.scrollTop = targetScrollTop;
          
          // 触发最后一次 wheel 事件
          const finalDeltaY = targetScrollTop - lastScrollTop;
          if (Math.abs(finalDeltaY) > 0.1) {
            const wheelEvent = new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              deltaY: finalDeltaY * 100,
              deltaMode: 0,
              clientX: this.pos.x,
              clientY: this.pos.y,
            });
            element.dispatchEvent(wheelEvent);
          }
          
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        }
      };

      this.frameId = requestAnimationFrame(animate);
    });
  }

  // 核心移动逻辑 - 完全平滑，不允许折返，有小幅度曲线
  private async doMove(target: Point, duration?: number, options?: {
    overshoot?: boolean; // 是否允许过头（仅用于特殊场景，默认不允许）
  }): Promise<void> {
    if (!this.isDomValid()) return;

    const start = { ...this.pos };
    const dist = distance(start, target);
    if (dist < 1) {
      this.pos = { ...target };
      this.updateCursor(this.pos);
      this.fireMouseEvent('mousemove', this.pos);
      return;
    }

    // move 函数不允许折返，除非明确指定
    const overshoot = options?.overshoot ?? false;

    // 关键修复：使用当前的 this.pos 作为起点，而不是 start
    // 这样可以避免在静止后再次移动时出现瞬移
    const actualStart = { ...this.pos };
    const actualDist = distance(actualStart, target);

    // 计算总时间（完全平滑，无随机变化）
    const baseTime = duration ?? (actualDist / this.config.moveSpeed) * 1000;
    const time = baseTime;

    // 生成路径点（带小幅度曲线，确保有弧度）
    // 从当前的 this.pos 开始，而不是 start
    const segments = Math.max(6, Math.min(12, Math.floor(actualDist / 50) + 4));
    const pathPoints = generateRandomPath(actualStart, target, segments);
    
    // 关键修复：强制路径的第一点就是当前的 this.pos，避免任何不一致
    if (pathPoints.length > 0) {
      pathPoints[0] = { ...this.pos };
    }

    this.running = true;
    this.stopped = false;
    this.initVisual();

    return new Promise<void>(resolve => {
      const startTime = performance.now();
      const maxDuration = time * 2 + 500;
      // 关键修复：lastPos 必须从当前的 this.pos 开始，而不是 start
      // 这样可以避免在静止后再次移动时出现瞬移
      let lastPos = { ...this.pos };
      let resolved = false;
      let isFirstFrame = true;

      // 超时保护
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.running = false;
          this.pos = { ...target };
          this.updateCursor(this.pos);
          resolve();
        }
      }, maxDuration);

      const animate = (now: number) => {
        if (resolved) return;

        if (this.stopped || !this.isDomValid()) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.running = false;
            resolve();
          }
          return;
        }

        // 第一帧：确保从当前位置开始，不瞬移
        if (isFirstFrame) {
          lastPos = { ...this.pos };
          // 路径的第一点已经强制设置为 this.pos，所以这里不需要过渡
          isFirstFrame = false;
        }

        // 计算当前进度（完全平滑）
        const elapsed = now - startTime;
        const progress = clamp(elapsed / time, 0, 1);

        // 使用完全平滑的速度曲线（无任何噪声）
        const velocity = getVelocity(progress, false, 0);
        const actualProgress = velocity * (pathPoints.length - 1);
        const actualSegment = clamp(Math.floor(actualProgress), 0, pathPoints.length - 2);
        const actualSegmentT = actualProgress - actualSegment;

        const ap1 = pathPoints[actualSegment];
        const ap2 = pathPoints[actualSegment + 1];

        if (ap1 && ap2) {
          let pt = {
            x: ap1.x + (ap2.x - ap1.x) * actualSegmentT,
            y: ap1.y + (ap2.y - ap1.y) * actualSegmentT,
          };

          // 限速防止瞬移（确保平滑）
          const maxStep = Math.max(8, actualDist * 0.12); // 增加最大步长，使移动更平滑
          const stepDist = distance(lastPos, pt);
          if (stepDist > maxStep) {
            const ratio = maxStep / stepDist;
            pt = {
              x: lastPos.x + (pt.x - lastPos.x) * ratio,
              y: lastPos.y + (pt.y - lastPos.y) * ratio,
            };
          }

          this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
          lastPos = { ...this.pos };
        }

        this.updateCursor(this.pos);
        this.addTrail(this.pos);
        this.drawTrail();
        this.fireMouseEvent('mousemove', this.pos);

        if (progress < 1) {
          this.frameId = requestAnimationFrame(animate);
        } else {
          // 确保最终位置正确
          if (distance(this.pos, target) > 1) {
            this.pos = { ...target };
            this.updateCursor(this.pos);
            this.fireMouseEvent('mousemove', this.pos);
          }
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.running = false;
            resolve();
          }
        }
      };

      this.frameId = requestAnimationFrame(animate);
    });
  }

  // 自动无规则移动（确保最小移动距离和时间，杜绝抽风）
  private async doAutoPoint(duration: number): Promise<void> {
    if (!this.isDomValid()) return;
    if (duration <= 0) return;

    this.running = true;
    this.stopped = false;
    this.initVisual();

    const startTime = performance.now();
    const startPos = { ...this.pos };
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // 随机种子
    const seed = Math.random() * 10000;

    // 计算移动次数：确保每次移动至少600ms和500px
    const minMoveTime = 600; // 最小移动时间600ms
    const minMoveDist = 500; // 最小移动距离500px
    const maxTargetCount = Math.floor(duration / minMoveTime);
    const targetCount = Math.min(2, Math.max(1, maxTargetCount));

    const targets: Point[] = [];
    const moveDurations: number[] = []; // 记录每次移动的持续时间
    let lastTarget = startPos;
    let totalMoveTime = 0;

    for (let i = 0; i < targetCount; i++) {
      // 计算这次移动的时间（至少600ms）
      const remainingTime = duration - totalMoveTime;
      const remainingMoves = targetCount - i;
      const thisMoveTime = Math.max(minMoveTime, remainingTime / remainingMoves);
      moveDurations.push(thisMoveTime);
      totalMoveTime += thisMoveTime;

      // 最小移动距离 500 像素
      const maxDist = Math.min(1200, viewport.width * 0.8);
      const targetDist = random(minMoveDist, maxDist);
      const targetAngle = random(0, Math.PI * 2);

      let newTarget = {
        x: lastTarget.x + Math.cos(targetAngle) * targetDist,
        y: lastTarget.y + Math.sin(targetAngle) * targetDist,
      };

      // 确保在视口内
      newTarget.x = clamp(newTarget.x, 100, viewport.width - 100);
      newTarget.y = clamp(newTarget.y, 100, viewport.height - 100);

      // 确保实际移动距离至少 500 像素
      const actualDist = distance(lastTarget, newTarget);
      if (actualDist < minMoveDist) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const newAngle = targetAngle + Math.PI * (0.3 + attempt * 0.4);
          newTarget = {
            x: lastTarget.x + Math.cos(newAngle) * minMoveDist * 1.1,
            y: lastTarget.y + Math.sin(newAngle) * minMoveDist * 1.1,
          };
          newTarget.x = clamp(newTarget.x, 100, viewport.width - 100);
          newTarget.y = clamp(newTarget.y, 100, viewport.height - 100);
          if (distance(lastTarget, newTarget) >= minMoveDist) break;
        }
      }

      targets.push(newTarget);
      lastTarget = newTarget;
    }

    // 为每个目标生成带弧度的路径
    // 关键修复：第一个路径从当前的 this.pos 开始，而不是 startPos
    const paths: Point[][] = [];
    let pathStart = { ...this.pos }; // 从当前位置开始
    for (const target of targets) {
      const path = generateRandomPath(pathStart, target, randomInt(6, 10));
      // 关键修复：强制路径的第一点就是 pathStart
      if (path.length > 0) {
        path[0] = { ...pathStart };
      }
      paths.push(path);
      pathStart = target;
    }

    let currentTargetIdx = 0;
    let segmentStartTime = startTime;
    // 关键修复：lastPos 从当前的 this.pos 开始
    let lastPos = { ...this.pos };
    let isFirstFrame = true;

    return new Promise<void>(resolve => {
      const animate = (now: number) => {
        if (this.stopped || !this.isDomValid()) {
          this.running = false;
          resolve();
          return;
        }

        // 第一帧：确保从当前位置开始，不瞬移
        if (isFirstFrame) {
          lastPos = { ...this.pos };
          // 如果当前位置和第一个路径起点不一致，需要平滑过渡
          if (paths.length > 0 && paths[0].length > 0) {
            const pathStartDist = distance(this.pos, paths[0][0]);
            if (pathStartDist > 5) {
              // 当前位置和路径起点差距较大，需要平滑过渡
              const transitionRatio = Math.min(1, 5 / pathStartDist);
              const pathStart = paths[0][0];
              this.pos = {
                x: this.pos.x + (pathStart.x - this.pos.x) * transitionRatio,
                y: this.pos.y + (pathStart.y - this.pos.y) * transitionRatio,
              };
              lastPos = { ...this.pos };
            }
          }
          isFirstFrame = false;
        }

        const elapsed = now - startTime;
        if (elapsed >= duration) {
          this.running = false;
          resolve();
          return;
        }

        // 计算当前应该在哪个目标上
        let accumulatedTime = 0;
        let targetIdx = 0;
        for (let i = 0; i < moveDurations.length; i++) {
          if (elapsed < accumulatedTime + moveDurations[i]) {
            targetIdx = i;
            break;
          }
          accumulatedTime += moveDurations[i];
          targetIdx = i;
        }

        if (targetIdx !== currentTargetIdx) {
          currentTargetIdx = targetIdx;
          segmentStartTime = now - accumulatedTime;
          // 切换目标时，从当前位置开始，并检查是否需要平滑过渡
          lastPos = { ...this.pos };
          if (paths[targetIdx] && paths[targetIdx].length > 0) {
            const pathStartDist = distance(this.pos, paths[targetIdx][0]);
            if (pathStartDist > 5) {
              const transitionRatio = Math.min(1, 5 / pathStartDist);
              const pathStart = paths[targetIdx][0];
              this.pos = {
                x: this.pos.x + (pathStart.x - this.pos.x) * transitionRatio,
                y: this.pos.y + (pathStart.y - this.pos.y) * transitionRatio,
              };
              lastPos = { ...this.pos };
            }
          }
        }

        const currentPath = paths[targetIdx];
        if (!currentPath || currentPath.length < 2) {
          this.frameId = requestAnimationFrame(animate);
          return;
        }

        // 在当前路径上的进度（基于时间）
        const segmentElapsed = now - segmentStartTime;
        const segmentProgress = clamp(segmentElapsed / moveDurations[targetIdx], 0, 1);
        const velocity = getVelocity(segmentProgress, false, 0); // 移除 seed，确保完全平滑

        const pathT = velocity * (currentPath.length - 1);
        const pathIdx = clamp(Math.floor(pathT), 0, currentPath.length - 2);
        const pathSegmentT = pathT - pathIdx;

        const p1 = currentPath[pathIdx];
        const p2 = currentPath[pathIdx + 1];

        if (!p1 || !p2) {
          this.frameId = requestAnimationFrame(animate);
          return;
        }

        let pt = {
          x: p1.x + (p2.x - p1.x) * pathSegmentT,
          y: p1.y + (p2.y - p1.y) * pathSegmentT,
        };

        // 限速防止瞬移（增加最大步长，使移动更平滑）
        const currentPathDist = distance(currentPath[0], currentPath[currentPath.length - 1]);
        const maxStep = Math.max(20, currentPathDist * 0.15);
        const stepDist = distance(lastPos, pt);
        if (stepDist > maxStep) {
          const ratio = maxStep / stepDist;
          pt = {
            x: lastPos.x + (pt.x - lastPos.x) * ratio,
            y: lastPos.y + (pt.y - lastPos.y) * ratio,
          };
        }

        this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
        lastPos = { ...this.pos };

        this.updateCursor(this.pos);
        this.addTrail(this.pos);
        this.drawTrail();
        this.fireMouseEvent('mousemove', this.pos);

        this.frameId = requestAnimationFrame(animate);
      };

      this.frameId = requestAnimationFrame(animate);
    });
  }

  // 选择文本（完全重写，更符合真人行为）
  private async doSelectText(target: Target, startOffset?: number, endOffset?: number): Promise<void> {
    if (!this.isDomValid()) return;

    const el = this.getElement(target);
    if (!el) return;

    // 获取所有文本节点（支持多行）
    const textNodes = this.getAllTextNodes(el);
    if (textNodes.length === 0) return;

    // 计算总文本长度
    let totalLength = 0;
    for (const node of textNodes) {
      totalLength += node.textContent?.length || 0;
    }

    const start = clamp(startOffset ?? 0, 0, totalLength);
    const end = clamp(endOffset ?? totalLength, start, totalLength);

    if (start === end) return;

    // 找到起始和结束的文本节点及偏移
    const startInfo = this.getTextNodeAtOffset(textNodes, start);
    const endInfo = this.getTextNodeAtOffset(textNodes, end);
    if (!startInfo || !endInfo) return;

    // 获取起始位置
    const startRect = this.getTextRectByNode(startInfo.node, startInfo.offset);
    if (!startRect) return;

    const startPoint: Point = {
      x: startRect.left + random(-1, 1),
      y: startRect.top + startRect.height / 2 + random(-1, 1),
    };

    // 第一步：移动到起始位置，完全等待移动完成并验证位置
    await this.moveToPointAndWait(startPoint);

    // 验证鼠标确实到达了起始位置（允许 3 像素误差）
    const distToStart = distance(this.pos, startPoint);
    if (distToStart > 3) {
      // 如果还没到位，强制设置位置并等待
      this.pos = { ...startPoint };
      this.updateCursor(this.pos);
      this.fireMouseEvent('mousemove', this.pos);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 确保 DOM 仍然有效
    if (!this.isDomValid()) return;

    // 获取结束位置
    const endRect = this.getTextRectByNode(endInfo.node, endInfo.offset);
    if (!endRect) return;

    // 是否过头（40%概率）
    const shouldOvershoot = Math.random() > 0.6;
    const overshootAmount = shouldOvershoot ? randomInt(8, 25) : 0;

    // 计算过头点和最终目标点
    const overshootPoint: Point = {
      x: endRect.right + overshootAmount + random(-1, 1),
      y: endRect.top + endRect.height / 2 + random(-1, 1),
    };

    const finalPoint: Point = {
      x: endRect.right + random(-1, 1),
      y: endRect.top + endRect.height / 2 + random(-1, 1),
    };

    const dist = distance(this.pos, shouldOvershoot ? overshootPoint : finalPoint);
    if (dist < 3) {
      // 距离太短，直接完成
      this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);
      this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
      return;
    }

    // 开始选择流程
    this.running = true;
    this.stopped = false;
    this.initVisual();

    // 正确的鼠标事件顺序：先 mousedown
    this.fireMouseEvent('mousedown', this.pos, { button: 0, buttons: 1 });

    // 等待一小段时间，模拟按下鼠标的延迟
    await new Promise(resolve => setTimeout(resolve, randomInt(10, 30)));

    // 计算移动时间（完全平滑，无随机变化）
    const baseMoveDuration = (dist / this.config.moveSpeed) * 1000;
    const moveDuration = baseMoveDuration;
    const returnDuration = shouldOvershoot ? 150 : 0; // 固定返回时间，不随机
    const maxDuration = (moveDuration + returnDuration) * 2 + 1000;

    const startTime = performance.now();
    // 关键修复：使用当前的 this.pos 作为起点
    const startPos = { ...this.pos };
    let lastPos = { ...this.pos };
    let resolved = false;
    let phase: 'forward' | 'return' = 'forward';
    let returnStartTime = 0;
    let totalPauseTime = 0;
    let pauseEndTime = 0;
    let isPaused = false;
    let isFirstFrame = true;

    // 生成路径（带弧度）- 从当前位置开始
    const forwardPath = generateRandomPath(startPos, shouldOvershoot ? overshootPoint : finalPoint, randomInt(5, 8));
    const returnPath = shouldOvershoot ? generateRandomPath(overshootPoint, finalPoint, randomInt(3, 5)) : [];
    // 关键修复：强制 forwardPath 的第一点就是当前的 this.pos
    if (forwardPath.length > 0) {
      forwardPath[0] = { ...this.pos };
    }

    // 随机停顿点（30%概率有1次停顿）
    const pauseProgress = Math.random() > 0.7 ? random(0.3, 0.7) : -1;
    const pauseDuration = pauseProgress > 0 ? randomInt(50, 150) : 0;

    return new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);
          this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
          this.running = false;
          resolve();
        }
      }, maxDuration);

      const animate = (now: number) => {
        if (resolved) return;

        if (this.stopped || !this.isDomValid()) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
            this.running = false;
            resolve();
          }
          return;
        }

        // 第一帧：确保从当前位置开始，不瞬移
        if (isFirstFrame) {
          lastPos = { ...this.pos };
          // 如果当前位置和路径起点不一致，需要平滑过渡
          if (forwardPath.length > 0) {
            const pathStartDist = distance(this.pos, forwardPath[0]);
            if (pathStartDist > 5) {
              const transitionRatio = Math.min(1, 5 / pathStartDist);
              const pathStart = forwardPath[0];
              this.pos = {
                x: this.pos.x + (pathStart.x - this.pos.x) * transitionRatio,
                y: this.pos.y + (pathStart.y - this.pos.y) * transitionRatio,
              };
              lastPos = { ...this.pos };
            }
          }
          isFirstFrame = false;
        }

        // 处理停顿
        if (isPaused && now < pauseEndTime) {
          // 停顿期间保持位置，只更新选择
          this.updateCursor(this.pos);
          this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });
          this.frameId = requestAnimationFrame(animate);
          return;
        }
        if (isPaused && now >= pauseEndTime) {
          isPaused = false;
          totalPauseTime += pauseDuration;
        }

        const elapsed = now - startTime - totalPauseTime;

        if (phase === 'forward') {
          // 检查是否需要开始停顿
          if (pauseProgress > 0 && !isPaused && pauseEndTime === 0) {
            const progress = clamp(elapsed / moveDuration, 0, 1);
            if (progress >= pauseProgress) {
              isPaused = true;
              pauseEndTime = now + pauseDuration;
              this.frameId = requestAnimationFrame(animate);
              return;
            }
          }

          const progress = clamp(elapsed / moveDuration, 0, 1);

          // 使用完全平滑的速度曲线（无任何噪声）
          const velocity = getVelocity(progress, false, 0);
          const actualProgress = velocity;

          if (forwardPath.length >= 2) {
            const pathProgress = actualProgress * (forwardPath.length - 1);
            const pathIdx = clamp(Math.floor(pathProgress), 0, forwardPath.length - 2);
            const pathT = pathProgress - pathIdx;

            const p1 = forwardPath[pathIdx];
            const p2 = forwardPath[pathIdx + 1];

            if (p1 && p2) {
              let pt = {
                x: p1.x + (p2.x - p1.x) * pathT,
                y: p1.y + (p2.y - p1.y) * pathT,
              };

              // 增加最大步长，使移动更平滑
              const maxStep = Math.max(8, dist * 0.12);
              const stepDist = distance(lastPos, pt);
              if (stepDist > maxStep) {
                const ratio = maxStep / stepDist;
                pt = {
                  x: lastPos.x + (pt.x - lastPos.x) * ratio,
                  y: lastPos.y + (pt.y - lastPos.y) * ratio,
                };
              }

              this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
              lastPos = { ...this.pos };
            }
          }

          this.updateCursor(this.pos);
          this.addTrail(this.pos);
          this.drawTrail();

          // 持续触发 mousemove 事件
          this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });

          // 实时更新选择范围（根据实际进度）
          this.updateSelectionProgress(startInfo, endInfo, actualProgress);

          if (progress < 1) {
            this.frameId = requestAnimationFrame(animate);
          } else if (shouldOvershoot) {
            // 进入返回阶段
            phase = 'return';
            returnStartTime = now;
            lastPos = { ...this.pos };
            this.frameId = requestAnimationFrame(animate);
          } else {
            // 完成选择
            this.pos = { ...finalPoint };
            this.updateCursor(this.pos);
            this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });
            this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);
            this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              this.running = false;
              resolve();
            }
          }
        } else {
          // 返回阶段（过头后回撤）
          const returnElapsed = now - returnStartTime;
          const returnProgress = clamp(returnElapsed / returnDuration, 0, 1);

          // 使用减速曲线
          const easedReturn = 1 - Math.pow(1 - returnProgress, 2.5);

          if (returnPath.length >= 2) {
            const pathProgress = easedReturn * (returnPath.length - 1);
            const pathIdx = clamp(Math.floor(pathProgress), 0, returnPath.length - 2);
            const pathT = pathProgress - pathIdx;

            const p1 = returnPath[pathIdx];
            const p2 = returnPath[pathIdx + 1];

            if (p1 && p2) {
              let pt = {
                x: p1.x + (p2.x - p1.x) * pathT,
                y: p1.y + (p2.y - p1.y) * pathT,
              };

              // 增加最大步长，使返回更平滑
              const returnDist = distance(overshootPoint, finalPoint);
              const maxStep = Math.max(6, returnDist * 0.1);
              const stepDist = distance(lastPos, pt);
              if (stepDist > maxStep) {
                const ratio = maxStep / stepDist;
                pt = {
                  x: lastPos.x + (pt.x - lastPos.x) * ratio,
                  y: lastPos.y + (pt.y - lastPos.y) * ratio,
                };
              }

              this.pos = { x: Math.round(pt.x), y: Math.round(pt.y) };
              lastPos = { ...this.pos };
            }
          }

          this.updateCursor(this.pos);
          this.addTrail(this.pos);
          this.drawTrail();
          this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });

          // 更新选择范围（回撤时选择范围不变，只是鼠标位置变化）
          this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);

          if (returnProgress < 1) {
            this.frameId = requestAnimationFrame(animate);
          } else {
            // 返回完成
            this.pos = { ...finalPoint };
            this.updateCursor(this.pos);
            this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });
            this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);
            this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              this.running = false;
              resolve();
            }
          }
        }
      };

      this.frameId = requestAnimationFrame(animate);
    });
  }

  // 获取所有文本节点
  private getAllTextNodes(el: Element): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.textContent && node.textContent.length > 0) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  // 根据偏移找到对应的文本节点
  private getTextNodeAtOffset(nodes: Text[], offset: number): { node: Text; offset: number } | null {
    let currentOffset = 0;
    for (const node of nodes) {
      const len = node.textContent?.length || 0;
      if (currentOffset + len >= offset) {
        return { node, offset: offset - currentOffset };
      }
      currentOffset += len;
    }
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      return { node: lastNode, offset: lastNode.textContent?.length || 0 };
    }
    return null;
  }

  // 根据文本节点和偏移获取位置
  private getTextRectByNode(node: Text, offset: number): DOMRect {
    try {
      const range = document.createRange();
      const safeOffset = clamp(offset, 0, node.textContent?.length || 0);
      range.setStart(node, safeOffset);
      range.setEnd(node, Math.min(safeOffset + 1, node.textContent?.length || 0));
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return rect;
    } catch (e) { /* ignore */ }

    // 回退到父元素
    const parent = node.parentElement;
    if (parent) return parent.getBoundingClientRect();
    return new DOMRect(0, 0, 0, 0);
  }

  // 设置选择范围
  private setSelection(startNode: Text, startOffset: number, endNode: Text, endOffset: number): void {
    try {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStart(startNode, clamp(startOffset, 0, startNode.textContent?.length || 0));
        range.setEnd(endNode, clamp(endOffset, 0, endNode.textContent?.length || 0));
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (e) { /* ignore */ }
  }

  // 更新选择进度
  private updateSelectionProgress(
    startInfo: { node: Text; offset: number },
    endInfo: { node: Text; offset: number },
    progress: number
  ): void {
    try {
      const selection = window.getSelection();
      if (!selection) return;

      // 简单线性插值
      if (startInfo.node === endInfo.node) {
        const currentEnd = Math.floor(startInfo.offset + (endInfo.offset - startInfo.offset) * progress);
        const range = document.createRange();
        range.setStart(startInfo.node, startInfo.offset);
        range.setEnd(startInfo.node, clamp(currentEnd, startInfo.offset, endInfo.offset));
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // 多节点选择 - 直接设置到当前进度对应的位置
        this.setSelection(startInfo.node, startInfo.offset, endInfo.node, Math.floor(endInfo.offset * progress));
      }
    } catch (e) { /* ignore */ }
  }

  // 完成选择
  private finishSelection(
    startInfo: { node: Text; offset: number },
    endInfo: { node: Text; offset: number },
    finalPoint: Point,
    timeoutId: ReturnType<typeof setTimeout>,
    resolved: boolean,
    resolve: () => void
  ): void {
    if (resolved) return;

    clearTimeout(timeoutId);

    this.pos = { ...finalPoint };
    this.updateCursor(this.pos);
    this.fireMouseEvent('mousemove', this.pos, { button: 0, buttons: 1 });

    // 设置最终选择
    this.setSelection(startInfo.node, startInfo.offset, endInfo.node, endInfo.offset);

    // 释放鼠标
    this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
    this.running = false;
    resolve();
  }


  // ==================== 日志 ====================

  private printLog(type: ActionType, args: any[]): void {
    if (!this.logEnabled) return;
    if (this.logFilter && !this.logFilter(type, args)) return;

    const message = this.logFormatter
      ? this.logFormatter(type, args)
      : this.formatLogMessage(type, args);

    console.log(`${this.logPrefix} ${message}`);
  }

  private formatLogMessage(type: ActionType, args: any[]): string {
    const formatTarget = (t: any): string => {
      if (!t) return '';
      if (typeof t === 'string') return `"${t}"`;
      if (t instanceof HTMLElement) return `<${t.tagName.toLowerCase()}${t.id ? '#' + t.id : ''}${t.className ? '.' + t.className.split(' ').join('.') : ''}>`;
      if (typeof t === 'object' && 'x' in t && 'y' in t) return `(${t.x}, ${t.y})`;
      return String(t);
    };

    switch (type) {
      case 'move': return `移动到 ${formatTarget(args[0])}${args[1] ? ` (${args[1]}ms)` : ''}`;
      case 'click': return `点击${args[0] ? ' ' + formatTarget(args[0]) : ''}${args[1] > 1 ? ` x${args[1]}` : ''}`;
      case 'doubleClick': return `双击${args[0] ? ' ' + formatTarget(args[0]) : ''}`;
      case 'rightClick': return `右键${args[0] ? ' ' + formatTarget(args[0]) : ''}`;
      case 'hover': return `悬停 ${formatTarget(args[0])}${args[1] ? ` (${args[1]}ms)` : ''}`;
      case 'drag': return `拖拽 ${formatTarget(args[0])} → ${formatTarget(args[1])}`;
      case 'scroll': return `滚动 (${args[0]}, ${args[1]})`;
      case 'scrollTo': return `滚动到 ${formatTarget(args[0])}`;
      case 'input': return `输入 "${args[1]?.substring(0, 20)}${args[1]?.length > 20 ? '...' : ''}" → ${formatTarget(args[0])}`;
      case 'fill': return `填充 "${args[1]}" → ${formatTarget(args[0])}`;
      case 'clear': return `清空 ${formatTarget(args[0])}`;
      case 'press': return `按键 [${args[0]}]`;
      case 'keyDown': return `按下 [${args[0]}]`;
      case 'keyUp': return `松开 [${args[0]}]`;
      case 'combo': return `组合键 [${(args[0] as string[]).join('+')}]`;
      case 'focus': return `聚焦 ${formatTarget(args[0])}`;
      case 'blur': return `失焦${args[0] ? ' ' + formatTarget(args[0]) : ''}`;
      case 'check': return `勾选 ${formatTarget(args[0])}`;
      case 'uncheck': return `取消勾选 ${formatTarget(args[0])}`;
      case 'select': return `选择 ${formatTarget(args[0])} → "${args[1]}"`;
      case 'autoPoint': return `自动移动 ${args[0]}ms`;
      case 'selectText': return `选择文本 ${formatTarget(args[0])}${args[1] !== undefined ? ` [${args[1]}:${args[2]}]` : ''}`;
      case 'wait': return `等待 ${args[0]}ms`;
      case 'waitElement': return `等待元素 "${args[0]}"`;
      case 'waitHidden': return `等待隐藏 "${args[0]}"`;
      case 'waitText': return `等待文本 "${args[0]}"`;
      case 'waitFor': return `等待条件`;
      case 'eval': return `执行函数`;
      case 'log': return args[0];
      default: return `${type} ${args.map(formatTarget).join(', ')}`;
    }
  }

  // ==================== 执行器 ====================

  private async execute(action: Action): Promise<any> {
    const { type, args } = action;

    // 打印日志
    this.printLog(type, args);

    switch (type) {
      // 鼠标
      case 'move': {
        const [target, duration] = args;
        const pt = this.getPoint(target);
        if (pt) await this.doMove(pt, duration);
        break;
      }
      case 'click': {
        const [target, count = 1] = args;
        if (target) {
          const pt = this.getPoint(target);
          if (pt) await this.doMove(pt);
        }

        if (!this.isDomValid()) break;

        try {
          const targetEl = document.elementFromPoint(this.pos.x, this.pos.y);
          if (!targetEl) break;

          for (let i = 0; i < count; i++) {
            if (!this.isDomValid()) break;

            this.fireMouseEvent('mousedown', this.pos, { button: 0, buttons: 1 });
            await sleep(randomInt(30, 60));
            this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });

            if (targetEl instanceof HTMLElement) {
              targetEl.click();
            }

            if (targetEl instanceof HTMLInputElement || targetEl instanceof HTMLTextAreaElement) {
              targetEl.focus();
            }

            if (i < count - 1) await sleep(randomInt(60, 100));
          }
        } catch (e) {
          console.warn('[Automation] click error:', e);
        }
        break;
      }
      case 'doubleClick': {
        const [target] = args;
        await this.execute({ type: 'click', args: [target, 2] });
        break;
      }
      case 'rightClick': {
        const [target] = args;
        if (target) {
          const pt = this.getPoint(target);
          if (pt) await this.doMove(pt);
        }
        this.fireMouseEvent('mousedown', this.pos, { button: 2, buttons: 2 });
        await sleep(randomInt(40, 80));
        this.fireMouseEvent('mouseup', this.pos, { button: 2, buttons: 0 });
        this.fireMouseEvent('contextmenu', this.pos, { button: 2 });
        break;
      }
      case 'hover': {
        const [target, duration = 1000] = args;
        const pt = this.getPoint(target);
        if (!pt) break;
        await this.doMove(pt);
        const start = performance.now();
        while (performance.now() - start < duration && !this.stopped) {
          await sleep(randomInt(100, 300));
          await this.doMove(addJitter(pt, 2), 200);
        }
        break;
      }
      case 'drag': {
        const [from, to, duration] = args;
        const fromPt = this.getPoint(from);
        const toPt = this.getPoint(to);
        if (!fromPt || !toPt) break;
        await this.doMove(fromPt);
        this.fireMouseEvent('mousedown', this.pos, { button: 0, buttons: 1 });
        await sleep(randomInt(30, 60));
        await this.doMove(toPt, duration);
        this.fireMouseEvent('mouseup', this.pos, { button: 0, buttons: 0 });
        break;
      }
      case 'scroll': {
        // 支持相对滚动：scroll(deltaY, target?)
        // deltaY: 正数向下，负数向上
        // target: 可选，指定元素，默认是 html
        const [deltaY, target] = args;
        const scrollElement = target ? this.getElement(target) : (document.documentElement || document.body);
        
        if (!scrollElement) break;
        
        // 获取当前滚动位置
        const currentScrollTop = scrollElement.scrollTop;
        const currentScrollLeft = scrollElement.scrollLeft;
        
        // 计算目标滚动位置（相对当前位置）
        const targetScrollTop = currentScrollTop + deltaY;
        
        // 模拟真人滚动：使用平滑动画
        await this.doScroll(scrollElement, currentScrollTop, targetScrollTop, currentScrollLeft);
        break;
      }
      case 'scrollTo': {
        // 支持 window.scrollTo 的两种调用方式：
        // 1. scrollTo(x, y) - 滚动到指定坐标
        // 2. scrollTo({ top: y, left: x, behavior: 'smooth' }) - 使用配置对象
        // 3. scrollTo(target, block?) - 滚动到元素（兼容旧接口）
        if (args.length === 0) break;
        
        const firstArg = args[0];
        
        // 如果是数字，使用坐标方式
        if (typeof firstArg === 'number') {
          const [x, y, behavior = 'smooth'] = args;
          if (typeof window !== 'undefined' && window.scrollTo) {
            window.scrollTo({
              left: x,
              top: y,
              behavior: behavior as ScrollBehavior,
            });
          }
        }
        // 如果是对象，直接传递给 window.scrollTo
        else if (firstArg && typeof firstArg === 'object' && ('top' in firstArg || 'left' in firstArg)) {
          if (typeof window !== 'undefined' && window.scrollTo) {
            window.scrollTo({
              top: firstArg.top ?? window.scrollY,
              left: firstArg.left ?? window.scrollX,
              behavior: firstArg.behavior ?? 'smooth',
            });
          }
        }
        // 否则当作元素选择器处理（兼容旧接口）
        else {
          const [target, block = 'center'] = args;
          const el = this.getElement(target);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block });
          }
        }
        break;
      }

      // 输入
      case 'input': {
        const [target, text, clearFirst = false, delay] = args;
        const el = this.getElement(target);
        if (!el || !this.isDomValid()) break;

        try {
          // focus
          if (document.activeElement !== el) {
            if (document.activeElement) {
              this.fireFocusEvent('blur', document.activeElement);
              this.fireFocusEvent('focusout', document.activeElement);
            }
            el.focus?.();
            this.fireFocusEvent('focus', el);
            this.fireFocusEvent('focusin', el);
          }
          await sleep(randomInt(50, 100));

          const inputEl = el as HTMLInputElement;
          if (clearFirst) {
            if ('value' in el) inputEl.value = '';
            else if (el.isContentEditable) el.textContent = '';
            this.fireInputEvent(el);
          }

          const inputDelay = delay ?? this.config.inputDelay;
          for (const char of text) {
            // 每次循环检查 DOM 有效性
            if (!this.isDomValid() || !document.body.contains(el)) {
              console.warn('[Automation] DOM 已失效，停止输入');
              break;
            }
            this.fireKeyEvent('keydown', char, el);
            this.fireKeyEvent('keypress', char, el);
            if ('value' in el) inputEl.value += char;
            else if (el.isContentEditable) el.textContent = (el.textContent || '') + char;
            this.fireInputEvent(el, char);
            this.fireKeyEvent('keyup', char, el);
            await sleep(inputDelay + random(-inputDelay * 0.3, inputDelay * 0.3));
          }
        } catch (e) {
          console.warn('[Automation] input error:', e);
        }
        break;
      }
      case 'fill': {
        const [target, value] = args;
        const el = this.getElement(target);
        if (!el) break;
        el.focus?.();
        this.fireFocusEvent('focus', el);
        await sleep(randomInt(30, 60));
        if ('value' in el) (el as HTMLInputElement).value = value;
        else if (el.isContentEditable) el.textContent = value;
        this.fireInputEvent(el, value);
        break;
      }
      case 'clear': {
        const [target] = args;
        const el = this.getElement(target);
        if (!el) break;
        el.focus?.();
        if ('value' in el) (el as HTMLInputElement).value = '';
        else if (el.isContentEditable) el.textContent = '';
        this.fireInputEvent(el);
        break;
      }
      case 'press': {
        const [key, target] = args;
        const el = target ? this.getElement(target) : document.activeElement || document.body;
        if (!el) break;
        const mods: Partial<KeyboardEventInit> = {};
        if (key.includes('Ctrl')) mods.ctrlKey = true;
        if (key.includes('Alt')) mods.altKey = true;
        if (key.includes('Shift')) mods.shiftKey = true;
        if (key.includes('Meta')) mods.metaKey = true;
        const actualKey = key.replace(/Ctrl|Alt|Shift|Meta|\+/g, '').trim() || key;
        this.fireKeyEvent('keydown', actualKey, el, mods);
        await sleep(randomInt(30, 80));
        this.fireKeyEvent('keyup', actualKey, el, mods);
        if (actualKey === 'Enter' && el instanceof HTMLInputElement) {
          el.closest('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        break;
      }
      case 'keyDown': {
        const [key, target] = args;
        const el = target ? this.getElement(target) : document.activeElement || document.body;
        if (el) this.fireKeyEvent('keydown', key, el);
        break;
      }
      case 'keyUp': {
        const [key, target] = args;
        const el = target ? this.getElement(target) : document.activeElement || document.body;
        if (el) this.fireKeyEvent('keyup', key, el);
        break;
      }
      case 'combo': {
        const [keys, target] = args as [string[], Target?];
        const el = target ? this.getElement(target) : document.activeElement || document.body;
        if (!el) break;
        const mods: Partial<KeyboardEventInit> = {};
        for (const k of keys) {
          if (k === 'Ctrl' || k === 'Control') mods.ctrlKey = true;
          if (k === 'Alt') mods.altKey = true;
          if (k === 'Shift') mods.shiftKey = true;
          if (k === 'Meta' || k === 'Cmd') mods.metaKey = true;
        }
        const mainKey = keys[keys.length - 1];
        this.fireKeyEvent('keydown', mainKey, el, mods);
        await sleep(randomInt(50, 100));
        this.fireKeyEvent('keyup', mainKey, el, mods);
        break;
      }

      // 元素操作
      case 'focus': {
        const [target] = args;
        const el = this.getElement(target);
        if (!el) break;
        if (document.activeElement && document.activeElement !== el) {
          this.fireFocusEvent('blur', document.activeElement);
          this.fireFocusEvent('focusout', document.activeElement);
        }
        (el as HTMLElement).focus?.();
        this.fireFocusEvent('focus', el);
        this.fireFocusEvent('focusin', el);
        break;
      }
      case 'blur': {
        const [target] = args;
        const el = target ? this.getElement(target) : document.activeElement;
        if (!el) break;
        (el as HTMLElement).blur?.();
        this.fireFocusEvent('blur', el);
        this.fireFocusEvent('focusout', el);
        break;
      }
      case 'check': {
        const [target] = args;
        const el = this.getElement(target) as HTMLInputElement;
        if (el && !el.checked) {
          await this.execute({ type: 'click', args: [target] });
        }
        break;
      }
      case 'uncheck': {
        const [target] = args;
        const el = this.getElement(target) as HTMLInputElement;
        if (el && el.checked && el.type === 'checkbox') {
          await this.execute({ type: 'click', args: [target] });
        }
        break;
      }
      case 'select': {
        const [target, value] = args;
        const el = this.getElement(target) as HTMLSelectElement;
        if (!el || el.tagName !== 'SELECT') break;
        await this.execute({ type: 'click', args: [target] });
        await sleep(randomInt(100, 200));
        const vals = Array.isArray(value) ? value : [value];
        for (const opt of el.options) {
          opt.selected = vals.includes(opt.value) || vals.includes(opt.text);
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      case 'autoPoint': {
        const [duration] = args as [number];
        await this.doAutoPoint(duration);
        break;
      }
      case 'selectText': {
        const [target, startOffset, endOffset] = args as [Target, number?, number?];
        await this.doSelectText(target, startOffset, endOffset);
        break;
      }

      // 等待
      case 'wait': {
        const [ms] = args;
        await sleep(ms);
        break;
      }
      case 'waitElement': {
        const [selector, timeout = 10000] = args;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if (document.querySelector(selector)) break;
          await sleep(100);
        }
        break;
      }
      case 'waitHidden': {
        const [selector, timeout = 10000] = args;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const el = document.querySelector(selector);
          if (!el) break;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') break;
          await sleep(100);
        }
        break;
      }
      case 'waitText': {
        const [text, selector, timeout = 10000] = args;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const container = selector ? document.querySelector(selector) : document.body;
          if (container?.textContent?.includes(text)) break;
          await sleep(100);
        }
        break;
      }
      case 'waitFor': {
        const [fn, timeout = 10000] = args as [() => boolean | Promise<boolean>, number];
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if (await fn()) break;
          await sleep(100);
        }
        break;
      }

      // 其他
      case 'eval': {
        const [fn] = args as [() => any];
        return fn();
      }
      case 'log': {
        const [msg] = args;
        console.log('[Automation]', msg);
        break;
      }
    }
  }

  // ==================== 链式 API ====================

  /** 移动到目标 */
  move(target: Target, duration?: number): this {
    this.queue.push({ type: 'move', args: [target, duration] });
    return this;
  }

  /** 点击 */
  click(target?: Target, count: number = 1): this {
    this.queue.push({ type: 'click', args: [target, count] });
    return this;
  }

  /** 双击 */
  doubleClick(target?: Target): this {
    this.queue.push({ type: 'doubleClick', args: [target] });
    return this;
  }

  /** 右键 */
  rightClick(target?: Target): this {
    this.queue.push({ type: 'rightClick', args: [target] });
    return this;
  }

  /** 悬停 */
  hover(target: Target, duration?: number): this {
    this.queue.push({ type: 'hover', args: [target, duration] });
    return this;
  }

  /** 拖拽 */
  drag(from: Target, to: Target, duration?: number): this {
    this.queue.push({ type: 'drag', args: [from, to, duration] });
    return this;
  }

  /** 滚动 */
  scroll(deltaX: number, deltaY: number): this {
    this.queue.push({ type: 'scroll', args: [deltaX, deltaY] });
    return this;
  }

  /** 滚动到元素 */
  scrollTo(target: Target, block?: ScrollLogicalPosition): this {
    this.queue.push({ type: 'scrollTo', args: [target, block] });
    return this;
  }

  /** 输入文本（模拟逐字打字） */
  input(target: Target, text: string, clear: boolean = false, delay?: number): this {
    this.queue.push({ type: 'input', args: [target, text, clear, delay] });
    return this;
  }

  /** 直接填充值（不模拟打字） */
  fill(target: Target, value: string): this {
    this.queue.push({ type: 'fill', args: [target, value] });
    return this;
  }

  /** 清空输入框 */
  clear(target: Target): this {
    this.queue.push({ type: 'clear', args: [target] });
    return this;
  }

  /** 按键 */
  press(key: string, target?: Target): this {
    this.queue.push({ type: 'press', args: [key, target] });
    return this;
  }

  /** 按住按键 */
  keyDown(key: string, target?: Target): this {
    this.queue.push({ type: 'keyDown', args: [key, target] });
    return this;
  }

  /** 松开按键 */
  keyUp(key: string, target?: Target): this {
    this.queue.push({ type: 'keyUp', args: [key, target] });
    return this;
  }

  /** 组合键 */
  combo(keys: string[], target?: Target): this {
    this.queue.push({ type: 'combo', args: [keys, target] });
    return this;
  }

  /** 聚焦 */
  focus(target: Target): this {
    this.queue.push({ type: 'focus', args: [target] });
    return this;
  }

  /** 失焦 */
  blur(target?: Target): this {
    this.queue.push({ type: 'blur', args: [target] });
    return this;
  }

  /** 勾选 */
  check(target: Target): this {
    this.queue.push({ type: 'check', args: [target] });
    return this;
  }

  /** 取消勾选 */
  uncheck(target: Target): this {
    this.queue.push({ type: 'uncheck', args: [target] });
    return this;
  }

  /** 选择下拉选项 */
  select(target: Target, value: string | string[]): this {
    this.queue.push({ type: 'select', args: [target, value] });
    return this;
  }

  /** 自动无规则移动指定时间 */
  autoPoint(duration: number): this {
    this.queue.push({ type: 'autoPoint', args: [duration] });
    return this;
  }

  /** 选择文本（模拟真人选择） */
  selectText(target: Target, startOffset?: number, endOffset?: number): this {
    this.queue.push({ type: 'selectText', args: [target, startOffset, endOffset] });
    return this;
  }

  /** 等待时间 */
  wait(ms: number): this {
    this.queue.push({ type: 'wait', args: [ms] });
    return this;
  }

  /** 等待元素出现 */
  waitElement(selector: string, timeout?: number): this {
    this.queue.push({ type: 'waitElement', args: [selector, timeout] });
    return this;
  }

  /** 等待元素隐藏 */
  waitHidden(selector: string, timeout?: number): this {
    this.queue.push({ type: 'waitHidden', args: [selector, timeout] });
    return this;
  }

  /** 等待文本出现 */
  waitText(text: string, selector?: string, timeout?: number): this {
    this.queue.push({ type: 'waitText', args: [text, selector, timeout] });
    return this;
  }

  /** 等待条件满足 */
  waitFor(condition: () => boolean | Promise<boolean>, timeout?: number): this {
    this.queue.push({ type: 'waitFor', args: [condition, timeout] });
    return this;
  }

  /** 执行自定义函数 */
  eval<T>(fn: () => T): this {
    this.queue.push({ type: 'eval', args: [fn] });
    return this;
  }

  /** 打印日志 */
  log(message: string): this {
    this.queue.push({ type: 'log', args: [message] });
    return this;
  }

  // ==================== 执行控制 ====================

  /** 执行队列中所有操作 */
  async run(): Promise<this> {
    const actions = [...this.queue];
    this.queue = [];

    for (const action of actions) {
      if (this.stopped) break;
      await this.execute(action);
    }

    return this;
  }

  /** 停止执行 */
  stop(): this {
    this.stopped = true;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    return this;
  }

  /** 清空队列 */
  reset(): this {
    this.queue = [];
    return this;
  }

  /** 设置初始位置 */
  setPosition(point: Point): this {
    this.pos = { ...point };
    this.initVisual();
    this.updateCursor(this.pos);
    this.trails = [];
    this.addTrail(this.pos);
    this.drawTrail();
    return this;
  }

  /** 销毁 */
  destroy(): void {
    this.stop();

    // 清理轨迹点
    this.trailDots.forEach(dot => {
      if (dot && dot.parentNode) {
        dot.parentNode.removeChild(dot);
      }
    });
    this.trailDots = [];

    // 清理容器
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    // 清理样式
    const style = document.getElementById('web-auto-trail-style');
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }

    this.container = null;
    this.cursor = null;
    this.trailContainer = null;
    this.trails = [];
  }

  // ==================== 日志控制 ====================

  /** 启用日志 */
  enableLogging(enable: boolean = true): this {
    this.logEnabled = enable;
    return this;
  }

  /** 禁用日志 */
  disableLogging(): this {
    this.logEnabled = false;
    return this;
  }

  /** 设置日志过滤器 */
  setLogFilter(filter: LogFilter | null): this {
    this.logFilter = filter;
    return this;
  }

  /** 设置日志格式化函数 */
  setLogFormatter(formatter: LogFormatter | null): this {
    this.logFormatter = formatter;
    return this;
  }

  /** 设置日志前缀 */
  setLogPrefix(prefix: string): this {
    this.logPrefix = prefix;
    return this;
  }

  /** 只记录指定类型的操作 */
  logOnly(...types: ActionType[]): this {
    this.logFilter = (type) => types.includes(type);
    return this;
  }

  /** 排除指定类型的操作 */
  logExclude(...types: ActionType[]): this {
    this.logFilter = (type) => !types.includes(type);
    return this;
  }

  // ==================== 状态获取（同步） ====================

  /** 当前鼠标位置 */
  get position(): Point {
    return { ...this.pos };
  }

  /** 是否正在执行 */
  get isRunning(): boolean {
    return this.running;
  }

  /** 获取元素 */
  $(selector: string): HTMLElement | null {
    return document.querySelector(selector);
  }

  /** 获取多个元素 */
  $$(selector: string): HTMLElement[] {
    return Array.from(document.querySelectorAll(selector));
  }

  /** 获取元素文本 */
  getText(target: Target): string {
    return this.getElement(target)?.textContent?.trim() || '';
  }

  /** 获取输入值 */
  getValue(target: Target): string {
    return (this.getElement(target) as HTMLInputElement)?.value || '';
  }

  /** 获取属性 */
  getAttr(target: Target, attr: string): string | null {
    return this.getElement(target)?.getAttribute(attr) || null;
  }

  /** 元素是否可见 */
  isVisible(target: Target): boolean {
    const el = this.getElement(target);
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
  }

  /** 元素是否存在 */
  exists(selector: string): boolean {
    return !!document.querySelector(selector);
  }

  /** 是否选中 */
  isChecked(target: Target): boolean {
    return (this.getElement(target) as HTMLInputElement)?.checked || false;
  }
}

// ==================== 工厂函数 ====================

let instance: WebAutomation | null = null;

/** 获取单例 */
export function useAutomation(config?: AutomationConfig): WebAutomation {
  if (!instance) instance = new WebAutomation(config);
  return instance;
}

/** 创建新实例 */
export function createAutomation(config?: AutomationConfig): WebAutomation {
  return new WebAutomation(config);
}
