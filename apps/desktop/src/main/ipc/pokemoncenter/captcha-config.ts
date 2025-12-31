import { ipcMain } from 'electron';
import { AppConfigEntity } from '@/orm/entities/app-config';
import { AppDataSource } from '@/orm/data-source';
import { ensureDataSourceReady } from './utils';

interface CaptchaConfig {
  capmonsterToken: string;
  twoCaptchaToken: string;
  defaultService: 'capmonster' | '2captcha';
  enableDevTools: boolean;
}

const CONFIG_KEYS = {
  CAPMONSTER_TOKEN: 'captcha_capmonster_token',
  TWO_CAPTCHA_TOKEN: 'captcha_2captcha_token',
  DEFAULT_SERVICE: 'captcha_default_service',
  ENABLE_DEV_TOOLS: 'enable_dev_tools',
} as const;

async function getConfigValue(key: string): Promise<string> {
  await ensureDataSourceReady();
  const repo = AppDataSource.getRepository(AppConfigEntity);
  const config = await repo.findOne({ where: { key } });
  return config?.value || '';
}

async function setConfigValue(key: string, value: string): Promise<void> {
  await ensureDataSourceReady();
  const repo = AppDataSource.getRepository(AppConfigEntity);
  let config = await repo.findOne({ where: { key } });

  if (config) {
    config.value = value;
    await repo.save(config);
  } else {
    config = repo.create({ key, value });
    await repo.save(config);
  }
}

export function registerCaptchaConfigHandlers(ipcMain: typeof import('electron').ipcMain) {
  /**
   * 获取打码平台配置
   */
  ipcMain.handle('get-captcha-config', async (): Promise<CaptchaConfig> => {
    const capmonsterToken = await getConfigValue(CONFIG_KEYS.CAPMONSTER_TOKEN);
    const twoCaptchaToken = await getConfigValue(CONFIG_KEYS.TWO_CAPTCHA_TOKEN);
    const defaultServiceValue = await getConfigValue(CONFIG_KEYS.DEFAULT_SERVICE);
    const defaultService: 'capmonster' | '2captcha' = (defaultServiceValue === 'capmonster' || defaultServiceValue === '2captcha') ? defaultServiceValue : 'capmonster';
    const enableDevTools = (await getConfigValue(CONFIG_KEYS.ENABLE_DEV_TOOLS)) === 'true';

    return {
      capmonsterToken,
      twoCaptchaToken,
      defaultService,
      enableDevTools,
    };
  });

  /**
   * 保存打码平台配置
   */
  ipcMain.handle('save-captcha-config', async (
    _event,
    capmonsterToken: string,
    twoCaptchaToken: string,
    defaultService: 'capmonster' | '2captcha',
    enableDevTools: boolean
  ) => {
    await setConfigValue(CONFIG_KEYS.CAPMONSTER_TOKEN, capmonsterToken);
    await setConfigValue(CONFIG_KEYS.TWO_CAPTCHA_TOKEN, twoCaptchaToken);
    await setConfigValue(CONFIG_KEYS.DEFAULT_SERVICE, defaultService);
    await setConfigValue(CONFIG_KEYS.ENABLE_DEV_TOOLS, enableDevTools ? 'true' : 'false');

    return { success: true };
  });
}

