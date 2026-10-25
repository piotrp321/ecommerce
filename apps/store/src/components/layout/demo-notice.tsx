import { FlaskConical } from 'lucide-react';

/** Always visible while the catalog comes from the demo data source. */
export function DemoNotice() {
  return (
    <aside aria-label="Informacja o wersji demonstracyjnej" className="bg-primary text-primary-foreground">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:text-[13px]">
        <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Wersja demonstracyjna.</strong> Produkty, ceny i dostępność są przykładowe,
          zamówienia nie są realizowane.
        </span>
      </p>
    </aside>
  );
}
