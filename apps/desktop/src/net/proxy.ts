import path from 'path';
import {
  BASE_DIR,
  compareFile,
  LOCALHOST,
  sudoPrompt
} from './utils';

import globalProxy from 'set-global-proxy';

const PROXY_HELPER = path.join(BASE_DIR, 'whistle');

const installProxyHelper = async () => {
  const originHelper = globalProxy.getMacProxyHelper();
  if (!originHelper) {
    return;
  }
  if (globalProxy.getUid(PROXY_HELPER) === 0 && (await compareFile(PROXY_HELPER, originHelper))) {
    return;
  }
  const command = `cp "${originHelper}" "${PROXY_HELPER}" && chown root:admin "${PROXY_HELPER}" && chmod a+rx+s "${PROXY_HELPER}"`;
  return new Promise((resolve, reject) => {
    sudoPrompt(command, (err, stdout) => {
      if (err) {
        return reject(err);
      }
      resolve(stdout);
    });
  });
};

export const enableProxy = async (options) => {
  await installProxyHelper();
  globalProxy.enableProxy({
    port: options.port,
    host: options.host || LOCALHOST,
    bypass: options.bypass,
    //@ts-ignore
    proxyHelper: PROXY_HELPER,
  });
};

export const disableProxy = async (_?) => {
  await installProxyHelper();
  //@ts-ignore
  globalProxy.disableProxy(PROXY_HELPER);
};
