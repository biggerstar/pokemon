import { ipcRenderer } from "electron";

export function useAboutBlankPage() {
  window.addEventListener("load", async () => {
    const tipContaner = document.createElement('div');
    tipContaner.style.marginTop = '50px';

    setInterval(async () => {
      const launchUrl = await ipcRenderer.invoke('get-config', 'dbLaunchUrl')
      // console.log(launchUrl)
      
      tipContaner.innerHTML = `
        <p>使用技巧:</p>

        <p>1. shift + 鼠标左键点击商品可打开新窗口</p>
        <p>2. 快捷键 [ Ctrl + E ] 可以快速 打开 或 关闭 采集浏览器</p>

        <a href="${launchUrl}">开云</a>
    `;
    }, 1000)


    document.body.appendChild(tipContaner);

    const tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.bottom = '100px';
    tooltip.style.left = '20px';
    tooltip.style.zIndex = '9999';
    tooltip.style.backgroundColor = '#fff';
    tooltip.style.padding = '5px 10px';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.borderRadius = '4px';
    tooltip.style.userSelect = 'none';
    tooltip.innerHTML = '<-- 点击要采集的网站';
    document.body.appendChild(tooltip);
  })
}
