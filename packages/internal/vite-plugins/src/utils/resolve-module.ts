import * as fs from 'fs';
import { createRequire } from 'module';
import path from 'node:path';

/**
 * 获取 某个 npm 包的 main 入口路径
 * 支持本地 pnpm workspace 包
 * @param moduleName 包名 例如 vue, react 等
 * */
export function getNpmModuleMainEntry(moduleName: string) {
  const require = createRequire(process.cwd());
  const entryPath = require.resolve(moduleName);
  let parentDir = path.dirname(entryPath);
  const delimiter = '/';
  do {
    const isPack = fs.existsSync(path.resolve(parentDir, 'package.json'));
    if (!isPack) {
      parentDir = path.dirname(parentDir);
    } else {
      return parentDir;
    }
    if (parentDir.split(delimiter).length < 2) {
      throw new Error(`[getNpmModuleMainEntry] Cannot find package ${moduleName}`);
    }
  } while (true);
}
