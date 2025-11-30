import { globalMainPathParser } from "@/global/global-main-path-parser";
import { BaseHashRouterBrowserWindowOptions } from "@/main/interface";
import { type BaseHashRouterWebContentsViewOptions } from "@/main/interface/window/base";

function setupCommonOptions(options: BaseHashRouterBrowserWindowOptions | BaseHashRouterWebContentsViewOptions) {
  if (!options.webPreferences) options.webPreferences = {};

  if (!options.webPreferences.preload) {
    if (options.preloadCjsName && options.preloadName) {
      throw new Error('preloadCjsName 和 preloadName 只能设置一个');
    }
    if (options.preloadName) {
      options.webPreferences.preload = globalMainPathParser.resolvePreload(`${options.preloadName}.mjs`).toString();
    }
    if (options.preloadCjsName) {
      options.webPreferences.preload = globalMainPathParser.resolvePreload(`${options.preloadCjsName}.cjs`).toString();
    }
  }
}

export function setupWindowOptions(options: BaseHashRouterBrowserWindowOptions = {}): BaseHashRouterBrowserWindowOptions {
  setupCommonOptions(options);

  if (!options.icon && options.iconName) {
    options.icon = globalMainPathParser.resolvePublic('images', options.iconName).toString();
  }

  options.show = 'show' in options ? options.show : false;

  return options
}

export function setupWebViewOptions(options: BaseHashRouterWebContentsViewOptions = {}): BaseHashRouterWebContentsViewOptions {
  setupCommonOptions(options);
  return options
}
