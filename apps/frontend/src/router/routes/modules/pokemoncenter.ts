import type { RouteRecordRaw } from 'vue-router';


const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'material-symbols:contextual-token-outline-rounded',
      order: 5,
      title: "宝可梦",
      hideChildrenInMenu: true,
      keepAlive: true,
    },
    name: 'platform-pokemoncenter',
    path: '/pokemoncenter',
    component: () => import('#/views/pokemoncenter/index.vue'),
  },
];

export default routes;
