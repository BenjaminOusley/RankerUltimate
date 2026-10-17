import { describe, expect, it } from 'vitest';
import { calculateRatingMenuPosition } from './ratingPlacement';

describe('rating dropdown placement', () => {
  it('shows all 22 options when sufficient space exists below', () => {
    const location = calculateRatingMenuPosition({ top: 80, bottom: 118, left: 20, width: 120 }, { width: 1200, height: 1000 });
    expect(location.top).toBe(122);
    expect(location.maxHeight).toBe(758);
  });
  it('opens above when the top has more room', () => {
    const location = calculateRatingMenuPosition({ top: 850, bottom: 888, left: 20, width: 120 }, { width: 1200, height: 1000 });
    expect(location.top).toBeLessThan(850);
    expect(location.maxHeight).toBe(758);
  });
  it('scrolls instead of extending past the viewport on a small screen', () => {
    const location = calculateRatingMenuPosition({ top: 145, bottom: 183, left: 700, width: 180 }, { width: 340, height: 380 });
    expect(location.maxHeight).toBeLessThan(758);
    expect(location.left + location.width).toBeLessThanOrEqual(330);
    expect(location.top + location.maxHeight).toBeLessThanOrEqual(380);
  });
});
