import * as fs from 'fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import {
  build,
  mergeConfig,
  type InlineConfig,
  type Plugin,
  type UserConfig
} from 'vite';

type ElectronScriptJsBuildOptions = {
  fromDir: string;
  toDir: string;
  /**
   * 是否监听文件变化
   * @default true
   * */
  watch?: boolean;
  /**
   * 监听变化的文件目录
  */
  watchDir?: string;
  /**
   * 是否压缩
   * @default true
   * */
  minify?: boolean;
  /**
   * 排除打包的模块
   * */
  external?: string[],
  /**
   * 别名配置
   * */
  resolveAlias?: Record<string, string>,
  /**
   * 所有单拎出来的 lib.js 编译都会生效
   * */
  vite?: UserConfig
}
const builtins = builtinModules.filter((e) => !e.startsWith('_'));
const electronPack = ['electron', 'electron/renderer', 'electron/main', 'electron/utility', 'electron/common']

builtins.push(...electronPack, ...builtins.map((m) => `node:${m}`));

function isCtsFile(filePath: string = '') {
  return path.parse(filePath).ext === '.cts';
}

/**
 * 将某个文件夹内的所有文件依次打包成 lib.js 文件, 以文件夹输入， 文件夹输出， 文件夹内有多少个文件就输出多少个 lib.js 文件
 * */
export function multipleViteLibLoader(options: ElectronScriptJsBuildOptions): Plugin {
  if (!options) options = {} as any
  const fromDir = path.resolve(options.fromDir);
  const toDir = path.resolve(options.toDir);
  const allScripts = fs.readdirSync(fromDir);
  const isWatch = 'watch' in options ? !!options.watch : true;
  let watchDir = fromDir
  if (options.watchDir) {
    watchDir = path.resolve(options.watchDir)
  }
  // console.log('watchDir', watchDir, toDir);

  return {
    name: `electron-script-js-plugin-${watchDir}`,
    enforce: 'pre',
    configureServer(server) {
      if (!isWatch) return;
      server.watcher
        .add([
          path.join(watchDir, '*'),
        ])
        .on('change', async (changeFilePath) => {
          if (changeFilePath.includes('node_modules')) return;
          if (!changeFilePath.startsWith(watchDir)) return;
          const mainEntriesFileList = await fs.promises.readdir(fromDir)
          mainEntriesFileList.forEach(fileName => {
            const fileInfo = path.parse(path.resolve(fromDir, fileName));
            buildLib(options, path.resolve(fileInfo.dir, fileInfo.base), path.resolve(toDir, fileInfo.base));
          })
        });
    },
    config() {
      allScripts.forEach(script => {
        buildLib(options, path.resolve(fromDir, script), path.resolve(toDir, script));
      });
    },
  };
}

function buildLib(options: ElectronScriptJsBuildOptions, fromPath: string, toPath: string) {
  const isCts = isCtsFile(fromPath);
  const defaultConfig: InlineConfig = {
    configFile: false,
    publicDir: false,
    resolve: {
      alias: options.resolveAlias,
    },
    build: {
      // target: 'es2022',
      emptyOutDir: false,
      minify: options.minify || process.env['NODE_ENV'] !== 'development',
      // lib: {
      //   entry: fromPath,
      //   formats: isCts ? ['cjs'] : ['es'],
      //   // fileName(_, entryName) {
      //   //   // console.log(entryName); 
      //   //   return `${entryName}.js`;
      //   // },
      // },
      rollupOptions: {
        external: [...builtins, ...(options.external || [])],
        input: fromPath,
        output: {
          inlineDynamicImports: true,
          // format: isCts ? 'cjs' : 'es',
          // entryFileNames: `[name].${isCts ? 'cjs' : 'mjs'}`,
          format: 'cjs',
          entryFileNames: `[name].cjs`,
        },
      },
      outDir: path.dirname(toPath),
    },
  };
  build(mergeConfig(defaultConfig, options.vite || {})).then();
}
