import { app } from 'electron';
import process from 'process';
import { browserinternetView, TaskQueueManager } from '../windows/browser/browser';

export * from './ipc-browser';
export * from './ipc-data-api';
export * from './ipc-parser-data';
export * from './ipc-pokemoncenter';
export * from './system/devtool';

app.on('will-quit', async () => {
  browserinternetView.stopTask();
  await TaskQueueManager.getInstance().resetAllNonDoneTasksStatus();
});

process.on('SIGINT', async () => {
  console.log('[App] 收到 SIGINT 信号，正在重置任务状态...');
  await TaskQueueManager.getInstance().resetAllNonDoneTasksStatus();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[App] 收到 SIGTERM 信号，正在重置任务状态...');
  await TaskQueueManager.getInstance().resetAllNonDoneTasksStatus();
  process.exit(0);
});
