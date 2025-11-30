import { type Session } from "electron";

// const privileges: Electron.Privileges = {
//   standard: true,
//   secure: false,
//   bypassCSP: true,
//   supportFetchAPI: true,
//   corsEnabled: true,
//   allowServiceWorkers: true,
// }

// protocol.registerSchemesAsPrivileged([
//   {
//     scheme: 'http',
//     privileges
//   },
//   {
//     scheme: 'https',
//     privileges
//   },
// ])

type ProcessHttpProtocolCallbackType = (request: Request, response: Response) => Promise<Response>

/**
 * 为某个持久化窗口注册网络拦截
*/
export function registerSchemesFingerprintBySession(
  session: Session,
  requestCallback: (request: Request) => Promise<Request | Response>,
  responseCallback: ProcessHttpProtocolCallbackType
): void {
  if (!session.protocol.isProtocolHandled('http')) {
    session.protocol.handle('http', async (_request) => {
      const requestOrResponse: Request | Response = await requestCallback(_request) || _request
      return responseCallback(
        _request,
        requestOrResponse instanceof Response ? requestOrResponse : await fetch(requestOrResponse)
      )
    })
  }

  if (!session.protocol.isProtocolHandled('https')) {
    session.protocol.handle('https', async (_request) => {
      const requestOrResponse: Request | Response = await requestCallback(_request) || _request
      return responseCallback(
        _request,
        requestOrResponse instanceof Response ? requestOrResponse : await fetch(requestOrResponse)
      )
    })
  }
}
