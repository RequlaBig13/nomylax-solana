import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, displayAmount, percentOf, MoneyError } from '@/lib/money';

describe('money', () => {
  it('parses decimal strings into base units without float error', () => {
    expect(parseAmount('4.50', 6)).toBe(4_500_000n);
    expect(parseAmount('0.1', 6) + parseAmount('0.2', 6)).toBe(parseAmount('0.3', 6));
  });

  it('refuses precision the token cannot represent', () => {
    expect(() => parseAmount('1.0000001', 6)).toThrow(MoneyError);
  });

  it('refuses malformed and negative amounts', () => {
    expect(() => parseAmount('abc', 6)).toThrow(MoneyError);
    expect(() => parseAmount('-5', 6)).toThrow(MoneyError);
    expect(() => parseAmount(-5, 6)).toThrow(MoneyError);
    expect(() => parseAmount(Infinity, 6)).toThrow(MoneyError);
  });

  it('round trips through format', () => {
    expect(formatAmount(parseAmount('1234.56', 6), 6, 2)).toBe('1234.56');
    expect(displayAmount(1_234_560_000n, 6, 2)).toBe('1,234.56');
  });

  it('computes percentages without dividing by zero', () => {
    expect(percentOf(50n, 100n)).toBe(50);
    expect(percentOf(0n, 0n)).toBe(0);
  });
});
