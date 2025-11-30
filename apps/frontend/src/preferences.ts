import type { DeepPartial } from "@vben-core/typings";
import { defineOverridesPreferences, type Preferences } from '@vben/preferences';
import { merge } from "lodash-es";

type DeepPartialPreferences = DeepPartial<Preferences>;

const defaultConfig: DeepPartialPreferences = {
  logo: {
    enable: false,
    source: '',
  },
  app: {
    name: '',
    // layout: "sidebar-mixed-nav", 
    dynamicTitle: true,
    enableCheckUpdates: false,
    enableRefreshToken: false,
    enablePreferences: false,
    authPageLayout: "panel-right",
    compact: false,
  },
  copyright: {
    enable: false,
    settingShow: false
  },
  shortcutKeys: {
    enable: false
  },
  header: {
    // enable: false,
  },
  navigation: {
    // styleType: "plain" // 菜单按钮  [ 圆润 | 朴素 ]
  },
  tabbar: {
    enable: false
    // persist: false,
    // showIcon: false,
    // showMaximize: false,
    // showMore: false,
    // styleType: "plain"
  },
  theme: {
    builtinType: "deep-green",
    colorPrimary: "#00a8ff",
    mode: "light"
  },
  transition: {
    enable: false,
    loading: false,
    progress: false
  },
  breadcrumb: { // 面包屑
    // enable: false
  },
  widget: {
    fullscreen: false,
    globalSearch: false,
    languageToggle: true,
    lockScreen: false,
    notification: false,
    refresh: false,
    sidebarToggle: false,
    themeToggle: false
  },
  sidebar: {}
}

if (true) {
// if (isElectron()) {
  merge<DeepPartialPreferences, DeepPartialPreferences>(
    defaultConfig,
    {
      app: {
      },
      header: {
        enable: false,
      },
      breadcrumb: { // 面包屑
        enable: false
      },
      sidebar: {
        collapsed: true,
        collapsedShowTitle: true
      },
    })
}

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences(defaultConfig);
