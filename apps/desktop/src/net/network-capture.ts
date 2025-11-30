import { globalMainPathParser } from '@/global/global-main-path-parser';
import globalProxy from '@xcodebuild/global-proxy';
import { fork } from 'child_process';
import merge from 'deepmerge';
import { dialog } from 'electron';
import path from 'path';
import process from "process";
import { fileURLToPath } from 'url';
import { disableProxy } from './proxy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPort = 12306;
const defalutHost = '127.0.0.1';

// 网络抓包模块
export class NetworkCapture {
  private _running = false;
  private _childProcess = null;
  private _proxyEnabled = false;
  private _loopFetchResponseTimer: any;
  private clientId: string;
  private lastRowId: string;
  public port: number;
  public host: string;
  public loopInterval: number = 500;
  private onResponseList: Function[] = [];
  private onResponseItemList: Function[] = [];
  private _nextNewIds: string[] = []
  private urlMap = new Map()
  public constructor() {
    // 确保进程退出时清理资源
    process.on('exit', this._cleanup.bind(this));
    process.on('SIGINT', this._cleanup.bind(this));
    process.on('SIGTERM', this._cleanup.bind(this));
    this.clientId = `${Date.now()}-100`;
    this.lastRowId = `${Date.now()}-0`;
  }

  public async start(options: { port?: number, host?: string } = {}) {
    this.port = options.port || defaultPort;
    this.host = options.host || defalutHost;
    if (this._running) {
      console.log('代理服务已经在运行中');
      return;
    }
    try {
      // 启动whistle代理服务子进程 
      // @ts-ignore
      this._childProcess = fork(globalMainPathParser.resolveAppRoot('whistle.js').toString(), {
        stdio: 'inherit',
        env: {
          PORT: this.port.toString(),
          LOCALHOST: this.host,
        },
      });

      // 设置全局代理
      await globalProxy.enable(this.host, this.port, 'http')
      await globalProxy.enable(this.host, this.port, 'https')

      this._proxyEnabled = true
      this._running = true;

      console.log('成功设置全局代理');
      this._loopFetchResponse();

      // 监听子进程退出
      this._childProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`代理服务异常退出，代码: ${code}`);
          // dialog.showErrorBox(`代理服务异常退出`, `可能是端口被占用 ${code}`);
          process.exit(1)
        }
        this._childProcess = null;
      });
    } catch (error) {
      console.error('启动代理服务失败:', error);
      dialog.showErrorBox('启动代理服务失败', error?.message || '')
      await this._cleanup();
      throw error;
    }
  }

  public async restart() {
    await this.stop()
    await this.start()
  }

  public async stop() {
    //@ts-ignore
    await globalProxy.disable('https')
    //@ts-ignore
    await globalProxy.disable('http')
    await disableProxy().catch(() => { disableProxy() });
    clearInterval(this._loopFetchResponseTimer);
    this.clearEvent();

    try {
      // 关闭全局代理
      this._proxyEnabled = false;

      // 停止子进程
      if (this._childProcess) {
        this._childProcess.kill();
        this._childProcess = null;
      }

      this._running = false;
      console.log('代理服务已停止');
    } catch (error) {
      console.error('停止代理服务失败:', error);
      dialog.showErrorBox('停止代理服务失败', error?.message || '')
      // 强制清理
      if (this._childProcess) {
        this._childProcess.kill('SIGKILL');
        this._childProcess = null;
      }
      this._running = false;
    }
  }

  private async _cleanup() {
    if (!this._running) return;
    try {
      await this.stop();
    } catch (error) {
      console.error('清理资源时出错:', error);
    }
  }

  public get isRunning() {
    return this._running;
  }

  public get proxyStatus() {
    return this._proxyEnabled;
  }

  private _loopFetchResponse() {
    this.urlMap = new Map()
    this._loopFetchResponseTimer = setInterval(async () => {
      let res
      try {
        res = await this.fetchResponse();
      } catch (_e) {
      }
      if (res) {
        this.onResponseList.forEach((func) => func(res));
        const dataList = Object.values(res.data?.data || {})
        dataList.forEach((item: Record<any, any>) => {
          const record: Record<any, any> = merge(item, this.urlMap.get(item.id) || {})
          this.urlMap.set(record.id, record)
          if (record.res?.base64 === undefined) return  // req
          this.onResponseItemList.forEach((func) => func(record))
        })
      }
      // 移除 三分钟前的映射
      this.urlMap.forEach((val, key) => {
        if (val.startTime + (1000 * 2 * 60) <= Date.now()) this.urlMap.delete(key)
      })
    }, this.loopInterval);
  }

  public async fetchResponse() {
    if (!this.isRunning) return null;
    const baseUrl = `http://${this.host}:${this.port}/cgi-bin/get-data`;
    const queryParams = new URLSearchParams(<any>{
      clientId: this.clientId,
      startLogTime: '-2',
      startSvrLogTime: '-2',
      ids: this._nextNewIds.join(','),
      status: this._nextNewIds.map(() => '0-0').join(','),
      startTime: this.lastRowId,
      lastRowId: this.lastRowId,
      dumpCount: '0',
      logId: '',
      count: '20',
      _: Date.now(),
    });

    try {
      const response = await fetch(`${baseUrl}?${queryParams.toString()}`, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'Accept': 'application/json'
        }
      });
      console.log('req')
      let res, resString
      try {
        resString = await response.text();
        res = JSON.parse(resString);
        console.log('req success')
      } catch (_e) {
        console.log('[fetchResponse]', _e.message, resString)
      }
      if (!res) return
      console.log('req end')
      if (res.data?.lastId) this.lastRowId = res.data?.lastId
      this._nextNewIds = [...res.data?.ids, ...res.data?.newIds]
        .filter((id) => {
          const data = this.urlMap.get(id)
          return data ? !data.res?.base64 : true
        })
        .reduce((arr, cur) => {
          if (!arr.includes(arr)) arr.push(cur)
          return arr;
        }, [])
      const maxIdCont = 260;
      if (this._nextNewIds.length > maxIdCont) {
        this._nextNewIds.splice(0, this._nextNewIds.length - 1 - maxIdCont)
      }
      console.log(this._nextNewIds.length);
      return res;
    } catch (error) {
      console.error('Fetch error:', error.message);
      return null;
    }
  }
  // 监控每次轮询结果请求
  public onResponse(callback) {
    this.onResponseList.push(callback);
  }
  // 监控每次轮询结果请求回来，获取到的请求抓包 item request & item response
  public onResponseItem(callback) {
    this.onResponseItemList.push(callback);
  }
  public clearEvent() {
    this.onResponseList = [];
    this.onResponseItemList = [];
  }
}

export const networkCapture = new NetworkCapture()
