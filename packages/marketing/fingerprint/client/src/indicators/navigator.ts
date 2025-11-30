import type { Brand, FingerPrintGenerator, Platform, UserAgentData } from '@marketing/fingerprint-server';
import { fakeFunctionPrototype, mergeObjectAttribute } from '../utils/prototype';


/**
 * 生成品牌列表
 * @param brands 品牌列表
 * @param agent 浏览器信息
 * @param isFullVersion 是否为完整版本号， 如果没有指定，则使用主版本号
 * @returns 品牌列表
 */
export const generateBrands = (brands: Brand[], agent: Platform, isFullVersion: boolean = false) => {
  const version = isFullVersion ? agent.version as string : agent.versionShort as string
  const notBrandItem = Array.from(brands).find((brand) => ['Not A(Brand', 'Not:A-Brand'].includes(brand.brand))

  const chromiumBrand = {
    brand: 'Chromium',
    version,
  }

  const currentBrand = {
    brand: agent.name as string,
    version,
  }
  return [notBrandItem, chromiumBrand, currentBrand]
};

export function setupNavigator(targetWindow: WindowProxy, fingerPrint: FingerPrintGenerator) {
  const _navigator = Object.getOwnPropertyDescriptor(targetWindow, "navigator")?.get;
  if (!_navigator) return;
  Object.defineProperty(targetWindow, 'navigator', {
    get: new Proxy(_navigator, {
      apply: (_target: any, thisArg, _args) => {
        const result = _navigator.call(thisArg)
        return new Proxy(result, {
          get: (target: any, key: keyof Navigator | (string & {})) => {
            const value = target[key]
            switch (key) {
              /* ua */
              case 'userAgent': {
                return fingerPrint.userAgentData.userAgent
              }
              case 'appVersion': {
                return fingerPrint.userAgentData.agent.appVersion
              }
              case 'userAgentData' as any: {
                return proxyUserAgentData(value, fingerPrint.userAgentData)
              }
              /* webrtc */
              case 'getUserMedia':
              case 'mozGetUserMedia':
              case 'webkitGetUserMedia': {
                if (fingerPrint.webgl) return void 0;
                break
              }
              case 'mediaDevices': {
                if (!fingerPrint.webgl) return void 0;
                break
              }
              /* language */
              case 'language': {
                return fingerPrint.language
              }
              case 'languages': {
                return fingerPrint.languages
              }
               /* other */
              case 'hardwareConcurrency': {
                return fingerPrint.hardwareConcurrency
              }
              case 'connection':{
                mergeObjectAttribute(value, fingerPrint.userAgentData.connection || {})
                return value
              }
            }
            return typeof value === 'function' ? value.bind(target) : value
          }
        })
      },
    })
  });
}

/**
 * 代理UserAgentData
 */
export const proxyUserAgentData = (navigatorUserAgentData: any, userAgentOptions: UserAgentData) => {
  if (!navigatorUserAgentData) return;
  const newBrands = generateBrands(navigatorUserAgentData.brands, userAgentOptions.agent);
  const baseAgentData: Record<string, any> = {
    mobile: userAgentOptions.deviceCategory === 'mobile',
    platform: userAgentOptions.platform,
    brands: newBrands,
  }
  return new Proxy(navigatorUserAgentData, {
    get: (target, key) => {
      switch (key) {
        case 'brands': {
          return newBrands
        }
        case 'toJSON': {
          const _toJSON = function () {
            return baseAgentData
          }
          fakeFunctionPrototype(_toJSON, 'toJSON')
          return _toJSON
        }
        case 'getHighEntropyValues': {
          const raw: (opt?: string[]) => Promise<HighEntropyValuesAttr> = target[key]
          const _getHighEntropyValues = async function (opt?: string[]) {
            const data: Record<string, any> = await raw.call(target, opt)
            const platformVersion = userAgentOptions.agent.os?.version
            const formFactors = [userAgentOptions.deviceCategory || data.formFactors]
            return {
              ...data,
              formFactors,
              platform: userAgentOptions.agent.os?.family || data.platform,
              platformVersion: platformVersion !== null ? platformVersion : data.platformVersion,
              brands: baseAgentData.brands,
              fullVersionList: generateBrands(data.fullVersionList || data.brands, userAgentOptions.agent, true),
              uaFullVersion: userAgentOptions.agent.version,
            }
          }
          fakeFunctionPrototype(_getHighEntropyValues, 'getHighEntropyValues')
          return _getHighEntropyValues
        }
      }

      const value = target[key]
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

