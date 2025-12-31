import { createAutomation } from "@/preload/common/web-automation";
import { querySelector } from "@/preload/common/dom";
import { TaskManager } from "./common/task-manager";
export async function processOrderPlaceOrder() {

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
            // .click()
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