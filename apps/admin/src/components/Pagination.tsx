import { Button } from './Button';

interface PaginationProps {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Shows a page size select; `perPage` must be one of `perPageOptions`. */
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: readonly number[];
}

export function Pagination({
  page,
  perPage,
  totalItems,
  totalPages,
  onPageChange,
  onPerPageChange,
  perPageOptions = [],
}: PaginationProps) {
  const from = totalItems === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalItems);

  return (
    <nav className="pagination" aria-label="Paginacja">
      <p className="pagination__summary">
        {from}–{to} z {totalItems}
      </p>
      <div className="pagination__controls">
        {onPerPageChange !== undefined && perPageOptions.length > 0 && (
          <label className="pagination__per-page">
            <span>Na stronie</span>
            <select
              className="select select--sm"
              value={perPage}
              onChange={(event) => {
                onPerPageChange(Number(event.target.value));
              }}
            >
              {perPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="pagination__page" aria-live="polite">
          Strona {Math.min(page, Math.max(totalPages, 1))} z {Math.max(totalPages, 1)}
        </span>
        <Button
          size="sm"
          icon="chevronLeft"
          aria-label="Poprzednia strona"
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
        />
        <Button
          size="sm"
          icon="chevronRight"
          aria-label="Następna strona"
          disabled={page >= totalPages}
          onClick={() => {
            onPageChange(page + 1);
          }}
        />
      </div>
    </nav>
  );
}
