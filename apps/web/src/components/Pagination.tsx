export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginering">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Vorige
      </button>
      <span aria-current="page">
        Pagina {page} van {pages}
      </span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Volgende
      </button>
    </nav>
  );
}
