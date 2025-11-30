import type { RouteRecordRaw } from 'vue-router';


const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'material-symbols:contextual-token-outline-rounded',
      order: 5,
      title: "开云",
      hideChildrenInMenu: true,
      keepAlive: true,
    },
    name: 'platform-kaiyun',
    path: '/kaiyun',
    component: () => import('#/views/kaiyun/index.vue'),
  },
];

export default routes;
