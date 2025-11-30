import { ApplicationDirEnum } from "@/enum/app-dir";
import { app } from "electron";
import path from "path";
import { globalEnv } from "./global-env";
import { GlobalRendererPathParser } from "./global-renderer-path-parser";


class GlobalMainPathParser extends GlobalRendererPathParser{
   /**
   * 解析本地计算机用户数据保存路径
   * */
   public resolveLocalComputer(...args: string[]): string {
    return path.resolve.apply(path, [app.getPath('appData'), ApplicationDirEnum.localAppData].concat(args));
  }

   /**
   * 解析数据库路径， 在开发模式和生产模式中，数据库的存储路径不同
   * */
   public resolveDB(dbName: string): string {
    return globalEnv.isDev ?
      path.resolve(`./db/${dbName.trim()}.db`) :
      this.resolveLocalComputer(`./data/${dbName.trim()}.dat`)
  }
}

export const globalMainPathParser = new GlobalMainPathParser();
