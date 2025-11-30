process.env.ELECTRON_RUN_AS_NODE = '1';

const whistle = require('whistle')

const port = parseInt(process.env.PORT || '12306');
const localhost = process.env.LOCALHOST || '127.0.0.1';

// 保留已有的 NODE_OPTIONS 并追加新参数
process.env.NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  '--max-http-header-size=3276800'
]
  .filter(Boolean)
  .join(' ');

console.log('Final NODE_OPTIONS:', process.env.NODE_OPTIONS);

// 启动whistle服务
const whistleInstance = whistle({ 
  port,
 }, () => {
  whistleInstance.rulesUtil.properties.setEnableCapture(true);
  console.log(`Whistle代理服务已启动 - http://${localhost}:${port}`);
});

// 处理进程退出信号
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});
