import { availabilityOf } from '../lib/stock';
import { Badge } from './Badge';

const labels = { out: 'Brak', low: 'Niski stan', in: 'Dostępny' } as const;
const tones = { out: 'danger', low: 'warning', in: 'success' } as const;

export function AvailabilityBadge({ available }: { available: number }) {
  const availability = availabilityOf(available);

  return <Badge tone={tones[availability]}>{labels[availability]}</Badge>;
}
