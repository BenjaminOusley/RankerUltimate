import { describe, expect, it } from 'vitest';

import { formatPersonalRating } from './personalRating';

describe('personal rating display', () => {
  it('omits .0 for whole-number ratings', () => {
    expect(formatPersonalRating(9)).toBe('9');
    expect(formatPersonalRating(9.5)).toBe('9.5');
    expect(formatPersonalRating(10)).toBe('10');
    expect(formatPersonalRating(null)).toBe('—');
  });
});
