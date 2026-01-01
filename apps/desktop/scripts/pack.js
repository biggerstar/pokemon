#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');

// 获取 electron-builder 的参数
const args = process.argv.slice(2);

// 从参数中提取目标平台
let targetPlatform = '';
if (args.includes('--win')) {
  targetPlatform = 'win';
} else if (args.includes('--mac')) {
  targetPlatform = 'mac';
} else if (args.includes('--linux')) {
  targetPlatform = 'linux';
} else if (args.includes('--dir')) {
  // --dir 不指定平台，使用当前平台
  targetPlatform = '';
}

// 运行下载脚本
console.log('正在下载 Electron 文件...');
try {
  const downloadScript = path.join(__dirname, 'download-electron-for-builder.js');
  if (targetPlatform) {
    execSync(`node "${downloadScript}" ${targetPlatform}`, { stdio: 'inherit' });
  } else {
    execSync(`node "${downloadScript}"`, { stdio: 'inherit' });
  }
} catch (error) {
  console.error('下载 Electron 文件失败');
  process.exit(1);
}

// 构建前端
console.log('\n正在构建前端...');
try {
  execSync('pnpm -w run build', { stdio: 'inherit' });
} catch (error) {
  console.error('构建前端失败');
  process.exit(1);
}

// 运行 electron-builder
console.log('\n正在打包...');
const getCachePathScript = path.join(__dirname, 'get-electron-cache-path.js');
const cacheDir = execSync(`node "${getCachePathScript}"`, { encoding: 'utf8' }).trim();

const env = {
  ...process.env,
  ELECTRON_CACHE: cacheDir,
};

const electronBuilder = spawn('electron-builder', args, {
  env,
  stdio: 'inherit',
  shell: true,
});

electronBuilder.on('close', (code) => {
  process.exit(code || 0);
});

electronBuilder.on('error', (error) => {
  console.error('运行 electron-builder 失败:', error);
  process.exit(1);
});

