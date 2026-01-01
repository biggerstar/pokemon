#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 使用 require.resolve 动态查找 electron 包，不依赖绝对或相对路径
let version;
try {
  const electronPackagePath = require.resolve('electron/package.json');
  const electronPackage = require(electronPackagePath);
  version = electronPackage.version;
} catch (error) {
  console.error('无法找到 electron 包，请确保已安装 electron');
  process.exit(1);
}

/**
 * 读取 $HOME 目录下的 electron.releases.config 文件获取用户名
 * @returns {string} 用户名
 * @throws {Error} 当文件不存在或读取失败时抛出错误
 */
function getRepositoryOwner() {
  const homeDir = os.homedir();
  const configPath = path.join(homeDir, 'electron.releases.config');

  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const username = content.trim();

    if (!username) {
      throw new Error(`配置文件为空: ${configPath}`);
    }

    return username;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`配置文件不存在: ${configPath}`);
    } else if (error.code === 'EACCES') {
      throw new Error(`没有权限读取配置文件: ${configPath}`);
    } else {
      throw new Error(`读取配置文件失败: ${error.message}`);
    }
  }
}

/**
 * 获取 electron-builder 使用的缓存目录路径
 * electron-builder 内部使用 app-builder，它会检查 ELECTRON_CACHE 环境变量
 * 如果没有设置，app-builder 可能使用 electron-builder 特定的缓存路径
 * 但为了兼容性，我们使用 electron 的标准缓存路径
 * @returns {string} 缓存目录路径
 */
function getElectronCacheDir() {
  // 优先使用环境变量
  if (process.env.ELECTRON_CACHE) {
    return process.env.ELECTRON_CACHE;
  }

  const platform = os.platform();
  const homeDir = os.homedir();

  // electron-builder 使用的缓存路径
  // 注意：app-builder 可能会检查多个位置，我们使用标准的 electron 缓存路径
  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Caches', 'electron');
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local'),
        'electron',
        'Cache',
      );
    case 'linux':
      return path.join(
        process.env.XDG_CACHE_HOME || path.join(homeDir, '.cache'),
        'electron',
      );
    default:
      throw new Error(`不支持的平台: ${platform}`);
  }
}

/**
 * 根据打包目标确定需要下载的平台和架构
 * @param {string} targetPlatform - 目标平台 (win/mac/linux)
 * @returns {Array<{platform: string, arch: string}>} 需要下载的平台和架构列表
 */
function getTargetPlatformsAndArchs(targetPlatform) {
  const platforms = [];

  if (targetPlatform === 'win' || targetPlatform === 'win32') {
    platforms.push({ platform: 'win32', arch: 'x64' });
  } else if (targetPlatform === 'mac' || targetPlatform === 'darwin') {
    // macOS 可能需要 arm64 和 x64
    const currentArch = os.arch();
    if (currentArch === 'arm64') {
      platforms.push({ platform: 'darwin', arch: 'arm64' });
    }
    platforms.push({ platform: 'darwin', arch: 'x64' });
  } else if (targetPlatform === 'linux') {
    platforms.push({ platform: 'linux', arch: 'x64' });
  } else {
    // 默认下载当前平台的版本
    const currentPlatform = os.platform();
    const currentArch = os.arch();
    platforms.push({ platform: currentPlatform, arch: currentArch });
  }

  return platforms;
}

/**
 * 从私有仓库下载 electron zip 文件和相关文件
 * @param {string} platform - 平台 (win32/darwin/linux)
 * @param {string} arch - 架构 (x64/arm64)
 * @param {string} cacheDir - 缓存目录
 * @returns {Promise<string>} 下载的文件路径
 */
function downloadElectronZip(platform, arch, cacheDir) {
  return new Promise((resolve, reject) => {
    // 确保缓存目录存在
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const fileName = `electron-v${version}-${platform}-${arch}.zip`;
    const targetPath = path.join(cacheDir, fileName);

    // 如果文件已存在且大小大于 0，则跳过下载
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.size > 0) {
        console.log(`文件已存在，跳过下载: ${fileName}`);
        resolve(targetPath);
        return;
      }
    }

    // 从配置文件读取仓库拥有者用户名
    let repositoryOwner;
    try {
      repositoryOwner = getRepositoryOwner();
      console.log(`使用仓库拥有者: ${repositoryOwner}`);
    } catch (error) {
      reject(error);
      return;
    }

    // 需要下载的文件列表（包括校验文件）
    const filesToDownload = [
      fileName,
      'SHASUMS256.txt', // electron-builder 可能需要校验文件
    ];

    // 构建下载模式参数
    const patterns = filesToDownload
      .map((file) => `--pattern "${file}"`)
      .join(' ');

    // 使用 GitHub CLI 下载文件
    const ghCommand = `gh release download v${version} --repo ${repositoryOwner}/electron-releases ${patterns} --dir "${cacheDir}" --clobber`;

    console.log(`正在下载 ${fileName} 及相关文件...`);
    console.log(`执行命令: ${ghCommand}`);

    childProcess.exec(ghCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`GitHub CLI 下载失败: ${error.message}`);
        if (stderr) {
          console.error('错误详情:', stderr);
        }
        reject(new Error(`GitHub CLI 下载失败: ${error.message}`));
        return;
      }

      // 检查文件是否下载成功
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        if (stats.size > 0) {
          console.log(`成功下载 ${fileName} (${stats.size} 字节)`);

          // 检查校验文件是否下载成功
          const checksumPath = path.join(cacheDir, 'SHASUMS256.txt');
          if (fs.existsSync(checksumPath)) {
            console.log('校验文件下载成功: SHASUMS256.txt');
          } else {
            console.warn('警告: 校验文件 SHASUMS256.txt 未找到，但继续执行');
          }

          resolve(targetPath);
        } else {
          reject(new Error(`下载的文件为空: ${fileName}`));
        }
      } else {
        reject(new Error(`下载失败 - 文件未找到: ${fileName}`));
      }
    });
  });
}

/**
 * 主函数
 */
async function main() {
  // 从环境变量或命令行参数获取目标平台
  const targetPlatform = process.env.TARGET_PLATFORM || process.argv[2] || '';

  try {
    const cacheDir = getElectronCacheDir();
    console.log(`Electron 缓存目录: ${cacheDir}`);

    const platforms = getTargetPlatformsAndArchs(targetPlatform);
    console.log(`需要下载的平台和架构:`, platforms);

    // 下载所有需要的文件
    const downloadPromises = platforms.map(({ platform, arch }) =>
      downloadElectronZip(platform, arch, cacheDir),
    );

    await Promise.all(downloadPromises);
    console.log('\n所有 Electron 文件下载完成！');
    console.log(`文件已下载到缓存目录: ${cacheDir}`);
    console.log('\n提示: 如果 electron-builder 仍然尝试从网络下载，');
    console.log('可以设置环境变量 ELECTRON_CACHE 指向缓存目录:');
    console.log(`  export ELECTRON_CACHE="${cacheDir}"`);
    console.log('或者在 package.json 的脚本中设置该环境变量。');
  } catch (error) {
    console.error('下载 Electron 文件失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main();
