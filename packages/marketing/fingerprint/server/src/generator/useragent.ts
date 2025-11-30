// @ts-ignore
import UserAgent from 'user-agents';
// @ts-ignore
import platformPkg from 'platform';
import type { Filter, UserAgentData } from '../typing';

const { parse } = platformPkg;

export function genRandomUseragent(filter?: Filter | Filter[]): UserAgentData {
  const userAgent = new UserAgent(filter as any);
  const result = userAgent.data as UserAgentData;
  result.agent = parse(userAgent.data.userAgent);
  const uaPart = result.userAgent.split('/');
  const appCodeName = uaPart.shift()
  const appVersion = uaPart.join('/')
  result.agent.appCodeName = appCodeName;
  result.agent.appVersion = appVersion;
  result.agent.versionShort = result.agent.version?.split('.')?.[0];
  return JSON.parse(JSON.stringify(result));
}
