import pkg, { type CustomTitlebar } from 'custom-electron-titlebar';
// @ts-ignore
import { TitleBarOptions } from "custom-electron-titlebar/titlebar/options";
import process from 'node:process';

const { Titlebar, TitlebarColor } = pkg;

type UseTitlebarOptions = TitleBarOptions & {
  /**
   * 是否重置定位元素的位置
   * */
  resetPosition?: boolean,
  /**
   * 是否隐藏 Body 容器的 overflow
   * */
  overflowHidden?: boolean,
  /**
   * 标题栏颜色
   * */
  color?: string,

  /**
   * 标题后缀
   * */
  titleSuffix?: {
    /**
     * 标题后缀
     * */
    suffix?: string,
    /**
     * 是否显示版本号
     * */
    showVersion?: boolean,
    /**
    * 分隔符
    * */
    separator?: string,
    /**
     * 版本分隔符
    */
    versionSeparator?: string,
  },
}

/**
 * 重置 electron 挂在 body 定位元素的位置，目的为了一些UI 组件（如：dialog, drawer）能在 titlebar 下方正常显示
 * */
function resetThePositionOfThePositioningElement(options: UseTitlebarOptions) {
  const body = document.body
  
  // titlebar
  const titlebar = document.querySelector('.cet-titlebar')
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node: HTMLElement) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.parentElement?.tagName !== 'BODY') { // 只处理挂载 body 的子元素
            return
          }
          if (!node.style.position) { // 只处理有 position 属性的元素
            return
          }
          const style = getComputedStyle(node)
          node.style.top = `calc(${style.top || 0} + ${titlebar.clientHeight}px)`
        }
      })
    })
  })

  mutationObserver.observe(body, {
    childList: true,
    subtree: true,
  })

  // container
  const container = document.querySelector<HTMLElement>('.cet-container')
  if (container) {
    if (options.overflowHidden) {
      container.style.overflow = 'hidden'
    }
  }
}

/**
 * 创建基于 custom-electron-titlebar 库的 Titlebar
 * */
export function useTitlebar(options: UseTitlebarOptions = {}) {
  let titlebar: CustomTitlebar | null = null
  const API = {
    updateTitle: (title: string) => {
      let suffix = options.titleSuffix?.suffix || ''
      const { showVersion, separator = ' ', versionSeparator = ' ' } = options.titleSuffix || {}
      if (title) {
        // 只有在前面的 title 存在时，才添加分隔符
        if (separator) {
          suffix = `${separator}${suffix}`
        }
        if (showVersion) {
          suffix = `${suffix}${versionSeparator}${process.env.npm_package_version} `
        }
      }

      titlebar?.updateTitle(title + suffix)
    }
  }
  window['electronTitlebar'] = API

  window.addEventListener('DOMContentLoaded', () => {
    titlebar = new Titlebar({
      ...options,
      backgroundColor: TitlebarColor.fromHex(options.color || '#FFFFFF'),
    });
    if (!document['titlebar']) document['titlebar'] = titlebar

    if (options.resetPosition) {
      const script = document.createElement('script')
      script.innerHTML = `
        const reset = ${resetThePositionOfThePositioningElement.toString()}
        reset(${JSON.stringify(options)})
      `
      document.head.appendChild(script)
      document.head.removeChild(script)
    }
  });
}
