import { requestClient } from '#/api/request';

import type { PagingResponseType } from '#/api/types';
import type { Recordable } from '@vben/types';

export namespace SystemRoleApi {
  export interface Role {
    [key: string]: any;
    id: number;
    name: string;
    permissions: string[];
    remark?: string;
    status: 0 | 1;
    meta: RoleMeta;
  }

  export interface RoleMeta {
    allCompanyManagementAuthority: boolean;
  }
}

/**
 * 获取角色列表数据
 */
export function getRoleList(params?: Recordable<any>) {
  return requestClient.get<PagingResponseType<SystemRoleApi.Role>>(
    '/system/roles',
    { params },
  );
}

/**
 * 创建角色
 * @param data 角色数据
 */
export function createRole(data: Omit<SystemRoleApi.Role, 'id'>) {
  return requestClient.post('/system/roles', data);
}

/**
 * 更新角色
 *
 * @param id 角色 ID
 * @param data 角色数据
 */
export function updateRole(
  id: number,
  data: Omit<SystemRoleApi.Role, 'id'>,
) {
  return requestClient.put(`/system/roles/${id}`, data);
}

/**
 * 删除角色
 * @param id 角色 ID
 */
export function deleteRole(id: number) {
  return requestClient.delete(`/system/roles/${id}`);
}

