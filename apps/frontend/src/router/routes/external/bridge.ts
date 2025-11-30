import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'ElectronBridge',
    path: '/bridge',
    component: () => import('#/views/bridge/Bridge.vue'),
    meta: {
      title: 'bridge',
      authority: [],
      ignoreAccess: true,
    }
  },
];

export default routes;
