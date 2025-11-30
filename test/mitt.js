import { execSync } from 'child_process';
import fs from 'fs';
import { Proxy } from 'http-mitm-proxy';
import os from 'os';
import path from 'path';
import globalProxy from 'set-global-proxy';

class CertificateManager {
  constructor(certPath = './certs/root/rootCA.crt') {
    this.certPath = certPath;
    this.platform = os.platform();
    this.certName = 'MITM Proxy Root CA'; // 可配置的证书名称
    this.rootKeyPath = certPath.replace('.crt', '.key');
    this.certsDir = path.dirname(certPath);
  }

  // 获取证书的实际名称（从证书文件中读取）
  getCertificateName() {
    try {
      const certInfo = execSync(`openssl x509 -in "${this.certPath}" -subject -noout`, { encoding: 'utf8' });
      // 解析 subject 中的 CN (Common Name)
      const cnMatch = certInfo.match(/CN\s*=\s*([^,\n]+)/);
      if (cnMatch && cnMatch[1]) {
        this.certName = cnMatch[1].trim();
        console.log(`检测到证书名称: ${this.certName}`);
        return this.certName;
      }
    } catch (error) {
      console.log('无法读取证书名称，使用默认名称');
    }
    return this.certName;
  }

  // 生成根证书（如果不存在）
  generateRootCertificate() {
    if (fs.existsSync(this.certPath) && fs.existsSync(this.rootKeyPath)) {
      console.log('根证书已存在，跳过生成');
      return;
    }

    console.log('生成根证书...');
    
    // 确保目录存在
    const rootDir = path.dirname(this.certPath);
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }

    try {
      // 生成根证书私钥
      execSync(`openssl genrsa -out "${this.rootKeyPath}" 2048`, { stdio: 'inherit' });
      
      // 生成根证书
      const certConfig = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_ca
prompt = no

[req_distinguished_name]
C = CN
ST = Beijing
L = Beijing
O = MITM Proxy
OU = Root CA
CN = MITM Proxy Root CA

[v3_ca]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer:always
basicConstraints = CA:true
keyUsage = keyCertSign, cRLSign
`;
      
      const configPath = path.join(rootDir, 'root.conf');
      fs.writeFileSync(configPath, certConfig);
      
      execSync(`openssl req -new -x509 -key "${this.rootKeyPath}" -out "${this.certPath}" -days 3650 -config "${configPath}"`, { stdio: 'inherit' });
      
      // 清理配置文件
      fs.unlinkSync(configPath);
      
      console.log('✓ 根证书生成成功');
    } catch (error) {
      console.error('生成根证书失败:', error.message);
      throw error;
    }
  }

  // 为特定hostname生成证书
  generateHostCertificate(hostname) {
    const hostKeyPath = path.join(this.certsDir, `${hostname}.key`);
    const hostCertPath = path.join(this.certsDir, `${hostname}.crt`);
    
    // 如果证书已存在，直接返回
    if (fs.existsSync(hostKeyPath) && fs.existsSync(hostCertPath)) {
      return { keyFile: hostKeyPath, certFile: hostCertPath };
    }

    console.log(`为 ${hostname} 生成证书...`);

    try {
      // 生成主机私钥
      execSync(`openssl genrsa -out "${hostKeyPath}" 2048`, { stdio: 'pipe' });
      
      // 创建证书签名请求配置
      const csrConfig = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = CN
ST = Beijing
L = Beijing
O = MITM Proxy
OU = Host Certificate
CN = ${hostname}

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${hostname}
DNS.2 = *.${hostname}
`;

      const csrConfigPath = path.join(this.certsDir, `${hostname}.conf`);
      fs.writeFileSync(csrConfigPath, csrConfig);
      
      // 生成证书签名请求
      const csrPath = path.join(this.certsDir, `${hostname}.csr`);
      execSync(`openssl req -new -key "${hostKeyPath}" -out "${csrPath}" -config "${csrConfigPath}"`, { stdio: 'pipe' });
      
      // 使用根证书签名
      execSync(`openssl x509 -req -in "${csrPath}" -CA "${this.certPath}" -CAkey "${this.rootKeyPath}" -CAcreateserial -out "${hostCertPath}" -days 365 -extensions v3_req -extfile "${csrConfigPath}"`, { stdio: 'pipe' });
      
      // 清理临时文件
      fs.unlinkSync(csrPath);
      fs.unlinkSync(csrConfigPath);
      
      console.log(`✓ ${hostname} 证书生成成功`);
      
      return { keyFile: hostKeyPath, certFile: hostCertPath };
    } catch (error) {
      console.error(`为 ${hostname} 生成证书失败:`, error.message);
      throw error;
    }
  }

  // 安装证书到系统信任存储
  async installCertificate() {
    console.log(`检测到操作系统: ${this.platform}`);
    
    if (!fs.existsSync(this.certPath)) {
      throw new Error(`证书文件不存在: ${this.certPath}`);
    }

    // 获取证书实际名称
    this.getCertificateName();

    switch (this.platform) {
      case 'darwin':
        return this.installOnMacOS();
      case 'win32':
        return this.installOnWindows();
      case 'linux':
        return this.installOnLinux();
      default:
        throw new Error(`不支持的操作系统: ${this.platform}`);
    }
  }

  // macOS 安装 - 改进版本
  installOnMacOS() {
    console.log('正在安装证书到 macOS 系统钥匙串...');
    
    // 首先尝试安装到用户钥匙串（更可靠）
    try {
      console.log('安装到用户钥匙串...');
      
      // 先删除可能存在的旧证书
      try {
        execSync(`security delete-certificate -c "${this.certName}" ~/Library/Keychains/login.keychain`, { stdio: 'pipe' });
        console.log('已删除旧证书');
      } catch (e) {
        // 忽略删除失败（可能本来就不存在）
      }
      
      // 添加证书到用户钥匙串
      execSync(`security add-certificates -k ~/Library/Keychains/login.keychain "${this.certPath}"`, { stdio: 'inherit' });
      console.log('证书已添加到用户钥匙串');
      
      // 设置为受信任
      execSync(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain "${this.certPath}"`, { stdio: 'inherit' });
      console.log('✓ 证书已设置为受信任');
      
      return true;
      
    } catch (error) {
      console.error('用户钥匙串安装失败:', error.message);
      
      // 尝试系统钥匙串（需要 sudo）
      try {
        console.log('尝试安装到系统钥匙串（需要管理员权限）...');
        execSync(`sudo security add-trusted-cert -d -r trustRoot -k "/Library/Keychains/System.keychain" "${this.certPath}"`, { stdio: 'inherit' });
        console.log('✓ 证书已成功安装到系统钥匙串');
        return true;
      } catch (systemError) {
        console.error('系统钥匙串安装也失败:', systemError.message);
        this.showMacOSManualInstructions();
        return false;
      }
    }
  }

  // Windows 安装
  installOnWindows() {
    console.log('正在安装证书到 Windows 信任根证书存储...');
    
    try {
      // 方法1: 使用 certutil 命令
      const certutilCommand = `certutil -addstore -f "ROOT" "${this.certPath}"`;
      execSync(certutilCommand, { stdio: 'inherit' });
      
      console.log('✓ 证书已成功安装到 Windows 信任根证书存储');
      return true;
      
    } catch (error) {
      console.log('certutil 安装失败，尝试 PowerShell 方式...');
      
      try {
        // 方法2: 使用 PowerShell
        const powershellCommand = `powershell -Command "Import-Certificate -FilePath '${this.certPath}' -CertStoreLocation Cert:\\LocalMachine\\Root"`;
        execSync(powershellCommand, { stdio: 'inherit' });
        
        console.log('✓ 证书已通过 PowerShell 安装');
        return true;
        
      } catch (psError) {
        console.error('PowerShell 安装也失败:', psError.message);
        this.showWindowsManualInstructions();
        return false;
      }
    }
  }

  // Linux 安装
  installOnLinux() {
    console.log('正在安装证书到 Linux 系统...');
    
    try {
      // 检查不同发行版的证书目录
      const possibleDirs = [
        '/usr/local/share/ca-certificates',
        '/etc/ssl/certs',
        '/usr/share/ca-certificates'
      ];
      
      let certDir = null;
      for (const dir of possibleDirs) {
        if (fs.existsSync(dir)) {
          certDir = dir;
          break;
        }
      }
      
      if (!certDir) {
        throw new Error('找不到系统证书目录');
      }
      
      const destPath = path.join(certDir, 'mitm-proxy-root-ca.crt');
      
      // 复制证书文件
      execSync(`sudo cp "${this.certPath}" "${destPath}"`, { stdio: 'inherit' });
      execSync(`sudo chmod 644 "${destPath}"`, { stdio: 'inherit' });
      
      // 更新证书存储
      if (fs.existsSync('/usr/sbin/update-ca-certificates')) {
        execSync('sudo update-ca-certificates', { stdio: 'inherit' });
      } else if (fs.existsSync('/usr/bin/update-ca-trust')) {
        execSync('sudo update-ca-trust', { stdio: 'inherit' });
      }
      
      console.log('✓ 证书已成功安装到 Linux 系统');
      return true;
      
    } catch (error) {
      console.error('Linux 安装失败:', error.message);
      this.showLinuxManualInstructions();
      return false;
    }
  }

  // 改进的验证函数
  verifyCertificate() {
    console.log('验证证书安装状态...');
    try {
      switch (this.platform) {
        case 'darwin':
          return this.verifyMacOS();
        case 'win32':
          return this.verifyWindows();
        case 'linux':
          return this.verifyLinux();
        default:
          return false;
      }
    } catch (error) {
      console.error('验证证书安装失败:', error.message);
      return false;
    }
  }

  verifyMacOS() {
    try {
      // 使用证书的实际名称进行搜索
      console.log(`搜索证书: ${this.certName}`);
      
      // 先检查用户钥匙串
      try {
        const userResult = execSync(`security find-certificate -c "${this.certName}" ~/Library/Keychains/login.keychain`, { encoding: 'utf8' });
        if (userResult.includes(this.certName)) {
          console.log('✓ 在用户钥匙串中找到证书');
          return true;
        }
      } catch (userError) {
        console.log('用户钥匙串中未找到证书');
      }
      
      // 再检查系统钥匙串
      try {
        const systemResult = execSync(`security find-certificate -c "${this.certName}" /Library/Keychains/System.keychain`, { encoding: 'utf8' });
        if (systemResult.includes(this.certName)) {
          console.log('✓ 在系统钥匙串中找到证书');
          return true;
        }
      } catch (systemError) {
        console.log('系统钥匙串中未找到证书');
      }
      
      // 尝试更宽泛的搜索
      try {
        const broadResult = execSync(`security find-certificate -a -c "${this.certName}"`, { encoding: 'utf8' });
        if (broadResult.includes(this.certName)) {
          console.log('✓ 在钥匙串中找到证书');
          return true;
        }
      } catch (broadError) {
        console.log('广泛搜索也未找到证书');
      }
      
      return false;
    } catch (error) {
      console.error('macOS 验证失败:', error.message);
      return false;
    }
  }

  verifyWindows() {
    try {
      const result = execSync('certutil -store root', { encoding: 'utf8' });
      return result.includes(this.certName);
    } catch (error) {
      console.error('Windows 验证失败:', error.message);
      return false;
    }
  }

  verifyLinux() {
    const possiblePaths = [
      '/usr/local/share/ca-certificates/mitm-proxy-root-ca.crt',
      '/etc/ssl/certs/mitm-proxy-root-ca.crt',
      '/usr/share/ca-certificates/mitm-proxy-root-ca.crt'
    ];
    
    for (const certPath of possiblePaths) {
      if (fs.existsSync(certPath)) {
        try {
          const result = execSync(`openssl x509 -in "${certPath}" -text -noout`, { encoding: 'utf8' });
          if (result.includes(this.certName)) {
            console.log(`✓ 在 ${certPath} 找到证书`);
            return true;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    console.log('Linux 系统中未找到证书');
    return false;
  }

  // 卸载证书
  async uninstallCertificate() {
    console.log('正在卸载证书...');
    this.getCertificateName();
    
    switch (this.platform) {
      case 'darwin':
        return this.uninstallMacOS();
      case 'win32':
        return this.uninstallWindows();
      case 'linux':
        return this.uninstallLinux();
      default:
        throw new Error(`不支持的操作系统: ${this.platform}`);
    }
  }

  uninstallMacOS() {
    let success = false;
    
    try {
      // 从用户钥匙串删除
      execSync(`security delete-certificate -c "${this.certName}" ~/Library/Keychains/login.keychain`, { stdio: 'inherit' });
      console.log('✓ 证书已从用户钥匙串中删除');
      success = true;
    } catch (e) {
      console.log('用户钥匙串中没有找到证书');
    }
    
    try {
      // 从系统钥匙串删除
      execSync(`sudo security delete-certificate -c "${this.certName}" /Library/Keychains/System.keychain`, { stdio: 'inherit' });
      console.log('✓ 证书已从系统钥匙串中删除');
      success = true;
    } catch (e) {
      console.log('系统钥匙串中没有找到证书');
    }
    
    return success;
  }

  uninstallWindows() {
    try {
      execSync(`certutil -delstore root "${this.certName}"`, { stdio: 'inherit' });
      console.log('✓ 证书已从 Windows 信任存储中删除');
      return true;
    } catch (error) {
      console.error('Windows 卸载失败:', error.message);
      return false;
    }
  }

  uninstallLinux() {
    const possiblePaths = [
      '/usr/local/share/ca-certificates/mitm-proxy-root-ca.crt',
      '/etc/ssl/certs/mitm-proxy-root-ca.crt',
      '/usr/share/ca-certificates/mitm-proxy-root-ca.crt'
    ];
    
    let success = false;
    
    for (const certPath of possiblePaths) {
      if (fs.existsSync(certPath)) {
        try {
          execSync(`sudo rm "${certPath}"`, { stdio: 'inherit' });
          console.log(`✓ 已删除 ${certPath}`);
          success = true;
        } catch (error) {
          console.error(`删除 ${certPath} 失败:`, error.message);
        }
      }
    }
    
    if (success) {
      try {
        if (fs.existsSync('/usr/sbin/update-ca-certificates')) {
          execSync('sudo update-ca-certificates', { stdio: 'inherit' });
        } else if (fs.existsSync('/usr/bin/update-ca-trust')) {
          execSync('sudo update-ca-trust', { stdio: 'inherit' });
        }
        console.log('✓ 证书存储已更新');
      } catch (error) {
        console.error('更新证书存储失败:', error.message);
      }
    }
    
    return success;
  }

  // 显示证书信息
  showCertificateInfo() {
    if (!fs.existsSync(this.certPath)) {
      console.log('证书文件不存在');
      return;
    }

    try {
      const certInfo = execSync(`openssl x509 -in "${this.certPath}" -text -noout`, { encoding: 'utf8' });
      console.log('=== 证书信息 ===');
      console.log(certInfo);
    } catch (error) {
      console.error('读取证书信息失败:', error.message);
    }
  }

  // 显示手动安装说明
  showMacOSManualInstructions() {
    console.log('\n=== macOS 手动安装说明 ===');
    console.log('请手动双击证书文件进行安装:');
    console.log(`1. 双击证书文件: ${this.certPath}`);
    console.log('2. 选择"登录"钥匙串（推荐）或"系统"钥匙串');
    console.log('3. 点击"添加"按钮');
    console.log('4. 在钥匙串访问中找到证书，双击打开');
    console.log('5. 展开"信任"部分，将"使用此证书时"设置为"始终信任"');
    console.log('6. 关闭窗口并输入密码确认更改');
  }

  showWindowsManualInstructions() {
    console.log('\n=== Windows 手动安装说明 ===');
    console.log('请以管理员身份运行以下命令:');
    console.log(`certutil -addstore -f "ROOT" "${this.certPath}"`);
    console.log('\n或者使用图形界面:');
    console.log('1. 双击证书文件');
    console.log('2. 点击"安装证书"');
    console.log('3. 选择"本地计算机"');
    console.log('4. 选择"将所有的证书都放入下列存储"');
    console.log('5. 浏览并选择"受信任的根证书颁发机构"');
    console.log('6. 完成安装');
  }

  showLinuxManualInstructions() {
    console.log('\n=== Linux 手动安装说明 ===');
    console.log('Ubuntu/Debian:');
    console.log(`sudo cp "${this.certPath}" /usr/local/share/ca-certificates/mitm-proxy-root-ca.crt`);
    console.log('sudo update-ca-certificates');
    console.log('\nCentOS/RHEL/Fedora:');
    console.log(`sudo cp "${this.certPath}" /etc/pki/ca-trust/source/anchors/mitm-proxy-root-ca.crt`);
    console.log('sudo update-ca-trust');
  }
}

// 主入口函数
async function installCertificate(certPath = './certs/root/rootCA.crt') {
  console.log('🚀 开始自动安装证书...');
  console.log('==========================================');
  
  try {
    const manager = new CertificateManager(certPath);
    
    // 生成根证书（如果不存在）
    manager.generateRootCertificate();
    
    // 显示证书信息
    console.log('📋 证书信息:');
    console.log(`证书路径: ${certPath}`);
    console.log(`操作系统: ${manager.platform}`);
    console.log('');
    
    // 安装证书
    const installSuccess = await manager.installCertificate();
    
    if (installSuccess) {
      console.log('');
      console.log('🔍 验证安装结果...');
      
      // 等待一下，让系统处理证书
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const verified = manager.verifyCertificate();
      
      if (verified) {
        console.log('');
        console.log('🎉 证书安装并验证成功！');
        console.log('✅ 证书已被系统信任，可以正常使用');
      } else {
        console.log('');
        console.log('⚠️  证书已安装，但验证时未找到');
        console.log('💡 可能的原因：');
        console.log('   - 证书名称与搜索条件不匹配');
        console.log('   - 需要重启浏览器或应用程序');
        console.log('   - 系统需要时间更新证书缓存');
      }
    } else {
      console.log('');
      console.log('❌ 自动安装失败');
      console.log('📖 请参考上方的手动安装说明');
    }
    
    return installSuccess;
    
  } catch (error) {
    console.error('');
    console.error('💥 安装过程中发生错误:', error.message);
    return false;
  }
}

// 卸载证书的入口函数
async function uninstallCertificate(certPath = './certs/root/rootCA.crt') {
  console.log('🗑️  开始卸载证书...');
  console.log('==========================================');
  
  try {
    const manager = new CertificateManager(certPath);
    const success = await manager.uninstallCertificate();
    
    if (success) {
      console.log('');
      console.log('🎉 证书卸载成功！');
    } else {
      console.log('');
      console.log('⚠️  证书卸载可能不完整，请检查手动清理');
    }
    
    return success;
    
  } catch (error) {
    console.error('');
    console.error('💥 卸载过程中发生错误:', error.message);
    return false;
  }
}

// 验证证书的入口函数
async function verifyCertificate(certPath = './certs/root/rootCA.crt') {
  console.log('🔍 验证证书状态...');
  console.log('==========================================');
  
  try {
    const manager = new CertificateManager(certPath);
    const verified = manager.verifyCertificate();
    
    if (verified) {
      console.log('✅ 证书已正确安装并被系统信任');
    } else {
      console.log('❌ 证书未安装或不被信任');
    }
    
    return verified;
    
  } catch (error) {
    console.error('💥 验证过程中发生错误:', error.message);
    return false;
  }
}

// MITM 代理服务器
async function startMitmProxy(certPath = './certs/root/rootCA.crt') {
  console.log('');
  console.log('🔧 启动 MITM 代理服务器...');
  console.log('==========================================');
  
  const port = 8899;
  const localhost = '127.0.0.1';
  
  try {
    const manager = new CertificateManager(certPath);
    
    // 确保根证书存在
    manager.generateRootCertificate();
    
    const proxy = new Proxy();
    
    // 动态生成证书
    proxy.onCertificateRequired = function(hostname, callback) {
      try {
        console.log(`📋 为 ${hostname} 生成证书...`);
        const certFiles = manager.generateHostCertificate(hostname);
        return callback(null, certFiles);
      } catch (error) {
        console.error(`为 ${hostname} 生成证书失败:`, error.message);
        return callback(error);
      }
    };
    
    // 错误处理
    proxy.onError(function (ctx, err) {
      console.error('代理错误:', err.message);
    });
    
    // 请求处理
    proxy.onRequest(function (ctx, callback) {
      const host = ctx.clientToProxyRequest.headers.host;
      const url = ctx.clientToProxyRequest.url;
      
      console.log(`📝 请求: ${host}${url}`);
      
      // 示例：修改 Google 搜索页面
      if (host === 'www.google.com' && url.indexOf('/search') === 0) {
        ctx.use(Proxy.gunzip);
        
        ctx.onResponseData(function (ctx, chunk, callback) {
          try {
            const modified = chunk.toString().replace(
              /<title>.*?<\/title>/gi, 
              '<title>Pwned Google Search!</title>'
            );
            chunk = Buffer.from(modified);
            console.log('✅ 已修改 Google 搜索页面');
          } catch (error) {
            console.error('修改响应数据失败:', error.message);
          }
          return callback(null, chunk);
        });
      }
      
      return callback();
    });
    
    // 启动代理服务器
    proxy.listen({ port }, (err) => {
      if (err) {
        console.error('启动代理服务器失败:', err);
        return;
      }
      console.log(`✅ MITM 代理服务器已启动在 ${localhost}:${port}`);
    });
    
    // 设置全局代理
    try {
      const isSettingSuccess = globalProxy.enableProxy({
        host: localhost,
        port: port,
        sudo: true,
      });
      
      if (isSettingSuccess) {
        console.log('✅ 成功设置全局代理');
        console.log('');
        console.log('🎯 测试说明：');
        console.log('1. 现在可以在浏览器中访问 https://www.google.com/search?q=test');
        console.log('2. 如果证书安装成功，页面应该正常加载（无证书警告）');
        console.log('3. Google 搜索页面的标题会被修改为 "Pwned Google Search!"');
        console.log('4. 控制台会显示所有经过代理的请求');
        console.log('');
        console.log('⚠️  测试完成后，请按 Ctrl+C 停止代理服务器');
      } else {
        console.log('❌ 设置全局代理失败，请手动配置代理设置');
        console.log(`   代理地址: ${localhost}:${port}`);
        console.log('   协议类型: HTTP/HTTPS');
      }
    } catch (proxyError) {
      console.error('设置全局代理时出错:', proxyError.message);
      console.log(`请手动设置代理: ${localhost}:${port}`);
    }
    
    // 优雅关闭处理
    process.on('SIGINT', () => {
      console.log('\n');
      console.log('🔄 正在关闭代理服务器...');
      
      try {
        // 恢复系统代理设置
        globalProxy.disableProxy();
        console.log('✅ 已恢复系统代理设置');
      } catch (error) {
        console.log('⚠️  恢复系统代理设置失败，请手动关闭代理');
      }
      
      process.exit(0);
    });
    
  } catch (error) {
    console.error('启动 MITM 代理服务器失败:', error.message);
    throw error;
  }
}

// 完整的测试流程
async function runFullTest(certPath = './certs/root/rootCA.crt') {
  console.log('🚀 开始完整的证书安装和代理测试...');
  console.log('==========================================');
  
  try {
    // 步骤1: 安装证书
    console.log('📋 步骤 1: 安装根证书');
    const installSuccess = await installCertificate(certPath);
    
    if (!installSuccess) {
      console.log('❌ 证书安装失败，跳过代理测试');
      return false;
    }
    
    // 等待用户确认
    console.log('');
    console.log('⏸️  请确认：');
    console.log('1. 证书是否已正确安装到系统信任存储？');
    console.log('2. 如果是 macOS，是否已在钥匙串访问中将证书设置为"始终信任"？');
    console.log('3. 准备好开始代理测试了吗？');
    console.log('');
    console.log('按 Enter 键继续，或按 Ctrl+C 退出...');
    
    // 简单的等待用户输入
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
    
    // 步骤2: 启动代理服务器
    console.log('📋 步骤 2: 启动 MITM 代理服务器');
    await startMitmProxy(certPath);
    
  } catch (error) {
    console.error('完整测试过程中发生错误:', error.message);
    return false;
  }
}

// 导出函数供外部使用
export {
  CertificateManager,
  installCertificate, runFullTest, startMitmProxy, uninstallCertificate,
  verifyCertificate
};

// 如果直接运行此文件，执行完整测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  const certPath = process.argv[3] || './certs/root/rootCA.crt';
  
  switch (command) {
    case 'install':
      installCertificate(certPath).then(success => {
        process.exit(success ? 0 : 1);
      });
      break;
    case 'uninstall':
      uninstallCertificate(certPath).then(success => {
        process.exit(success ? 0 : 1);
      });
      break;
    case 'verify':
      verifyCertificate(certPath).then(success => {
        process.exit(success ? 0 : 1);
      });
      break;
    case 'proxy':
      startMitmProxy(certPath).catch(error => {
        console.error(error);
        process.exit(1);
      });
      break;
    case 'test':
    default:
      runFullTest(certPath).catch(error => {
        console.error(error);
        process.exit(1);
      });
      break;
  }
}
