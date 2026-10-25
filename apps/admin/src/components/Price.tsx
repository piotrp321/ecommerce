import type { Money } from '../api/types';
import { formatAmount } from '../lib/money';

/** Gross price from the backend; the panel never calculates it. */
export function GrossPrice({ gross }: { gross: Money | null }) {
  if (gross === null) {
    return (
      <span className="muted" title="Cenę brutto wylicza backend po zapisaniu zmian">
        wyliczy backend
      </span>
    );
  }

  return <span className="num">{formatAmount(gross.amount)}</span>;
}
