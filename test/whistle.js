import whistle from 'whistle';

const port = parseInt(process.env.PORT || '12306');
const localhost = process.env.LOCALHOST || '127.0.0.1';

// 启动whistle服务
whistle({ port }, () => {
  console.log(`Whistle代理服务已启动 - http://${localhost}:${port}`);
});

// 处理进程退出信号
process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('SIGINT', () => {
  process.exit(0);
});
