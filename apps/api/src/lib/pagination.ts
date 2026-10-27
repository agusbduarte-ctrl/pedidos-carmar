export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function enteroPositivo(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Tolerante: valores ausentes o inválidos (abc, 0, -1, 1.5) toman el default,
// y limit se recorta a MAX_LIMIT.
export function parsePagination(query: unknown): PaginationQuery {
  const { page, limit } = (query ?? {}) as { page?: unknown; limit?: unknown };
  return {
    page: enteroPositivo(page) ?? DEFAULT_PAGE,
    limit: Math.min(enteroPositivo(limit) ?? DEFAULT_LIMIT, MAX_LIMIT),
  };
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  return { total, page, limit, totalPages: Math.ceil(total / limit) };
}

// Para pasar directo a findMany
export function skipTake({ page, limit }: PaginationQuery) {
  return { skip: (page - 1) * limit, take: limit };
}
