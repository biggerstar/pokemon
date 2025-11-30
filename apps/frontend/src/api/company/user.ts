import { requestClient } from '#/api/request';
import type { PagingResponseType } from '#/api/types';
import type { Recordable } from '@vben/types';
import type { CompanyDeptApi } from './dept';

export namespace CompanyUserApi {
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
    deptId?: number;
    companyId?: number;
    createTime?: string;
    updateTime?: string;
    dept?: CompanyDeptApi.Dept;
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
    deptId?: number;
    companyId?: number;
  }
}

/**
 * 获取用户列表
 */
export function getUserList(params: CompanyUserApi.UserQueryParams = {}) {
  return requestClient.get<PagingResponseType<CompanyUserApi.User>>('/company/users', {
    params,
  });
}

/**
 * 获取用户详情
 */
export function getUserInfo(id: number) {
  return requestClient.get<CompanyUserApi.User>(`/company/users/${id}`);
}

/**
 * 创建用户
 */
export function createUser(data: CompanyUserApi.CreateUserParams) {
  return requestClient.post('/company/users', data);
}

/**
 * 更新用户
 */
export function updateUser(id: number, data: CompanyUserApi.UpdateUserParams) {
  return requestClient.put(`/company/users/${id}`, data);
}

/**
 * 删除用户
 */
export function deleteUser(id: number) {
  return requestClient.delete(`/company/users/${id}`);
}

/**
 * 重置用户密码
 */
export function resetUserPassword(id: number, password: string) {
  return requestClient.put(`/company/users/${id}/password`, { password });
} 
