import { Layers, PackageCheck, Tag } from 'lucide-react';

const items = [
  { icon: Layers, title: 'Przemyślany wybór', text: 'Kilkadziesiąt produktów w czytelnych kategoriach zamiast tysięcy przypadkowych.' },
  { icon: Tag, title: 'Ceny brutto', text: 'Każda cena zawiera VAT. To kwota, którą widzisz przy produkcie.' },
  { icon: PackageCheck, title: 'Aktualna dostępność', text: 'Przy każdym produkcie od razu widać, czy jest dostępny.' },
];

export function ValueProps() {
  return (
    <section aria-label="Dlaczego warto" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <ul className="grid gap-6 rounded-3xl border bg-card p-6 sm:grid-cols-3 sm:p-8">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
