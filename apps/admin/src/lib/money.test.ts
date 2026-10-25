import { amountToInput, formatAmount, normalizeAmountInput } from './money';

describe('formatAmount', () => {
  it('formats decimal strings in Polish notation without floating-point conversion', () => {
    expect(formatAmount('1234567.05')).toBe('1 234 567,05 zł');
    expect(formatAmount('0.10')).toBe('0,10 zł');
    expect(formatAmount('999999999.99')).toBe('999 999 999,99 zł');
  });

  it('returns unexpected values unchanged', () => {
    expect(formatAmount('abc')).toBe('abc');
  });
});

describe('normalizeAmountInput', () => {
  it.each([
    ['12', '12.00'],
    ['12,5', '12.50'],
    ['12.99', '12.99'],
    ['1 299,9', '1299.90'],
    ['007,10', '7.10'],
    ['0', '0.00'],
    ['12,', '12.00'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeAmountInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '12.345', '-5', '1,2,3', '1e3'])('rejects %s', (input) => {
    expect(normalizeAmountInput(input)).toBeNull();
  });

  it('round-trips with amountToInput', () => {
    expect(normalizeAmountInput(amountToInput('4064.23'))).toBe('4064.23');
  });
});
