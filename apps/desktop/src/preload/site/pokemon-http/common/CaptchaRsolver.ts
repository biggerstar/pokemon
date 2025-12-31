import { CapMonsterCloudClientFactory, ClientOptions, RecaptchaV3ProxylessRequest } from '@zennolab_com/capmonstercloud-client';
import { POKEMONCENTER_RECAPTCHA_WEBSITE_KEY, TWO_CAPTCHA_CAPMONSTER_API_KEY } from '../http/constant';


export class CaptchaRsolver {
  static async resolveRecaptchaV3Enterprise(pageurl: string) {
    const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey: TWO_CAPTCHA_CAPMONSTER_API_KEY }));
    // console.log(await cmcClient.getBalance());

    const recaptchaV3ProxylessRequest = new RecaptchaV3ProxylessRequest({
      websiteURL: pageurl,
      websiteKey: POKEMONCENTER_RECAPTCHA_WEBSITE_KEY,
      minScore: 0.9,
    });

    return await cmcClient.Solve(recaptchaV3ProxylessRequest).then((result) => {
      return result.solution?.gRecaptchaResponse || null;
    });
  }
}
