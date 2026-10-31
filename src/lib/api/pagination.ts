import { PaginationParams } from '@/types/api';

export function getPaginationParams(urlOrParams: URL | URLSearchParams | Record<string, string | undefined>): PaginationParams {
  let params: URLSearchParams;

  if (urlOrParams instanceof URL) {
    params = urlOrParams.searchParams;
  } else if (urlOrParams instanceof URLSearchParams) {
    params = urlOrParams;
  } else {
    params = new URLSearchParams();
    for (const [key, value] of Object.entries(urlOrParams)) {
      if (value !== undefined) {
        params.set(key, value);
      }
    }
  }

  const rawPage = parseInt(params.get('page') || '1', 10);
  const rawLimit = parseInt(params.get('limit') || '20', 10);

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const skip = (page - 1) * limit;

  const sortBy = params.get('sortBy') || undefined;
  const rawOrder = (params.get('sortOrder') || 'desc').toLowerCase();
  const sortOrder: 'asc' | 'desc' = rawOrder === 'asc' ? 'asc' : 'desc';
  const search = params.get('search')?.trim() || undefined;

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
    search,
  };
}

export function buildPaginationMeta(total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
