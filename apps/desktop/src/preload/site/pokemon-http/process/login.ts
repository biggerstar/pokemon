import { querySelector } from '@/preload/common/dom';
import { createAutomation } from '@/preload/common/web-automation';
import { TaskManager } from '../common/task-manager';
import { sleep } from '@/utils/time';

/**
 * 执行登录流程
 */
export async function processLogin() {
  // const spAccountImgEl = document.querySelector('#spAccountImg') as HTMLElement;
  // if (spAccountImgEl) {
  //   spAccountImgEl.click()
  //   return null;
  // }

  const automation = createAutomation();
  automation.enableLogging();

  // window.addEventListener('mousemove', (ev) => {
  //   console.log('mousemove', ev)
  // })
  // window.addEventListener('click', (ev) => {
  //   console.log('click', ev)
  // })
  try {
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
    const { loginId, loginPass } = task.data;

    if (!loginId || !loginPass) {
      await TaskManager.error('[登录] 账号信息不完整');
      return null;
    }

    // 设置初始位置
    automation.setPosition({
      x: window.innerWidth - Math.floor(Math.random() * 1000),
      y: Math.floor(Math.random() * 800),
    });

    await TaskManager.updateStatus('[登录] 选择文本中...');
    const textEl = querySelector('.text') as HTMLElement;
    if (!textEl) {
      await TaskManager.error('[登录] 找不到文本元素 .text');
      return null;
    }
    await automation
      .autoPoint(5000)
      .move(textEl, 1200)
      .wait(600)
      .selectText(textEl, 0, 16)
      .wait(600)
      .eval(() => {
        window.scrollTo({ top: 80, behavior: 'smooth' });
      })
      .wait(1000)
      .move(textEl, 1200)
      .click(textEl)
      .autoPoint(1000)
      .run();

    // 1. 输入用户名
    await TaskManager.updateStatus('[登录] 输入用户名中...');
    const usernameEl = querySelector('#login-form-email') as HTMLInputElement;
    if (!usernameEl) {
      await TaskManager.error('[登录] 找不到用户名输入框');
      return null;
    }
    await automation
      .move(usernameEl, 600)
      .wait(200)
      .wait(300)
      .click()
      .wait(300)
      .input(usernameEl, loginId, true)
      .wait(500)
      .run();

    // 2. 输入密码
    await TaskManager.updateStatus('[登录] 输入密码中...');
    const passwordEl = querySelector('#current-password') as HTMLInputElement;
    if (!passwordEl) {
      await TaskManager.error('[登录] 找不到密码输入框');
      return null;
    }
    await automation
      .move(passwordEl, 300)
      .wait(100)
      .click()
      .wait(300)
      .input(passwordEl, loginPass, true)
      .wait(500)
      .run();

    // 3. 点击登录按钮
    await TaskManager.updateStatus('[登录] 点击登录按钮...');
    const form1ButtonEl = querySelector('#form1Button');
    if (!form1ButtonEl) {
      await TaskManager.error('[登录] 找不到登录按钮');
      return null;
    }
    await automation
      .move(form1ButtonEl, 680)
      .wait(300)
      .click()
      .move(passwordEl, 300)
      .run();

    await TaskManager.updateStatus('[登录] 登录流程完成，等待页面跳转');
  } catch (error) {
    await TaskManager.error(
      `[登录] 登录流程出错: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  setInterval(() => {
    if (document.body?.textContent.includes('reCAPTCHAの認証')) {
      location.reload();
    }
  }, 3000);
}
