import { CircleCheck, CircleSlash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AvailabilityProps {
  inStock: boolean;
  /** Shorter wording for product cards. */
  compact?: boolean;
  className?: string;
}

/** Availability as decided by the backend; shown with an icon and text, not colour alone. */
export function Availability({ inStock, compact = false, className }: AvailabilityProps) {
  const Icon = inStock ? CircleCheck : CircleSlash;

  return (
    <p className={cn('inline-flex items-center gap-1.5 text-sm', inStock ? 'text-success' : 'text-muted-foreground', className)}>
      <Icon className="size-4" aria-hidden="true" />
      {inStock ? 'Dostępny' : compact ? 'Niedostępny' : 'Chwilowo niedostępny'}
    </p>
  );
}
