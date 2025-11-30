import { ApplicationDirEnum } from '@/enum/app-dir';
import { globalEnv } from "@/global/global-env";
import path, { type ParsedPath } from 'path';

export type TypeGlobalPathParserResult = {
  [Symbol.toPrimitive]: Function;
  toString(): string;
  relative(): string;
  fileScheme(): `file://${string}`;
  parse(): ParsedPath;
}

export class GlobalRendererPathParser {
  /** 应用工作的根目录 */
  private _APP_WORK_ROOT: string;

  constructor() {
    // 此处是为了在 web 中正确获取和使用
    this._APP_WORK_ROOT = this.APP_WORK_ROOT;
  }

  public get APP_WORK_ROOT(): string {
    return this._APP_WORK_ROOT || globalEnv.getEnv('APP_WORK_ROOT');
  }

  public set APP_WORK_ROOT(root: string) {
    this._APP_WORK_ROOT = root;
    globalEnv.setEnv('APP_WORK_ROOT', root);
  }

  public serAppWorkRoot(root: string): void {
    this.APP_WORK_ROOT = root;
  }

  /**
   * 基于 APP_WORK_ROOT 解析路径
   * */
  public resolveAppRoot(...args: string[]): TypeGlobalPathParserResult {
    const fullPath = path.resolve.apply(path, [this.APP_WORK_ROOT].concat(args));
    const _this = this;
    return {
      [Symbol.toPrimitive]: () => fullPath,
      toString() {
        return fullPath;
      },
      relative() {
        console.log(_this.APP_WORK_ROOT, fullPath);
        return path.relative(_this.APP_WORK_ROOT, fullPath);
      },
      fileScheme() {
        return `file://${fullPath}`;
      },
      parse() {
        return path.parse(fullPath);
      },
    };
  }

  /**
   * 基于 web 产物目录路径
   * */
  public resolveWeb(...args: string[]): TypeGlobalPathParserResult {
    return this.resolveAppRoot.apply(this, [ApplicationDirEnum.web.toString()].concat(args));
  }

  /**
   * 基于 electron 产物目录下的 public |  APP_WORK_ROOT 路径解析
   * */
  public resolvePublic(...args: string[]): TypeGlobalPathParserResult {
    return globalEnv.getWebRootUrl()
      ? this.resolveWeb.apply(this, [ApplicationDirEnum.public.toString()].concat(args))
      : this.APP_WORK_ROOT;
  }

  /**
   * 解析 preload 路径
   * */
  public resolvePreload(...args: string[]): TypeGlobalPathParserResult {
    return this.resolveAppRoot.apply(this, [ApplicationDirEnum.preload.toString()].concat(args));
  }

  /**
   * 解析 scripts-js 路径
   * */
  public resolveScriptJs(...args: string[]): TypeGlobalPathParserResult {
    return this.resolveAppRoot.apply(this, [ApplicationDirEnum.scriptsJs.toString()].concat(args));
  }


  public resolveExtensions(...args: string[]){
    return this.resolveAppRoot.apply(this, [ApplicationDirEnum.extensions.toString()].concat(args))
  }
}

export const globalRendererPathParser = new GlobalRendererPathParser();
