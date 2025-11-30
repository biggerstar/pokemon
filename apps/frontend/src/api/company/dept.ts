import { requestClient } from '#/api/request';
import type { PagingType } from '../types';

export namespace CompanyDeptApi {
  export interface Dept extends QueryDeptListParams{
    [key: string]: any;
    children?: Dept [];
    id: string;
    name: string;
    remark?: string;
    status: 0 | 1;
  }

  export interface QueryDeptListParams {
    companyId: number;
  }

  export interface ListDeptParams extends PagingType<QueryDeptListParams> { }
}

/**
 * 获取部门列表数据
 */
export function getDeptList(params: CompanyDeptApi.ListDeptParams) {
  return requestClient.get<Array<CompanyDeptApi.Dept>>(
    '/company/depts',
    { params },
  );
}

/**
 * 创建部门
 * @param data 部门数据
 */
export function createDept(
  data: Omit<CompanyDeptApi.Dept, 'children' | 'id'>,
) {
  return requestClient.post('/company/depts', data);
}

/**
 * 更新部门
 *
 * @param id 部门 ID
 * @param data 部门数据
 */
export function updateDept(
  id: string,
  data: Omit<CompanyDeptApi.Dept, 'children' | 'id'>,
) {
  return requestClient.put(`/company/depts/${id}`, data);
}

/**
 * 删除部门
 * @param id 部门 ID
 */
export function deleteDept(id: string, companyId?: number) {
  return requestClient.delete(`/company/depts/${id}`, { data: { companyId } });
}

