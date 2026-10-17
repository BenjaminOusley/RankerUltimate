import { describe, expect, it } from 'vitest';
import { RATING_VALUES } from './ratingOptions';

describe('shared Personal Rating options', () => {
  it('contains 10 through 0, descending in steps of 0.5', () => {
    expect(RATING_VALUES).toHaveLength(21);
    expect(RATING_VALUES[0]).toBe(10);
    expect(RATING_VALUES.at(-1)).toBe(0);
    expect(RATING_VALUES.every((value, index) => index === 0 || RATING_VALUES[index - 1] - value === .5)).toBe(true);
  });
});
