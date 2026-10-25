const dateTime = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' });
const integer = new Intl.NumberFormat('pl-PL');

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return date.format(new Date(iso));
}

/** Integer quantities (units), e.g. 1000 -> "1000", 12500 -> "12 500". */
export function formatQuantity(value: number): string {
  return integer.format(value);
}
