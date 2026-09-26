export type SortDirection = 'asc' | 'desc';

export type PageMeta = Readonly<{
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>;

export type PageResult<T> = Readonly<{
  data: T[];
  meta: PageMeta;
}>;

export function buildPageMeta(total: number, page: number, limit: number): PageMeta {
  return {
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}
