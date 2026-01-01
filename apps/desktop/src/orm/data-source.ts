import { globalMainPathParser } from "@/global/global-main-path-parser";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { AccountEntity, TaskStatus } from "./entities/account";
import { AppConfigEntity } from "./entities/app-config";
import { ProductEntity } from "./entities/product";
import { ProxyPoolEntity } from "./entities/proxy-pool";
import { existsSync } from "fs";

const databasePath = globalMainPathParser.resolveDB('pm');
const databaseExists = existsSync(databasePath);

// 配置SQLite数据源
// 如果数据库文件不存在，临时启用 synchronize 创建表结构
// 如果数据库文件已存在，禁用 synchronize 防止数据丢失
export const AppDataSource = new DataSource({
  type: "sqlite",
  database: databasePath, // SQLite数据库文件路径
  logging: false, // 启用日志
  synchronize: !databaseExists, // 仅在数据库不存在时启用同步，防止已有数据丢失
  extra: {
    // 防止加载其他数据库驱动
    driver: "sqlite3"
  },
  entities: [
    AccountEntity,
    AppConfigEntity,
    ProductEntity,
    ProxyPoolEntity,
  ], // 注册实体
  // 或者使用通配符匹配所有实体文件
  // entities: ["src/entity/**/*.ts"],
});

// 保存初始化 Promise，供其他模块等待初始化完成
export const dataSourceInitPromise = AppDataSource.initialize()
  .then(async () => {
    console.log("SQLite 数据源已初始化！");
    
    // 应用启动时重置所有非 DONE 状态的任务为 NONE
    try {
      const repo = AppDataSource.getRepository(AccountEntity);
      const accounts = await repo.find();
      let resetCount = 0;
      
      for (const account of accounts) {
        if (account.status !== TaskStatus.DONE && account.status !== TaskStatus.ERROR) {
          account.status = TaskStatus.NONE;
          account.statusText = '';
          await repo.save(account);
          resetCount++;
        }
      }
      
      if (resetCount > 0) {
        console.log(`[App] 应用启动时已重置 ${resetCount} 个非 DONE/ERROR 状态的任务为 NONE`);
      }
    } catch (error) {
      console.error('[App] 应用启动时重置任务状态失败:', error);
    }
  })
  .catch((err) => {
    console.error("数据源初始化时出错", err);
    throw err; // 重新抛出错误，让等待的代码能够捕获
  });
