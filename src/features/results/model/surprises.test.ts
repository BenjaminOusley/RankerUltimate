import { describe, expect, it } from 'vitest';
import type { RankItem } from '@/domain/models';
import { getItemStorageKey, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import { getBiggestSurprises } from './surprises';

const items: RankItem[] = [
  { id: 'a', name: 'A', source: { provider: 'tmdb', type: 'movie', id: '1' } },
  { id: 'b', name: 'B', source: { provider: 'tmdb', type: 'movie', id: '2' } },
  { id: 'c', name: 'C', source: { provider: 'tmdb', type: 'movie', id: '3' } },
];
const scores = { a: 9, b: 5, c: 2 };
const current: PersonalRatingMap = {
  [getItemStorageKey(items[0])]: { value: 9, updatedAt: '2026-10-11T00:00:00Z' },
  [getItemStorageKey(items[1])]: { value: 1, updatedAt: '2026-10-11T00:00:00Z' },
  [getItemStorageKey(items[2])]: { value: 10, updatedAt: '2026-10-11T00:00:00Z' },
};

describe('Biggest Surprises', () => {
  it('uses the completion-time rating for saved rankings even after global ratings change', () => {
    const atCompletion = { a: 0.5, b: 4.5, c: 2 };
    const surprises = getBiggestSurprises(items, scores, current, atCompletion);
    expect(surprises.map((entry) => [entry.item.id, entry.rating, entry.rank])).toEqual([
      ['a', 0.5, 1],
      ['b', 4.5, 2],
      ['c', 2, 3],
    ]);
    expect(surprises[0].difference).toBe(8.5);
    // Even clearing current ratings does not change a historical surprise.
    expect(getBiggestSurprises(items, scores, {}, atCompletion)).toEqual(surprises);
  });

  it('continues using current ratings for live Results with no history snapshot', () => {
    const surprises = getBiggestSurprises(items, scores, current);
    expect(surprises.map((entry) => [entry.item.id, entry.rating])).toEqual([
      ['c', 10],
      ['b', 1],
      ['a', 9],
    ]);
  });

  it('does not invent historical ratings for legacy or previously unrated items', () => {
    expect(getBiggestSurprises(items, scores, current, {})).toEqual([]);
    const surprises = getBiggestSurprises(items, scores, current, { a: undefined, b: null, c: 1 });
    expect(surprises.map((entry) => entry.item.id)).toEqual(['c']);
    expect(surprises[0].rating).toBe(1);
  });
});
