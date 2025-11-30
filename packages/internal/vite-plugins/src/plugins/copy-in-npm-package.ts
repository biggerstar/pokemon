import * as fs from 'fs';
import fse from 'fs-extra';
import path from 'node:path';
import process from 'node:process';
import type { Plugin } from 'vite';
import { getNpmModuleMainEntry } from '../utils/resolve-module';

type Command = 'build' | 'serve' | 'all';
export type CopyInPackageOptions = Array<{
  /** 
   * npm包 或者 本地包的名称, 例如 vue, react 等
   * 如果不指定，则直接解析复制相对当前运行的目录
  */
  moduleName?: string,
  /** 相对源包根的路径, 例如 该值为 dist, moduleName 为 vue, 则复制为 *vue/dist 下的目录 */
  src: string,
  /** 当前包的目标路径, 运行代码所在包的路径， 相对于 process.cwd() */
  dest: string,
  /** 是否为软链接，不进行复制, 默认为 false, 不进行复制可享受对应包的实时热更新 */
  link?: boolean,
  /** 运行时机， 默认为 all */
  command?: Command,
  /**
   * 是否清空文件夹， 默认为 false
  */
  emptyDir?: boolean
}>

type Target = {
  src: string,
  dest: string,
  link: boolean,
  moduleName: string,
  modulePath: string,
  emptyDir: boolean
}
type TargetResult = {
  copyTargets: Target[],
  linkTargets: Target[],
}


function generateTarget(command: Command, targets: CopyInPackageOptions): TargetResult {
  const copyTargets = targets.map((options) => {
    const cmd = 'command' in options ? options.command : 'all';
    if (cmd !== 'all' && command !== options.command) return false;

    let targetModuleRootPath = ''

    if (options.moduleName) {
      try {
        targetModuleRootPath = getNpmModuleMainEntry(options.moduleName);
      } catch (e) {
        console.error('[copy-in-package]', options.moduleName, '包不存在, 无法解析复制')
      }
    }

    return {
      src: path.resolve(targetModuleRootPath, options.src),
      dest: path.resolve(process.cwd(), options.dest),
      link: 'link' in options ? options.link : false,
      moduleName: options.moduleName,
      modulePath: targetModuleRootPath,
      command: cmd,
      emptyDir: options.emptyDir || false,
    };
  }).filter(Boolean) as Target[];
  return {
    copyTargets: copyTargets.filter(target => !target.link),
    linkTargets: copyTargets.filter(target => target.link),
  };
}

function createDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清空指定文件夹
 * @param {string} dirPath - 要清空的文件夹路径
 * @returns {Promise<void>}
 */
async function clearDirectory(dirPath: string) {
  try {
    // 确保目录存在
    await fse.ensureDir(dirPath);
    // 删除目录中的所有内容
    await fse.emptyDir(dirPath);
  } catch (error) {
    console.error(`清空文件夹时出错: ${dirPath}`, error);
    throw error; // 可以选择重新抛出错误或处理它
  }
}

function linkDir(linkTargets: Target[]) {
  linkTargets.forEach(async (target) => {
    // console.log(target);
    const destDir = target.dest;
    createDir(path.dirname(target.dest));
    try {
      if (target.emptyDir) {
        // rimraf.rimrafSync(destDir);
        await clearDirectory(destDir);
      }
      fs.symlinkSync(target.src, destDir);
    } catch (error: any) {
      console.log("linkDir", error)
    }
  });
}

function copyDir(copyTargets: Target[]) {
  copyTargets.forEach(async (target) => {
    const destDir = target.dest;
    createDir(path.dirname(target.dest));
    try {
      if (target.emptyDir) {
        await clearDirectory(destDir);
      }
      fse.copySync(target.src, target.dest);
    } catch (error: any) {
      console.log("copyDir", error)
    }
  });
}

/**
 * 请注意，使用该插件所在的包需要安装对应要复制插件的模块， 例如复制 vue 内的文件，则需要安装 vue 模块
 * 该插件可能需要 window 管理员权限， 或者 Unix sudo 权限
 * @param targets 需要复制的文件列表
 * */
export function copyInPackagePlugin(targets: CopyInPackageOptions): Plugin {
  let targetResult: TargetResult;
  return {
    name: 'copy-in-package',
    config(config, { command }) {
      if (!Array.isArray(config.plugins)) config.plugins = [];
      targetResult = generateTarget(command, targets);
      if (targetResult) {
        const { copyTargets, linkTargets } = targetResult;
        linkDir(linkTargets);
        copyDir(copyTargets);
      }
    },
  };
}
