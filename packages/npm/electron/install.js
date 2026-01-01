#!/usr/bin/env node

const extract = require('extract-zip');

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { version } = require('./package');

/**
 * 读取 $HOME 目录下的 electron.releases.config 文件获取用户名
 * 支持 Windows、Linux、macOS
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

if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
  process.exit(0);
}

const platformPath = getPlatformPath();

if (isInstalled()) {
  process.exit(0);
}

const platform = process.env.npm_config_platform || process.platform;
let arch = process.env.npm_config_arch || process.arch;

if (
  platform === 'darwin' &&
  process.platform === 'darwin' &&
  arch === 'x64' &&
  process.env.npm_config_arch === undefined
) {
  // When downloading for macOS ON macOS and we think we need x64 we should
  // check if we're running under rosetta and download the arm64 version if appropriate
  try {
    const output = childProcess.execSync('sysctl -in sysctl.proc_translated');
    if (output.toString().trim() === '1') {
      arch = 'arm64';
    }
  } catch {
    // Ignore failure
  }
}

downloadFromPrivateRepo()
  .then(extractFile)
  .catch((err) => {
    console.error('Custom download failed:', err);
    process.exit(1);
  });

function downloadFromPrivateRepo() {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    
    // 从配置文件读取仓库拥有者用户名
    let repositoryOwner;
    try {
      repositoryOwner = getRepositoryOwner();
      console.log(`Using repository owner: ${repositoryOwner}`);
    } catch (error) {
      reject(error);
      return;
    }

    // 定义要删除的缓存文件列表
    const filesToClean = [
      path.join(__dirname, 'dist'),
      path.join(__dirname, 'path.txt'),
      path.join(__dirname, 'electron.d.ts'),
      path.join(tempDir, `electron-v${version}-${platform}-${arch}.zip`)
    ];

    // 定义要下载的文件列表
    const downloadFiles = [
      {
        pattern: `electron-v${version}-${platform}-${arch}.zip`,
        isMainFile: true, // 标记主要文件（用于返回 zip 处理解压路径）
        targetDir: tempDir, // 下载到临时目录
      },
      {
        pattern: 'electron.d.ts',
        targetDir: __dirname, // 直接下载到包根目录
      },
    ];

    // 清理缓存：删除原来的文件和目录
    console.log('Cleaning cache before download...');
    filesToClean.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          console.log(`Removed ${path.basename(filePath)}`);
        }
      } catch (cleanupError) {
        console.warn(`Failed to remove ${path.basename(filePath)}:`, cleanupError.message);
      }
    });

    const mainFile = downloadFiles.find((file) => !!file.isMainFile);
    const mainFilePath = path.join(mainFile.targetDir, mainFile.pattern);

    // 构建下载模式参数
    const patterns = downloadFiles
      .map((file) => `--pattern "${file.pattern}"`)
      .join(' ');

    // 使用 GitHub CLI 下载所有文件到临时目录
    const ghCommand = `gh release download v${version} --repo ${repositoryOwner}/electron-releases ${patterns} --dir "${tempDir}" --clobber`;

    console.log('Executing GitHub CLI download...');
    childProcess.exec(ghCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('GitHub CLI download failed:', error.message);
        if (stderr) {
          console.error('Error details:', stderr);
        }
        reject(new Error(`GitHub CLI download failed: ${error.message}`));
        return;
      }

      // 检查主文件是否下载成功
      if (fs.existsSync(mainFilePath)) {
        const stats = fs.statSync(mainFilePath);
        if (stats.size > 0) {
          console.log(
            `Successfully downloaded ${mainFile.pattern} (${stats.size} bytes)`,
          );

          // 处理需要移动到特定目录的文件
          downloadFiles.forEach((file) => {
            if (!file.isMainFile && file.targetDir !== tempDir) {
              const sourceFile = path.join(tempDir, file.pattern);
              const targetFile = path.join(file.targetDir, file.pattern);

              if (fs.existsSync(sourceFile)) {
                try {
                  fs.copyFileSync(sourceFile, targetFile);
                  console.log(
                    `Successfully copied ${file.pattern} to ${file.targetDir}`,
                  );
                } catch (copyError) {
                  console.warn(
                    `Failed to copy ${file.pattern}:`,
                    copyError.message,
                  );
                }
              } else {
                console.warn(
                  `${file.pattern} not found in release, skipping...`,
                );
              }
            }
          });

          resolve(mainFilePath);
        } else {
          reject(new Error('Downloaded electron binary file is empty'));
        }
      } else {
        reject(new Error('Download failed - electron binary file not found'));
      }
    });
  });
}

function isInstalled() {
  try {
    if (
      fs
        .readFileSync(path.join(__dirname, 'dist', 'version'), 'utf-8')
        .replace(/^v/, '') !== version
    ) {
      return false;
    }

    if (
      fs.readFileSync(path.join(__dirname, 'path.txt'), 'utf-8') !==
      platformPath
    ) {
      return false;
    }
  } catch {
    return false;
  }

  const electronPath =
    process.env.ELECTRON_OVERRIDE_DIST_PATH ||
    path.join(__dirname, 'dist', platformPath);

  return fs.existsSync(electronPath);
}

// unzips and makes path.txt point at the correct executable
function extractFile(zipPath) {
  const distPath =
    process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(__dirname, 'dist');

  return extract(zipPath, { dir: path.join(__dirname, 'dist') }).then(() => {
    // If the zip contains an "electron.d.ts" file,
    // move that up
    const srcTypeDefPath = path.join(distPath, 'electron.d.ts');
    const targetTypeDefPath = path.join(__dirname, 'electron.d.ts');
    const hasTypeDefinitions = fs.existsSync(srcTypeDefPath);

    if (hasTypeDefinitions) {
      fs.renameSync(srcTypeDefPath, targetTypeDefPath);
    }

    // Write a "path.txt" file.
    return fs.promises.writeFile(
      path.join(__dirname, 'path.txt'),
      platformPath,
    );
  });
}

function getPlatformPath() {
  const platform = process.env.npm_config_platform || os.platform();

  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(
        'Electron builds are not available on platform: ' + platform,
      );
  }
}
