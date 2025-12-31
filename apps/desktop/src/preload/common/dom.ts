export function removeIntervalAndTimeout() {
  setTimeout(() => {
    // @ts-ignore
    window['setInterval'] = function () {};
    // @ts-ignore
    window['setTimeout'] = function () {};
  }, 5000);
  return { setInterval, setTimeout };
}

export function querySelector<T extends HTMLInputElement>(
  selector: string,
): T | null {
  return document.querySelector(selector);
}

export function querySelectorAll<T extends HTMLInputElement>(
  selector: string,
): NodeListOf<T> {
  return document.querySelectorAll(selector);
}
