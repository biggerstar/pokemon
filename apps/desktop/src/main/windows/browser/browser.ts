import { app } from 'electron';
import os from 'os';

// 全局配置
const macUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0 Safari/537.36`;
const windowUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0`;

const UA = os.platform() === 'darwin' ? macUA : windowUA;
app.userAgentFallback = windowUA;
app.commandLine.appendArgument('lang=zh-CN');

// 重新导出所有分离的模块，保持向后兼容
export * from './browser/index';

// 导出DetachWindow相关功能
export {
  createDetachWindow,
  DetachWindow,
  openDetachWindow,
  type DetachWindowOptions,
} from './detach-window';
