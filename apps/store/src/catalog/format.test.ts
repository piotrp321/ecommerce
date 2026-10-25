import { formatMoney } from './format';

// Intl separates the amount and "zł" with a non-breaking space.
const normalize = (text: string): string => text.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('presents the decimal amount from the API in Polish format', () => {
    expect(normalize(formatMoney({ amount: '1249.00', currency: 'PLN' }))).toBe('1249,00 zł');
    expect(normalize(formatMoney({ amount: '12345.67', currency: 'PLN' }))).toBe('12 345,67 zł');
    expect(normalize(formatMoney({ amount: '0.10', currency: 'PLN' }))).toBe('0,10 zł');
  });
});
