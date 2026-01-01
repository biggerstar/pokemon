#!/usr/bin/env node

const os = require('os');
const path = require('path');

const platform = os.platform();
const homeDir = os.homedir();

let cacheDir;

if (process.env.ELECTRON_CACHE) {
  cacheDir = process.env.ELECTRON_CACHE;
} else {
  switch (platform) {
    case 'darwin':
      cacheDir = path.join(homeDir, 'Library', 'Caches', 'electron');
      break;
    case 'win32':
      cacheDir = path.join(
        process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
        'electron',
        'Cache',
      );
      break;
    case 'linux':
      cacheDir = path.join(
        process.env.XDG_CACHE_HOME || path.join(homeDir, '.cache'),
        'electron',
      );
      break;
    default:
      console.error(`不支持的平台: ${platform}`);
      process.exit(1);
  }
}

console.log(cacheDir);

