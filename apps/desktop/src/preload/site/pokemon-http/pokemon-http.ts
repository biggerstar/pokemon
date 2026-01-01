import { LoginClient } from './http/LoginClient';
import { TaskManager } from '@/preload/site/pokemon-http/common/task-manager';
import { sleep } from '@/utils/time';

window.close = function () {
  console.log('trigger close');
};

const MAX_TRY_COUNT = 4;
let addToCartTryCount = 0;
let loginTryCount = 0;
let isAddToCartSuccess = false;

/**
 * 添加购物车（封装函数，可在登录前或登录后调用）
 */
async function addToCart(loginClient: LoginClient): Promise<boolean> {
  try {
    // 重置计数器（每次调用时重置）
    addToCartTryCount = 0;

    // 从购物车移除历史产品
    await loginClient.removeHistoryProducts();
    await sleep(1000);

    // 添加购物车
    for (let i = 0; i < MAX_TRY_COUNT; i++) {
      const result = await loginClient.addToCart();
      if (!result) {
        addToCartTryCount++;
        continue;
      }
      // 添加成功
      isAddToCartSuccess = true;
      return true;
    }

    // 多次尝试都失败
    if (addToCartTryCount >= MAX_TRY_COUNT) {
      await TaskManager.errorComplete(
        '[添加到购物车] 多次尝试确认添加购物车失败',
      );
      return false;
    }

    return false;
  } catch (error) {
    console.error('[添加到购物车] 发生错误:', error);
    return false;
  }
}

export async function usePokemonHttp(): Promise<void> {
  console.log('加载了PokemonHttp接口');
  console.log('当前URL:', location.href);

  // await TaskManager.error('测试任务超时');
  await TaskManager.errorComplete('测试任务成功');

  for (let i = 0; i < 10; i++) {
    await TaskManager.fetchTask();
    const fetchedTask = TaskManager.get();
    if (fetchedTask) continue;
    await sleep(2000);
  }

  const task = TaskManager.get();
  if (!task) {
    await TaskManager.error('[登录] 无法获取任务');
    return null;
  }
  await TaskManager.updateStatus('[登录] 任务获取成功');
  const loginClient = new LoginClient();
  console.info('🚀 ~ usePokemonHttp ~ loginClient:', loginClient);

  // 获取任务配置，确定添加购物车的时机
  const addToCartTiming = task?.data?.addToCartTiming;
  console.info('添加购物车时机: ', addToCartTiming);

  // 根据配置决定是否在登录前添加购物车
  if (addToCartTiming === 'beforeLogin') {
    if (!isAddToCartSuccess) {
      await TaskManager.updateStatus('[添加到购物车] 开始添加购物车（登录前）');
      const success = await addToCart(loginClient);
      if (!success) {
        await TaskManager.error('[添加到购物车] 添加到购物车失败');
        return null;
      }
      await TaskManager.updateStatus('[添加到购物车] 添加购物车成功（登录前）');
    }
  }

  const loginInfo = await loginClient.getAccountInfo();
  if (!loginInfo) {
    await TaskManager.updateStatus('[登录] 开始登录流程');
    const isLoginSuccess = await loginClient.login();
    if (!isLoginSuccess) {
      loginTryCount++;
      if (loginTryCount <= MAX_TRY_COUNT) {
        setTimeout(() => usePokemonHttp(), 2000);
        return;
      } else {
        // 登录失败，算作重试
        await TaskManager.errorComplete();
        return;
      }
    }
    await TaskManager.updateStatus('[登录] 登录成功');
  } else {
    await TaskManager.updateStatus('[登录] 已登录，跳过登录流程');
  }

  // 根据配置决定是否在登录后添加购物车
  if (addToCartTiming === 'afterLogin') {
    if (!isAddToCartSuccess) {
      await TaskManager.updateStatus('[添加到购物车] 开始添加购物车（登录后）');
      const success = await addToCart(loginClient);
      if (!success) {
        await TaskManager.error('[添加到购物车] 添加到购物车失败');
        return null;
      }
      await TaskManager.updateStatus('[添加到购物车] 添加购物车成功（登录后）');
    }
  }

  await loginClient.getAccountInfo();
  await loginClient.processOrder();
  console.log('等待跳转下单页面...');
}
