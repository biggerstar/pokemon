import { ipcMain } from 'electron';
import { AppConfigEntity } from '@/orm/entities/app-config';
import { AppDataSource } from '@/orm/data-source';
import { ensureDataSourceReady } from './utils';

interface CaptchaConfig {
  capmonsterToken: string;
  twoCaptchaToken: string;
  defaultService: 'capmonster' | '2captcha';
  developmentMode: boolean;
}

const CONFIG_KEYS = {
  CAPMONSTER_TOKEN: 'captcha_capmonster_token',
  TWO_CAPTCHA_TOKEN: 'captcha_2captcha_token',
  DEFAULT_SERVICE: 'captcha_default_service',
  DEVELOPMENT_MODE: 'development_mode',
} as const;

export async function getConfigValue(key: string): Promise<string> {
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
    const developmentMode = (await getConfigValue(CONFIG_KEYS.DEVELOPMENT_MODE)) === 'true';

    return {
      capmonsterToken,
      twoCaptchaToken,
      defaultService,
      developmentMode,
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
    developmentMode: boolean
  ) => {
    await setConfigValue(CONFIG_KEYS.CAPMONSTER_TOKEN, capmonsterToken);
    await setConfigValue(CONFIG_KEYS.TWO_CAPTCHA_TOKEN, twoCaptchaToken);
    await setConfigValue(CONFIG_KEYS.DEFAULT_SERVICE, defaultService);
    await setConfigValue(CONFIG_KEYS.DEVELOPMENT_MODE, developmentMode ? 'true' : 'false');

    return { success: true };
  });

  /**
   * 获取开发模式配置（供其他模块使用）
   */
  ipcMain.handle('get-development-mode', async (): Promise<boolean> => {
    const developmentMode = (await getConfigValue(CONFIG_KEYS.DEVELOPMENT_MODE)) === 'true';
    return developmentMode;
  });
}

