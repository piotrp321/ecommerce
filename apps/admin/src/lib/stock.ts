/**
 * Presentation threshold for the "low stock" hint. Not a business rule: the
 * backend only says how many units are available.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type Availability = 'out' | 'low' | 'in';

export function availabilityOf(available: number): Availability {
  if (available <= 0) {
    return 'out';
  }

  return available <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
}
