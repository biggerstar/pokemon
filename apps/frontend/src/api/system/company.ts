import { requestClient } from '#/api/request';
import type { PagingResponseType } from '#/api/types';

export namespace SystemCompanyApi {
  export interface Company {
    id: number;
    name: string;
    remark?: string;
    status: number;
  }

  export interface CreateCompanyParams {
    name: string;
    remark?: string;
    status: number;
  }

  export interface QueryCompanyParams extends Partial<Company> { }
}


/**
 * 获取公司列表
 */
export function getCompanyList(params?: SystemCompanyApi.QueryCompanyParams) {
  return requestClient.get<PagingResponseType<SystemCompanyApi.QueryCompanyParams>>('/system/companies', { params });
}

/**
 * 创建公司
 */
export function createCompany(data: SystemCompanyApi.CreateCompanyParams) {
  return requestClient.post<SystemCompanyApi.Company>('/system/companies', data);
}

/**
 * 更新公司
 */
export function updateCompany(id: number, data: SystemCompanyApi.CreateCompanyParams) {
  return requestClient.put<SystemCompanyApi.Company>(`/system/companies/${id}`, data);
}

/**
 * 删除公司
 */
export function deleteCompany(id: number) {
  return requestClient.delete<void>(`/system/companies/${id}`);
} 
