import type { DecimalString } from '../api/types';

const AMOUNT = /^(-?)(\d+)\.(\d{2})$/;

/**
 * "1234.50" -> "1 234,50 zł". Pure string formatting: amounts are never
 * converted to floating-point numbers.
 */
export function formatAmount(amount: DecimalString): string {
  const match = AMOUNT.exec(amount);
  if (match === null) {
    return amount;
  }
  const [, sign = '', integer = '', fraction = ''] = match;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

  return `${sign}${grouped},${fraction}\u00a0zł`;
}

/** "1234.50" -> "1234,50" for an input field. */
export function amountToInput(amount: DecimalString): string {
  return amount.replace('.', ',');
}

/**
 * Normalises what the user typed ("12", "12,5", "1 299.9") to the API format
 * ("12.00", "12.50", "1299.90"). Returns null when it is not a plain decimal
 * with at most two fractional digits. Ranges are checked by the backend.
 */
export function normalizeAmountInput(raw: string): DecimalString | null {
  const value = raw.replace(/[\s\u00a0]/g, '').replace(',', '.');
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value);
  if (match === null) {
    return null;
  }
  const [, integer = '', fraction = ''] = match;

  return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}
