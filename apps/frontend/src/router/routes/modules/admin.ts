import type { RouteRecordRaw } from 'vue-router';

import { RoleType } from '#/enum';
import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'ion:settings-outline',
      order: 9997,
      title: $t('system.admin'),
      authority: [RoleType.SUPER, RoleType.ADMIN],
    },
    name: 'SystemAdmin',
    path: '/system-admin',
    children: [
      // {
      //   path: '/system-admin/role',
      //   name: 'SystemRole',
      //   meta: {
      //     icon: 'mdi:account-group',
      //     title: $t('system.role.title'),
      //     authority: [RoleType.SUPER],
      //   },
      //   component: () => import('#/views/panel/index.vue'),
      // },
      // {
      //   path: '/system-admin/menu',
      //   name: 'SystemMenu',
      //   meta: {
      //     icon: 'mdi:menu',
      //     title: $t('system.menu.title'),
      //     authority: [RoleType.SUPER],
      //   },
      //   component: () => import('#/views/panel/index.vue'),
      // },
      // {
      //   path: '/system-admin/company',
      //   name: 'SystemCompany',
      //   meta: {
      //     icon: 'mdi:office-building',
      //     title: $t('system.company.title'),
      //     authority: [RoleType.SUPER, RoleType.ADMIN],
      //   },
      //   component: () => import('#/views/panel/index.vue'),
      // },
      // {
      //   path: '/system/user',
      //   name: 'SystemUser',
      //   meta: {
      //     icon: 'mdi:account',
      //     title: $t('system.user.title'),
      //     authority: [RoleType.SUPER, RoleType.ADMIN],
      //   },
      //   component: () => import('#/views/panel/index.vue'),
      // },
    ],
  },
];

export default routes;
