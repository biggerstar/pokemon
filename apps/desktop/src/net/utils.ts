import fs from 'fs';
import http from 'http';
import { homedir } from 'os';
import path from 'path';
import sudoPromptModule from 'sudo-prompt';
import { parse } from 'url';
import * as whistleModule from 'whistle';
import requireW2 from 'whistle/require';
import config from '../../package.json' assert { type: 'json' };
import { getChild, getOptions, sendMsg } from './context';

const WHISTLE_PATH = whistleModule.getWhistlePath();
const noop = () => {};
const USERNAME = config.name;
const PROC_PATH = path.join(homedir(), '.whistle_client.pid');
const SCRIPT = path.join(import.meta.url, 'whistle.js');
const HTTPS_RE = /^https:\/\//;
const URL_RE = /^https?:\/\/\S/;
const LOCALHOST = '127.0.0.1';
const isMac = process.platform === 'darwin';
const IMPORT_URL_RE = /[?&#]data(?:_url|Url)=([^&#]+)(?:&|#|$)/;
const SUDO_OPTIONS = { name: 'Whistle' };

export const getDataUrl = (url) => {
  const result = IMPORT_URL_RE.exec(url);
  if (!result) {
    return;
  }
  let extractedUrl;
  [, extractedUrl] = result;
  try {
    extractedUrl = decodeURIComponent(extractedUrl).trim();
  } catch (e) {}
  return URL_RE.test(extractedUrl) ? extractedUrl : null;
};

export { isMac, LOCALHOST };
export const VERSION = config.version;
export const BASE_DIR = path.join(WHISTLE_PATH, '.whistle_client');
export const CLIENT_PLUGINS_PATH = path.join(WHISTLE_PATH, '.whistle_client_plugins');
export const CUSTOM_PLUGINS_PATH = path.join(WHISTLE_PATH, 'custom_plugins');
export const ICON = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/whistle.png');
export const DOCK_ICON = path.join(path.dirname(new URL(import.meta.url).pathname), '../public/dock.png');
export const TRAY_ICON = isMac ? path.join(path.dirname(new URL(import.meta.url).pathname), '../public/tray.png') : ICON;
export { noop, PROC_PATH, requireW2, SCRIPT, USERNAME };

export const sudoPrompt = (command, callback) => {
  sudoPromptModule.exec(command, SUDO_OPTIONS, callback);
};

const existsFile = (file) => new Promise((resolve) => {
  fs.stat(file, (err, stat) => {
    if (err) {
      return fs.stat(file, (_, s) => resolve(s && s.isFile()));
    }
    resolve(stat.isFile());
  });
});

const readFile = (file) => new Promise((resolve) => {
  fs.readFile(file, (err, buf) => {
    if (err) {
      return fs.readFile(file, (_, buf2) => resolve(buf2));
    }
    resolve(buf);
  });
});

export const compareFile = async (file1, file2) => {
  const exists = await existsFile(file1);
  if (!exists) {
    return false;
  }
  const [ctn1, ctn2] = await Promise.all([readFile(file1), readFile(file2)]);
  // @ts-ignore
  return ctn1 && ctn2 ? ctn1.equals(ctn2) : false;
};

const killProcess = (pid) => {
  if (pid) {
    try {
      process.kill(pid);
    } catch (e) {}
  }
};

export const closeWhistle = () => {
  const child = getChild();
  const curPid = child && child.pid;
  if (child) {
    child.removeAllListeners();
    child.on('error', noop);
  }
  if (curPid) {
    sendMsg({ type: 'exitWhistle' });
    killProcess(curPid);
  }
  try {
    const pid = +fs.readFileSync(PROC_PATH, { encoding: 'utf-8' }).split(',', 1)[0];
    if (pid !== curPid) {
      killProcess(pid);
    }
  } catch (e) {} finally {
    try {
      fs.unlinkSync(PROC_PATH);
    } catch (e) {}
  }
};

export const showWin = (win) => {
  if (!win) {
    return;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
};

export const getErrorMsg = (err) => {
  try {
    return err.message || err.stack || `${err}`;
  } catch (e) {}
  return 'Unknown Error';
};

export const getErrorStack = (err) => {
  if (!err) {
    return '';
  }

  let stack;
  try {
    stack = err.stack;
  } catch (e) {}
  stack = stack || err.message || err;
  const result = [
    `From: ${USERNAME}@${config.version}`,
    `Node: ${process.version}`,
    `Date: ${new Date().toLocaleString()}`,
    stack,
  ];
  return result.join('\r\n');
};

const parseJson = (str) => {
  try {
    return str && JSON.parse(str);
  } catch (e) {}
};

const getString = (str, len) => {
  if (typeof str !== 'string') {
    return '';
  }
  str = str.trim();
  return len ? str.substring(0, len) : str;
};

export { getString };

export const getJson = (requestUrl) => {
  const options = getOptions();
  if (!options) {
    return;
  }
  const isHttps = HTTPS_RE.test(requestUrl);
  let parsedUrl = parse(requestUrl.replace(HTTPS_RE, 'http://'));
  const headers = { host: parsedUrl.host };
  if (isHttps) {
    headers['x-whistle-https-request'] = '1';
  }
  //@ts-ignore
  parsedUrl.headers = headers;
  delete parsedUrl.hostname;
  parsedUrl.host = options.host || LOCALHOST;
  parsedUrl.port = options.port;
  return new Promise((resolve, reject) => {
    const handleError = (err) => {
      clearTimeout(timer);  // eslint-disable-line
      reject(err || new Error('Timeout'));
      client.destroy(); // eslint-disable-line
    };
    const timer = setTimeout(handleError, 16000);
    const client = http.get(parsedUrl, (res) => {
      res.on('error', handleError);
      if (res.statusCode !== 200) {
        return handleError(new Error(`Response code ${res.statusCode}`));
      }
      let body;
      res.on('data', (chunk) => {
        body = body ? Buffer.concat([body, chunk]) : chunk;
      });
      res.once('end', () => {
        clearTimeout(timer);
        resolve(parseJson(body && body.toString()));
      });
    });
    client.on('error', handleError);
  });
};
