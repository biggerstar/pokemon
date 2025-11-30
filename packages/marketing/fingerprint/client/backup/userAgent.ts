import type { Brand, Platform, UserAgentData } from '@marketing/fingerprint-server';
import { BasePropertyHooker } from '../src/common';


export const generateBrands = (brands: Brand[], agent: Platform) => {
  brands = Array.from(brands)
  if (brands.length <= 2) {
    brands.splice(1, 0, {
      brand: agent.name as string,
      version: agent.versionShort as string,
    });
  }
  return brands.map((brandData) => {
    const {brand} = brandData;
    if (brand === 'Not A(Brand') return brandData;
    return agent.versionShort ? {brand, version: agent.versionShort} : brandData;
  });
};

export function setupUserAgent(userAgent: UserAgentData) {
  const navigator = globalThis.navigator;
  // navigator.userAgent
  BasePropertyHooker.defineProperty(navigator, 'userAgent', {value: userAgent.userAgent});
  BasePropertyHooker.defineProperty(navigator, 'appName', {value: userAgent.appName});
  BasePropertyHooker.defineProperty(navigator, 'appCodeName', {value: userAgent.agent.appCodeName});
  BasePropertyHooker.defineProperty(navigator, 'appVersion', {value: userAgent.agent.appVersion});
  BasePropertyHooker.defineProperty(navigator, 'product', {value: userAgent.agent.layout});
  BasePropertyHooker.defineProperty(navigator, 'vendor', {value: userAgent.vendor});
  BasePropertyHooker.defineProperty(navigator, 'platform', {value: userAgent.platform});
  // console.log(navigator)
  // console.log(userAgent)
  // navigator.userAgentData
  // 只有 blink 内核有 userAgentData， See https://developer.mozilla.org/zh-CN/docs/Web/API/Navigator/userAgentData
  if (navigator.userAgentData &&
    userAgent.agent.layout &&
    ['Blink'].includes(userAgent.agent.layout)
  ) {
    const newBrands = generateBrands(navigator.userAgentData.brands, userAgent.agent);
    const resultAgentData: Record<string, any> = {
      mobile: userAgent.deviceCategory === 'mobile',
      platform: userAgent.platform,
      brands: newBrands,
    }
    BasePropertyHooker.defineProperty(navigator, 'userAgentData', {
      value: new Proxy(navigator.userAgentData, {
        get(target, prop: string) {
          if (prop === 'toJSON') return () => (resultAgentData);
          return resultAgentData[prop] || Reflect.get(target, prop);
        },
      }),
    });
  }
}
