import { fork } from 'child_process';
import path from 'path';
import proxy from 'set-global-proxy';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPort = 12306;
const defalutHost = '127.0.0.1';

export class NetworkCapture {
  _running = false;
  _childProcess = null;
  _proxyEnabled = false;
  _loopFetchResponseTimer;
  port;
  host;
  clientId;
  lastRowId;
  callbackList = [];
  constructor() {
    // 确保进程退出时清理资源
    process.on('exit', this._cleanup.bind(this));
    process.on('SIGINT', this._cleanup.bind(this));
    process.on('SIGTERM', this._cleanup.bind(this));
    this.clientId = `${Date.now()}-1`;
    this.lastRowId = `${Date.now()}-1`;
  }

  async start(options = {}) {
    this.port = options.port || defaultPort;
    this.host = options.host || defalutHost;
    if (this._running) {
      console.log('代理服务已经在运行中');
      return;
    }
    try {
      // 启动whistle代理服务子进程
      this._childProcess = fork(path.join(__dirname, 'whistle.js'), {
        stdio: 'inherit',
        env: {
          PORT: this.port.toString(),
          LOCALHOST: this.host,
        },
      });

      // 设置全局代理
      this._proxyEnabled = await proxy.enableProxy({
        host: this.host,
        port: this.port,
        sudo: true,
      });

      this._running = true;
      if (this._proxyEnabled) {
        console.log('成功设置全局代理');
      }
      this.loopFetchResponse();

      // 监听子进程退出
      this._childProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`代理服务异常退出，代码: ${code}`);
        }
        this._running = false;
        this._childProcess = null;
      });
    } catch (error) {
      console.error('启动代理服务失败:', error);
      await this._cleanup();
      throw error;
    }
  }

  async stop() {
    if (!this._running) {
      console.log('代理服务未运行');
      return;
    }
    clearInterval(this._loopFetchResponseTimer);
    this.clearCallback();

    try {
      // 关闭全局代理
      if (this._proxyEnabled) {
        await proxy.disableProxy({ sudo: true });
        console.log('已关闭全局代理设置');
        this._proxyEnabled = false;
      }

      // 停止子进程
      if (this._childProcess) {
        this._childProcess.kill();
        this._childProcess = null;
      }

      this._running = false;
      console.log('代理服务已停止');
    } catch (error) {
      console.error('停止代理服务失败:', error);
      // 强制清理
      if (this._childProcess) {
        this._childProcess.kill('SIGKILL');
        this._childProcess = null;
      }
      this._running = false;
      throw error;
    }
  }

  async _cleanup() {
    if (!this._running) return;
    try {
      await this.stop();
    } catch (error) {
      console.error('清理资源时出错:', error);
    }
  }

  get isRunning() {
    return this._running;
  }

  get proxyStatus() {
    return this._proxyEnabled;
  }

  loopFetchResponse(interval = 3000) {
    this._loopFetchResponseTimer = setInterval(async () => {
      const res = await networkCapture.fetchResponse();
      this.callbackList.forEach((func) => func(res));
    }, interval);
  }

  async fetchResponse() {
    if (!this.isRunning) return null;
    const baseUrl = `http://${this.host}:${this.port}/cgi-bin/get-data`;
    const queryParams = new URLSearchParams({
      clientId: this.clientId,
      startLogTime: '-2',
      startSvrLogTime: '-2',
      ids: '',
      status: '',
      startTime: this.lastRowId,
      dumpCount: '0',
      lastRowId: this.lastRowId,
      logId: '',
      count: '20',
      _: Date.now(),
    });

    try {
      const response = await fetch(`${baseUrl}?${queryParams.toString()}`, {
        method: 'GET',
        redirect: 'follow',
      });
      const res = await response.json();
      if (res.data?.lastId) this.lastRowId = res.data?.lastId
      return res;
    } catch (error) {
      console.error('Fetch error:', error.message);
      return null;
    }
  }

  onResponse(callback) {
    this.callbackList.push(callback);
  }

  clearCallback() {
    this.callbackList = [];
  }
}

const networkCapture = new NetworkCapture();
networkCapture.onResponse((res) => {
  console.log(res, `🚀 ~ networkCapture.onResponse ~ res:`);
});

networkCapture.start();
