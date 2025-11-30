import { requestClient } from '#/api/request';
import type { PagingResponseType } from '#/api/types';
import type { Recordable } from '@vben/types';
import type { CompanyDeptApi } from '../company/dept';
import type { SystemCompanyApi } from './company';
import type { SystemRoleApi } from './role';

export namespace SystemUserApi {
  export interface User {
    id: number;
    username: string;
    nickname?: string;
    avatar?: string;
    qq?: string;
    email?: string;
    phone?: string;
    remark?: string;
    status: 0 | 1;
    dept?: CompanyDeptApi.Dept;
    company?: SystemCompanyApi.Company;
    role?: SystemRoleApi.Role;
    createTime?: string;
    updateTime?: string;
  }

  export interface CreateUserParams {
    username: string;
    password?: string;
    nickname?: string;
    avatar?: string;
    qq?: string;
    email?: string;
    phone?: string;
    remark?: string;
    status?: number;
    deptId?: number;
    companyId?: number;
    roleId?: number;
  }

  export interface UpdateUserParams extends Partial<CreateUserParams> {}

  export interface UserQueryParams extends Recordable<any> {
    page?: number;
    pageSize?: number;
    username?: string;
    nickname?: string;
    email?: string;
    phone?: string;
    status?: number;
    roleId?: number;
    deptId?: number;
    companyId?: number;
  }
}

/**
 * 获取用户列表
 */
export function getUserList(params: SystemUserApi.UserQueryParams = {}) {
  return requestClient.get<PagingResponseType<SystemUserApi.User>>('/system/users', {
    params,
  });
}

/**
 * 获取用户详情
 */
export function getUserInfo(id: number) {
  return requestClient.get<SystemUserApi.User>(`/system/users/${id}`);
}

/**
 * 创建用户
 */
export function createUser(data: SystemUserApi.CreateUserParams) {
  return requestClient.post('/system/users', data);
}

/**
 * 更新用户
 */
export function updateUser(id: number, data: SystemUserApi.UpdateUserParams) {
  return requestClient.put(`/system/users/${id}`, data);
}

/**
 * 删除用户
 */
export function deleteUser(id: number) {
  return requestClient.delete(`/system/users/${id}`);
}

/**
 * 重置用户密码
 */
export function resetUserPassword(id: number, password: string) {
  return requestClient.put(`/system/users/${id}/password`, { password });
} 
