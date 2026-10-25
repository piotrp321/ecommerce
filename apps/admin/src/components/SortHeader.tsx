import { Icon } from './Icon';

interface SortHeaderProps<S extends string> {
  label: string;
  sort: S;
  ascending: S;
  descending: S;
  onSort: (sort: S) => void;
  className?: string;
}

/** Column header that toggles between ascending and descending order. */
export function SortHeader<S extends string>({ label, sort, ascending, descending, onSort, className }: SortHeaderProps<S>) {
  const direction = sort === ascending ? 'ascending' : sort === descending ? 'descending' : undefined;

  return (
    <th scope="col" className={className} aria-sort={direction ?? 'none'}>
      <button
        type="button"
        className="sort-header"
        onClick={() => {
          onSort(direction === 'ascending' ? descending : ascending);
        }}
      >
        {label}
        <Icon name={direction === 'ascending' ? 'arrowUp' : direction === 'descending' ? 'arrowDown' : 'sort'} size={14} />
      </button>
    </th>
  );
}
