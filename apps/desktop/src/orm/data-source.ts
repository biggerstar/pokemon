import { globalMainPathParser } from "@/global/global-main-path-parser";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { AccountEntity, TaskStatus } from "./entities/account";
import { AppConfigEntity } from "./entities/app-config";
import { ProductEntity } from "./entities/product";
import { ProxyPoolEntity } from "./entities/proxy-pool";

// 配置SQLite数据源
export const AppDataSource = new DataSource({
  type: "sqlite",
  database: globalMainPathParser.resolveDB('pm'), // SQLite数据库文件路径
  logging: false, // 启用日志
  synchronize: true,
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

// 初始化数据源
AppDataSource.initialize()
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
  });
