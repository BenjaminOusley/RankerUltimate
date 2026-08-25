import { describe, expect, it } from 'vitest';
import { formatPreferenceScore, getDistribution, getRankAdornment, getRankStyle } from './results';

describe('results helpers', () => {
  it('formats Preference Scores with one decimal place', () => {
    expect(formatPreferenceScore(9)).toBe('9.0');
    expect(formatPreferenceScore(8.74)).toBe('8.7');
  });

  it('normalizes score distributions independently', () => {
    expect(getDistribution([1, 3, 5, 7, 9])).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(getDistribution([])).toEqual([0, 0, 0, 0, 0]);
  });

  it('returns top and bottom rank styling without bottom adornments', () => {
    expect(getRankStyle(0, 10)).toBe('gold');
    expect(getRankStyle(1, 10)).toBe('silver');
    expect(getRankStyle(2, 10)).toBe('bronze');
    expect(getRankStyle(7, 10)).toBe('thirdLast');
    expect(getRankStyle(8, 10)).toBe('secondLast');
    expect(getRankStyle(9, 10)).toBe('last');

    expect(getRankAdornment(0)).toBe('♛');
    expect(getRankAdornment(1)).toBe('◆');
    expect(getRankAdornment(2)).toBe('●');
    expect(getRankAdornment(9)).toBe('');
  });
});
