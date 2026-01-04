import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatCompactNumber, formatDate } from './formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('should format numbers as USD currency', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000.00');
    });
  });

  describe('formatPercent', () => {
    it('should format positive percentages with + sign', () => {
      expect(formatPercent(5.5)).toBe('+5.50%');
      expect(formatPercent(0.01)).toBe('+0.01%');
    });

    it('should format negative percentages with - sign', () => {
      expect(formatPercent(-3.25)).toBe('-3.25%');
    });

    it('should format zero as positive', () => {
      expect(formatPercent(0)).toBe('+0.00%');
    });
  });

  describe('formatCompactNumber', () => {
    it('should format millions with M suffix', () => {
      expect(formatCompactNumber(1000000)).toBe('1.0M');
      expect(formatCompactNumber(2500000)).toBe('2.5M');
    });

    it('should format thousands with k suffix', () => {
      expect(formatCompactNumber(1000)).toBe('1k');
      expect(formatCompactNumber(50000)).toBe('50k');
    });

    it('should return plain number for values under 1000', () => {
      expect(formatCompactNumber(500)).toBe('500');
      expect(formatCompactNumber(99)).toBe('99');
    });
  });

  describe('formatDate', () => {
    it('should format dates in US format', () => {
      // Use explicit time to avoid timezone issues
      const date = new Date(2024, 2, 15); // Month is 0-indexed
      expect(formatDate(date)).toBe('Mar 15, 2024');
    });
  });
});
