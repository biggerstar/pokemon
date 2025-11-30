import {WebContentsView} from "electron";
import {
  setupWebViewOptions,
} from "@/main/interface/window/base/setup-window-options";
import {gotoHashRouter, type GoToUrlCustomOptions} from "@/main/interface/window/apis";
import {BaseHashRouterWebContentsViewOptions} from "@/main/interface";


export class BaseHashRouterWebContentsView extends WebContentsView {
  constructor(viewOptions: BaseHashRouterWebContentsViewOptions = {}) {
    super(setupWebViewOptions(viewOptions));
  }

  public gotoHashRouter: (options: GoToUrlCustomOptions) => Promise<void> = gotoHashRouter
}
