import { describe, expect, it } from 'vitest';
import type { RankItem } from '@/models';
import { getPersonalRating, updatePersonalRatingMap } from './personalRatings';

const item: RankItem = {
  id: 'example',
  name: 'Example',
};

describe('personal rating storage model', () => {
  it('adds, reads, changes, and removes a Personal Rating', () => {
    const added = updatePersonalRatingMap({}, item, 9.5);
    expect(getPersonalRating(added, item)).toBe(9.5);

    const changed = updatePersonalRatingMap(added, item, 10);
    expect(getPersonalRating(changed, item)).toBe(10);

    const removed = updatePersonalRatingMap(changed, item, null);
    expect(getPersonalRating(removed, item)).toBeNull();
  });

  it('does not mutate the previous map', () => {
    const previous = {};
    const next = updatePersonalRatingMap(previous, item, 8);

    expect(previous).toEqual({});
    expect(next).not.toBe(previous);
  });
});
