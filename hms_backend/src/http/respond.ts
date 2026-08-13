// Shared pagination envelope so every list endpoint responds identically and the
// frontend Standard DataTable (server-side mode) can consume any of them.
export type Paginated<T> = {
  data: T[];
  page: {
    number: number;
    size: number;
    total: number;
    totalPages: number;
  };
};

export function paginate<T>(
  data: T[],
  total: number,
  pageNumber: number,
  pageSize: number,
): Paginated<T> {
  return {
    data,
    page: {
      number: pageNumber,
      size: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
