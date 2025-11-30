import { globalMainPathParser } from "@/global/global-main-path-parser";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { AppConfigEntity } from "./entities/app-config";
import { ProductEntity } from "./entities/product";

// 配置SQLite数据源
export const AppDataSource = new DataSource({
  type: "sqlite",
  database: globalMainPathParser.resolveDB('kaiyun'), // SQLite数据库文件路径
  logging: false, // 启用日志
  synchronize: true,
  extra: {
    // 防止加载其他数据库驱动 
    driver: "sqlite3"
  },
  entities: [
    AppConfigEntity,
    ProductEntity,
  ], // 注册实体
  // 或者使用通配符匹配所有实体文件
  // entities: ["src/entity/**/*.ts"],
});

// 初始化数据源
AppDataSource.initialize()
  .then(async () => {
    console.log("SQLite 数据源已初始化！");
  })
  .catch((err) => {
    console.error("数据源初始化时出错", err);
  });
