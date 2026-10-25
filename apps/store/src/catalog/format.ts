import type { Money } from './types';

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Presents an amount from the API, e.g. "1249.00" → "1249,00 zł". The decimal string is
 * passed to Intl as is (no float arithmetic); the value itself comes from the backend.
 */
export function formatMoney({ amount, currency }: Money): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }

  return formatter.format(amount as `${number}`);
}
