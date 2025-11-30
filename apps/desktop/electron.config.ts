import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { type ConfigEnv, loadEnv } from 'vite';
import type { ElectronSimpleOptions } from 'vite-plugin-electron/simple';
import pkg from './package.json';

const alias = {
  '@': path.resolve(__dirname, 'src'),
};

/**
 * 生成 electron vite 插件配置
 * */
export default function createElectronConfig(
  {
    command,
    mode,
  }: ConfigEnv,
): ElectronSimpleOptions {
  const isBuild = command === 'build';
  const sourcemap = false;
  if (isBuild) {
    fs.rmSync('marketing', { recursive: true, force: true });
  }
  const { ELECTRON_DEV_SERVER_URL = '' } = loadEnv(mode, '', '');
  return {
    main: {
      // Shortcut of `build.lib.entry`
      entry: 'src/main/index.ts',
      onstart({ startup }) {
        if (process.env.VSCODE_DEBUG) {
          console.log(/* For `.vscode/.debug.script.mjs` */'[startup] Electron App');
        } else {
          startup().then();
        }
      },
      vite: {
        define: {
          ELECTRON_DEV_SERVER_URL: JSON.stringify(ELECTRON_DEV_SERVER_URL),
        },
        plugins:[
        ],
        resolve: { alias: alias },
        build: {
          sourcemap,
          minify: isBuild,
          outDir: 'marketing/main',
          rollupOptions: {
            output: {
              format: 'es',
            },
            // Some third-party Node.js libraries may not be built correctly by Vite, especially `C/C++` addons,
            // we can use `external` to exclude them to ensure they work correctly.
            // Others need to put them in `dependencies` to ensure they are collected into `app.asar` after the app is built.
            // Of course, this is not absolute, just this way is relatively simple. :)
            external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
          },
        },
      },
    },
    // Ployfill the Electron and Node.js API for Renderer process.
    // If you want to use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
    // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
    renderer: {},
  };
}
const oldErrorConsole = console.error;
if (!oldErrorConsole['__rewritten']) {
  console.error = (...args: any[]) => {
    if (args.toString().includes('output.inlineDynamicImports')) return
    return oldErrorConsole.apply(console, args);
  };
  oldErrorConsole['__rewritten'] = true;
}
