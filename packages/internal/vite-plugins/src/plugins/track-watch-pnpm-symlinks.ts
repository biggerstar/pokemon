import { build, type Plugin, type ViteDevServer } from 'vite';
import * as fs from 'fs';
import path from 'node:path';

/**
 * 监听单个包的代码变化
 * */
function watchPnpmPackageChange(server: ViteDevServer, realPath: string) {
  server.watcher.add(realPath).on('change', (filePath) => {
    if (filePath.includes('node_modules')) return;
    if (!filePath.startsWith(realPath)) return;
    // console.log('[trackWatchPnpmSymlinks]', filePath);
    build({
      base: process.cwd(),
    }).then();
  });

}

/**
 * 遍历监听当前运行所在包的 所有 dependencies 对应 pnpm 软链接对应的模块
 * */
export function trackWatchPnpmSymlinks(): Plugin {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8').toString());
  return {
    name: 'track-watch-pnpm-symlinks',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      Object.keys(packageJson.dependencies).forEach(dep => {
        const depPath = path.resolve('node_modules', dep);
        try {
          const realPath = fs.realpathSync(depPath);
          watchPnpmPackageChange(server, realPath);
        } catch (e) {
          try {
            watchPnpmPackageChange(server, depPath);
          }catch (e) {
          }
        }
      });
    },
  };
}
