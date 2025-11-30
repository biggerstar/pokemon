import { requestClient } from "../request";

export namespace SystemConfigApi {
  export interface Config {
    name: string;
    key: string;
    value: string;
    remark?: string;
  }

  export interface QueryConfig {
    name?: string;
    key?: string;
  }
}

/**
 * 获取配置列表
*/
export function getConfigList() {
  return requestClient.get<SystemConfigApi.Config[]>('/system/param-config');
}

/**
 * 通过 key 进行查询配置
 * @param keyName 配置 key
 */
export function queryConfig(key: string) {
  return requestClient.get<SystemConfigApi.Config>(`/system/param-config/${key}`);
}

/**
 * 新增配置
 * @param data 配置数据
 */
export function createConfig(data: SystemConfigApi.Config) {
  return requestClient.post('/system/param-config', data);
}

/**
 * 配置用户注册默认角色
 * @param data 角色数据
 */
export function updateConfig(key: string, data: SystemConfigApi.Config) {
  return requestClient.put(`/system/param-config/${key}`, data);
}

/**
 * 删除配置
 */
export function deleteConfig(key: string) {
  return requestClient.delete(`/system/param-config/${key}`);
}


