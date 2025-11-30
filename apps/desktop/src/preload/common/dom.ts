
export function removeIntervalAndTimeout() {
  setTimeout(() => {
    // @ts-ignore
    window['setInterval'] = function () { }
    // @ts-ignore
    window['setTimeout'] = function () { }
  }, 5000)
  return { setInterval, setTimeout }
}
