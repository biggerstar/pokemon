let win;
let child;
let options;
let dataUrl;
let timer;
let isRunning = false;

const execJsSafe = async (code) => {
  try {
    return await win.webContents.executeJavaScript(code);
  } catch (e) {}
};

export { execJsSafe };

const importDataUrl = async (delay) => {
  if (delay !== true && win && isRunning && dataUrl && win.webContents) {
    const result = await execJsSafe(`window.setWhistleDataUrl("${dataUrl}")`);
    if (result != null) {
      dataUrl = null;
    }
  }
  timer = dataUrl && setTimeout(importDataUrl, isRunning ? 100 : 300);
};

const setDataUrlInternal = function () {
  clearTimeout(timer);
  importDataUrl(true);
};

export const setChild = (c) => {
  child = c;
};

export const getChild = () => child;

export const setWin = (w) => {
  win = w;
  setDataUrlInternal();
};

export const getWin = () => win;

export const setOptions = (o) => {
  options = o;
};

export const getOptions = () => options;

const sendMsg = (data) => {
  if (child) {
    child.postMessage(data);
  }
};

export { sendMsg };

export const setDataUrl = (url) => {
  dataUrl = url.replace(/[^\w.~!*''();:@&=+$,/?#[\]<>{}|%-]/g, (s) => {
    try {
      return encodeURIComponent(s);
    } catch (e) {}
    return '';
  });
  setDataUrlInternal();
};

export const getIsRunning = () => isRunning;

export const setRunning = (running) => {
  isRunning = running;
};
