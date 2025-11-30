import {
  copyInPackagePlugin,
  multipleViteLibLoader,
  trackWatchPnpmSymlinks
} from '@marketing/vite-plugin';
import path from "node:path";
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import electron from 'vite-plugin-electron/simple';
import createElectronConfig from './electron.config';


export default defineConfig(async (config: ConfigEnv): Promise<UserConfig> => {
  const isBuild = config.command === 'build';
  return {
    base: './',
    logLevel: config.isPreview ? 'info' : 'silent',
    publicDir: false,
    build: {
      outDir: 'marketing',
      emptyOutDir: false,
    },
    plugins: [
      await electron(createElectronConfig(config)),
      trackWatchPnpmSymlinks(),
      // multipleViteLibLoader({
      //   fromDir: 'src/scripts-js/exports',
      //   toDir: 'marketing/scripts-js',
      //   watchDir: 'src/scripts-js',
      //   minify: true,
      //   resolveAlias: { '@': path.resolve(__dirname, 'src') }
      // }),
      multipleViteLibLoader({
        fromDir: 'src/preload/exports',
        toDir: 'marketing/preload',
        watchDir: 'src/preload',
        minify: true,
        resolveAlias: { '@': path.resolve(__dirname, 'src') },
      }),
      copyInPackagePlugin([
        {
          moduleName: '@marketing/frontend',
          src: 'dist/',
          dest: 'marketing/pages/',
          command: 'build',
          emptyDir: true,
        },
        {
          src: 'public/',
          dest: 'marketing/',
        },
      ]),
    ],
    server: {
      port: 36520,
    },
    clearScreen: false,
  };
});
