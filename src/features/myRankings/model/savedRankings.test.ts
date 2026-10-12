import { describe, expect, it } from 'vitest';
import type { RankCollection } from '@/domain/models';
import type { RankingState } from '@/features/ranking/engine';
import { getItemStorageKey, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import {
  daysUntilExpiry,
  getPersonalRatingChange,
  getRatingAtCompletion,
  isValidStoredRanking,
  isExpiredRecent,
  makeRecentRanking,
  rankingToLiveSnapshot,
  rankingToResultsData,
  savedRankingMatches,
} from './savedRankings';

const collection: RankCollection = {
  id: 'pixar', name: 'Pixar', groupId: 'movies-tv',
  items: [
    { id: 'up', name: 'Up', source: { provider: 'tmdb', type: 'movie', id: '14160' } },
    { id: 'toy-story', name: 'Toy Story', source: { provider: 'tmdb', type: 'movie', id: '862' } },
  ],
};
const rankingState = {
  ranked: collection.items,
  comparisons: 7,
  outcomes: [{ phase: 'refinement', winnerId: 'up', loserId: 'toy-story' }],
} as RankingState;
const completed = new Date('2026-10-01T12:00:00Z');
const initialRatings: PersonalRatingMap = {
  [getItemStorageKey(collection.items[0])]: { value: 7.5, updatedAt: completed.toISOString() },
};
const create = () => makeRecentRanking(collection, rankingState, { up: 9.3, 'toy-story': 7.2 }, initialRatings, completed, 'example');

describe('My Rankings model', () => {
  it('preserves ranking order and captures completion ratings independently of current ratings', () => {
    const record = create();
    expect(record.items.map((r) => r.id)).toEqual(['up', 'toy-story']);
    expect(record.items[0].rankingScore).toBe(9.3);
    expect('personalRating' in record.items[0]).toBe(false);
    expect(record.items[0].personalRatingAtCompletion).toBe(7.5);
    expect(record.items[1].personalRatingAtCompletion).toBeNull();
    expect(record.refinementCount).toBe(1);
    expect(rankingToResultsData(record).rankingScores['toy-story']).toBe(7.2);
  });

  it('always looks up current global Personal Ratings when opening old results', () => {
    const record = create();
    const ratings: PersonalRatingMap = {
      [getItemStorageKey(collection.items[0])]: { value: 8, updatedAt: '2026-10-02T00:00:00Z' },
    };
    expect(rankingToLiveSnapshot(record, ratings).items[0].personalRating).toBe(8);
    expect(rankingToLiveSnapshot(record, ratings).items[0]).not.toHaveProperty('personalRatingAtCompletion');
    ratings[getItemStorageKey(collection.items[0])] = { value: 4.5, updatedAt: '2026-10-03T00:00:00Z' };
    expect(rankingToLiveSnapshot(record, ratings).items[0].personalRating).toBe(4.5);
    expect(rankingToLiveSnapshot(record, ratings).items[1].personalRating).toBeNull();
  });

  it('keeps the completion rating frozen while live current ratings change or disappear', () => {
    const record = create();
    const ratings: PersonalRatingMap = {
      [getItemStorageKey(collection.items[0])]: { value: 9, updatedAt: '2026-10-03T00:00:00Z' },
    };
    expect(getRatingAtCompletion(record, collection.items[0].id)).toBe(7.5);
    expect(rankingToLiveSnapshot(record, ratings).items[0].personalRating).toBe(9);
    expect(getPersonalRatingChange(getRatingAtCompletion(record, 'up'), 9)).toBe(1.5);
    delete ratings[getItemStorageKey(collection.items[0])];
    expect(rankingToLiveSnapshot(record, ratings).items[0].personalRating).toBeNull();
    expect(getRatingAtCompletion(record, 'up')).toBe(7.5);
    expect(getPersonalRatingChange(7.5, null)).toBeNull();
  });

  it('accepts earlier stored rankings without historical values as Not recorded', () => {
    const record = create();
    const legacy = { ...record, items: record.items.map((item) => {
      const copy = { ...item };
      delete copy.personalRatingAtCompletion;
      return copy;
    }) };
    expect(isValidStoredRanking(legacy)).toBe(true);
    expect(getRatingAtCompletion(legacy, 'up')).toBeUndefined();
    expect(getPersonalRatingChange(undefined, 9)).toBeNull();
    expect(getRatingAtCompletion(record, 'toy-story')).toBeNull();
    expect(isValidStoredRanking({ ...record, items: [{ ...record.items[0], personalRatingAtCompletion: 99 }, record.items[1]] })).toBe(false);
  });

  it('retains historical ratings when saved or replaced; snapshots for sharing stay current', () => {
    const original = create();
    const replacement = makeRecentRanking(collection, rankingState, { up: 8.4, 'toy-story': 7.8 }, {}, completed, 'replacement');
    const overwritten = { ...replacement, id: original.id, savedAt: original.completedAt };
    expect(getRatingAtCompletion(overwritten, 'up')).toBeNull();
    expect(getRatingAtCompletion(original, 'up')).toBe(7.5);
    expect(rankingToLiveSnapshot(overwritten, initialRatings).items[0].personalRating).toBe(7.5);
    expect(rankingToResultsData(overwritten).rankingScores.up).toBe(8.4);
  });

  it('expires temporary results at 30 days measured from completion, never saved results', () => {
    const record = create();
    const before = completed.getTime() + 30 * 86400000 - 1;
    const boundary = completed.getTime() + 30 * 86400000;
    expect(isExpiredRecent(record, before)).toBe(false);
    expect(isExpiredRecent(record, boundary)).toBe(true);
    expect(daysUntilExpiry(record, before)).toBe(1);
    expect(isExpiredRecent({ ...record, savedAt: '2026-10-02T00:00:00Z' }, boundary + 365 * 86400000)).toBe(false);
  });

  it('filters stored rankings by category and search', () => {
    const record = create();
    expect(savedRankingMatches(record, 'pix', 'movies-tv')).toBe(true);
    expect(savedRankingMatches(record, 'pix', 'books')).toBe(false);
  });
});
