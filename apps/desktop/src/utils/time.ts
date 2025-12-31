
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建一个带倒计时提示的超时定时器
 * @param timeoutMs 超时时间（毫秒）
 * @param callback 超时后的回调函数
 * @param intervalMs 打印倒计时的间隔时间（毫秒），默认30秒
 * @returns 返回一个清理函数，可以取消定时器
 */
export function createTimeoutWithCountdown(
  timeoutMs: number,
  callback: () => void | Promise<void>,
  intervalMs: number = 30 * 1000,
): () => void {
  const startTime = Date.now();
  let timeoutId: NodeJS.Timeout | null = null;
  let intervalId: NodeJS.Timeout | null = null;

  // 格式化剩余时间
  const formatRemainingTime = (remainingMs: number): string => {
    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}分${seconds}秒`;
  };

  // 打印剩余时间
  const printRemainingTime = () => {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    
    if (remaining > 0) {
      const formatted = formatRemainingTime(remaining);
      console.log(`[超时倒计时] 剩余时间: ${formatted}`);
    }
  };

  // 设置超时回调
  timeoutId = setTimeout(async () => {
    // 清理定时器
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // 执行回调
    await callback();
  }, timeoutMs);

  // 设置定期打印
  intervalId = setInterval(() => {
    printRemainingTime();
  }, intervalMs);

  // 立即打印一次
  printRemainingTime();

  // 返回清理函数
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function toChineseTime(time?: Date | number){
  if (!time) time = Date.now()
  const curZhHansTime = new Date(time)
  curZhHansTime.setHours(curZhHansTime.getHours() + 8)
  return curZhHansTime
}

export function formatConmonTime(time: number | Date){
  return new Date(time).toISOString().replace('T', ' ').replace(/\..+/, '')
}
