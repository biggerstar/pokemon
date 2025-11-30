import { CryptoHandle } from "./crypto";

export class SocketHandle {
  ws: WebSocket | null = null
  _onMessageFunc: Function | null = null
  receive(ev: MessageEvent) {
    CryptoHandle
      .receive(ev)
      .then((data) => {
        this._onMessageFunc?.(data)
      })
  }
  send(data: Record<string, any>) {
    console.info('send', data)
    return CryptoHandle.send(this.ws!, data)
  }
  onmessage(func: Function) {
    this._onMessageFunc = func
  }
}


export function hookSocket(socketHandle: SocketHandle) {
  const originSocket = window.WebSocket;
  (window as any).WebSocket = function (...args: any[]) {
    // @ts-ignore
    const ws = new originSocket(...args);
    // console.info('new WebSocket', ws)
    socketHandle.ws = ws
    setTimeout(() => {
      const originSend = ws.send;
      let callback: Function | null = ws.onmessage || null;

      ws.send = function (...args: any[]) {
        return originSend.apply(this, args);
      };
      ws.onmessage = function (evt) {
        callback && callback(evt);
        socketHandle.receive(evt)
      };
      Object.defineProperty(ws, "onmessage", {
        get: () => {
          return callback;
        },
        set: (setCall) => {
          console.info('set onmessage', setCall)
          callback = setCall;
        },
      });
    }, 50)
    return ws;
  };
}
