import type {
  AccessModeType,
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@vben/types';

import { generateAccessible } from '@vben/access';
import { preferences } from '@vben/preferences';


import { Api } from '#/api';
import { BasicLayout, IFrameView } from '#/layouts';

const forbiddenComponent = () => import('#/views/_core/fallback/forbidden.vue');

async function generateAccess(
  options: GenerateMenuAndRoutesOptions,
  mode: AccessModeType = preferences.app.accessMode,
) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
  };

  return await generateAccessible(mode, {
    ...options,
    fetchMenuListAsync: async () => {
      // message.loading({
      //   content: `${$t('common.loading.loading')}`,
      //   duration: 3,
      // });
      return Api.core.account.getAccountMenus();
    },
    // 可以指定没有权限跳转403页面
    forbiddenComponent,
    // 如果 route.meta.menuVisibleWithForbidden = true
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
