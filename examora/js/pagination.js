/** Client-side pagination helpers (used when filters force a full load). */
export function paginate(items, page, pageSize) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  return {
    items: items.slice((p - 1) * pageSize, p * pageSize),
    meta: { pageNumber: p, pageSize, totalCount, totalPages, hasNextPage: p < totalPages, hasPreviousPage: p > 1 },
  };
}
