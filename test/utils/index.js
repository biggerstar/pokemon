
async function generateCert() {
  return new Promise((resolve) => {
      const keys = pki.rsa.generateKeyPair(2048);
      const cert = pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = new Date().getTime() + '';
      cert.validity.notBefore = new Date();
      cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 10);
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);

      const attrs = [
          {
              name: 'commonName',
              value: 'iProxy-' + new Date().toISOString().slice(0, 10),
          },
          {
              name: 'countryName',
              value: 'CN',
          },
          {
              shortName: 'ST',
              value: 'Hangzhou',
          },
          {
              name: 'localityName',
              value: 'Hangzhou',
          },
          {
              name: 'organizationName',
              value: 'iProxy',
          },
          {
              shortName: 'OU',
              value: 'https://github.com/xcodebuild/iproxy',
          },
      ];

      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.setExtensions([
          {
              name: 'basicConstraints',
              critical: true,
              cA: true,
          },
          {
              name: 'keyUsage',
              critical: true,
              keyCertSign: true,
          },
          {
              name: 'subjectKeyIdentifier',
          },
      ]);
      cert.sign(keys.privateKey, forge.md.sha256.create());
      const certPem = pki.certificateToPem(cert);
      const keyPem = pki.privateKeyToPem(keys.privateKey);

      resolve({
          key: keyPem,
          cert: certPem,
      });
  });
}


export async function installCertAndHelper() {
  console.log('Install cert');
  const certs = await generateCert()

  const dir = (await tempdir()).replace('ADMINI~1', 'Administrator');

  // 写入证书
  await fs.mkdirp(dir);
  await fs.writeFileAsync(path.join(dir, CERT_KEY_FILE_NAME), certs.key, 'utf-8');
  await fs.writeFileAsync(path.join(dir, CERT_FILE_NAME), certs.cert, 'utf-8');

  const formatPath = (path) => '"' + path + '"';

  const INSTALL_DONE_FILE = '/tmp/iproxy-install-done';
  // 信任证书 & 安装 helper
  const installPromise = new Promise((resolve, reject) => {
      if (SYSTEM_IS_MACOS) {
          // macOS big sur do not allow trust cert in any auto way
          // show box to guide user run command
          const showGuide = () => {
              const cmd = `echo "Please input local login password 请输入本地登录密码" && sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${path.join(
                  dir,
                  CERT_FILE_NAME,
              )}" && sudo cp ${formatPath(PROXY_CONF_HELPER_FILE_PATH)} ${formatPath(
                  PROXY_CONF_HELPER_PATH,
              )} && sudo chown root:admin ${formatPath(PROXY_CONF_HELPER_PATH)} && sudo chmod a+rx+s ${formatPath(
                  PROXY_CONF_HELPER_PATH,
              )} && touch ${INSTALL_DONE_FILE} && echo "安装完成"
              `;
              clipboard.writeText(cmd);

              dialog.showMessageBoxSync({
                  type: 'info',
                  message: `Paste command to your Terminal and run to install cert and helper
                  （命令已复制到剪贴板）粘贴命令到终端并运行以安装并信任证书
                  `,
              });
          };
          showGuide();
          while (!fs.existsSync(INSTALL_DONE_FILE)) {
              showGuide();
          }
          resolve(true);
      } else if (SYSTEM_IS_LINUX) {
          // only tested in deepin
          if (!shell.which('certutil')) {
              reject('证书未成功安装，请先确认libnss3-tools是否安装');
          } else {
              const command = `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n iProxy -i "${path.join(
                  dir,
                  CERT_FILE_NAME,
              )}" && touch ${INSTALL_DONE_FILE} && echo "安装完成"`;
              console.log('run command', command);
              try {
                  const output = execSync(command, {
                      // @ts-ignore
                      windowsHide: true,
                  });
                  console.log('certutil result', output.toString());
              } catch (e) {
                  // @ts-ignore
                  console.log('error', e.message, e.stderr.toString(), e.stdout.toString());
              }
          }
          resolve(true);
      } else {
          dialog.showMessageBoxSync({
              type: 'info',
              message: `The certificate and proxy helper is not installed or has expired. You need to install. You may need to enter the password of the login user.
      未安装证书/代理helper或者已经过期，需要安装，可能会需要输入登录用户的密码。
              `,
          });
          fs.copyFileSync(PROXY_CONF_HELPER_FILE_PATH, PROXY_CONF_HELPER_PATH);
          const command = `certutil -enterprise -f -v -AddStore "Root" "${path.join(
              dir,
              CERT_FILE_NAME,
          )}"  && sudo cp "${PROXY_CONF_HELPER_FILE_PATH}" "${PROXY_CONF_HELPER_PATH}" && sudo chown root:admin "${PROXY_CONF_HELPER_PATH}" && sudo chmod a+rx+s "${PROXY_CONF_HELPER_PATH}"`;
          console.log('run command', command);
          try {
              const output = execSync(command, {
                  // @ts-ignore
                  windowsHide: true,
              });
              console.log('certutil result', output.toString());
          } catch (e) {
              // @ts-ignore
              console.log('error', e.message, e.stderr.toString(), e.stdout.toString());
          }

          // windows dose not need install helper
          resolve(true);
      }
  });

  console.log('before install');
  try {
      await installPromise;
  } catch (e) {
      console.error(e);
      alertAndQuit();
      // prevent copy cert after failed
      return;
  }
  console.log('after install');
  // 信任完成，把证书目录拷贝过去
  await fs.copyAsync(dir, IPROXY_CERT_DIR_PATH);
  console.log('copy cert done');
}

