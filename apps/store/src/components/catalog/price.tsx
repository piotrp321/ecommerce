import { formatMoney } from '@/catalog/format';
import type { PublicPrice } from '@/catalog/types';
import { cn } from '@/lib/utils';

interface PriceProps {
  price: PublicPrice;
  className?: string;
  /** Shows the VAT note under the amount (product page). */
  withVatNote?: boolean;
}

export function Price({ price, className, withVatNote = false }: PriceProps) {
  return (
    <p className={cn('flex flex-col', className)}>
      <span className="font-semibold tabular-nums">{formatMoney(price.gross)}</span>
      {withVatNote ? (
        <span className="text-sm font-normal text-muted-foreground">Cena brutto, zawiera {price.vatRate}% VAT</span>
      ) : null}
    </p>
  );
}
