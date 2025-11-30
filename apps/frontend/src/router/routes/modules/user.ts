import type { RouteRecordRaw } from 'vue-router';

import { RoleType } from '#/enum';
import { BasicLayout } from '#/layouts';
import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      icon: 'material-symbols:credit-card-clock-outline',
      keepAlive: true,
      order: 1000,
      title: $t('page.account.title'),
      hideChildrenInMenu: true,
      authority: [RoleType.USER],
    },
    name: 'Account',
    path: '/account',
    children: [
      {
        meta: {
          icon: 'material-symbols:credit-card-clock-outline',
          title: $t('page.account.title'),
          authority: [RoleType.USER],
        },
        name: 'AccountPage',
        path: '/account/Account',
        component: () => import('#/views/account/Account/index.vue'),
      },
    ],
  },
];

export default routes;
