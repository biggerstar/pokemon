import { createAutomation } from "@/preload/common/web-automation";
import { querySelector } from "@/preload/common/dom";
import { TaskManager } from "./common/task-manager";
import { ipcRenderer } from 'electron';

export async function processOrderPlaceOrder() {
    // 检查开发模式配置，确保能正确获取配置信息
    let isDevelopmentMode = false;
    try {
        isDevelopmentMode = await ipcRenderer.invoke('get-development-mode');
        console.log('[下单] 开发模式状态:', isDevelopmentMode);
    } catch (error) {
        // 如果获取配置失败，为了安全起见，默认不进行下单
        console.error('[下单] 获取开发模式配置失败，为了安全起见，不进行下单:', error);
        await TaskManager.error('[下单] 无法获取开发模式配置，为了安全起见，已取消下单操作');
        return;
    }

    // 如果是开发模式，不进行实际下单
    if (isDevelopmentMode) {
        await TaskManager.updateStatus('[下单] 开发模式已启用，跳过实际下单操作');
        console.log('[下单] 开发模式已启用，不进行实际下单');
        return;
    }

    await TaskManager.updateStatus('[下单] 开始下单流程');

    const automation = createAutomation();

    await automation
        .autoPoint(3600)
        .wait(2000)
        .eval(() => {
            window.scrollTo({ top: 880, behavior: 'smooth' });
        })
        .wait(1000)
        .run();

    await TaskManager.updateStatus('[下单] 点击下单按钮...');
    const submitOrderButton = querySelector('.list02.next-step-button a') as HTMLElement;
    if (submitOrderButton) {
        await automation
            .move(submitOrderButton)
            .click()
            .run();
        await TaskManager.updateStatus('[下单] 下单提交完成，等待结果');
    } else {
        await TaskManager.error('[下单] 没有找到订单下单按钮');
    }
}
// {
//     "action": "CheckoutServices-PlaceOrder",
//     "queryString": "",
//     "locale": "ja_JP",
//     "loggedin": true,
//     "error": false,
//     "authStartUrl": "https://api3.veritrans.co.jp:443/emv3ds/sp/tercerog/webinterface/GWTripartiteNACommandRcv/mpi/GetAuthorizeResult?md=QTEwMDAwMDAwMDAwMDAwMTcyNzcwMmNj-MjAyNTEyMDUxMTQ1MTc2MTc*-YmY5MjcwOGY1OWViYWQ2ZGZlM2MzMjNkNjIwNTQ2YTc3NTZkZDJiYTQ2ZDQzZmY1NjUzYjQxYzE2YTU3ODg2YQ**==aTLFzIWci1XTdUKp-Em0ygAAAY4"
//   }