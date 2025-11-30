/** 分页请求数据类型 */
export type PagingType<T = Record<any, any>> = T & {
  page?: number;
  pageSize?: number;
}

/** 分页响应数据类型 */
export type PagingResponseType<T = Record<any, any>> = {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPage: number;
    length: number;
  };
}
