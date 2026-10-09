import { describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import type { RankingState } from '@/features/ranking/engine';
import type { PersonalRatingMap } from '@/features/ratings/personalRatings';
import {
  createItemsCsv,
  getResultMetadataLabel,
  createJsonExport,
  createRankedFilename,
  createResultsSnapshot,
  createShareText,
  isSharedResultsSnapshot,
  snapshotToResultsData,
} from './resultsShare';
import { getResultsImageLayout } from './shareImage';

const collection: RankCollection = {
  id: 'test-collection',
  name: 'Christopher Nolan Movies',
  description: 'Test results collection.',
  items: [
    { id: 'a', name: 'Alpha', subtitle: '2024' },
    { id: 'b', name: 'Beta, "+"', subtitle: '2023' },
    { id: 'c', name: 'Pokémon' },
    { id: 'd', name: 'Delta' },
  ],
};

const rankingState: RankingState = {
  ranked: collection.items,
  remaining: [], current: null, low: 0, high: 0,
  comparisons: 7, outcomes: [
    { winnerId: 'a', loserId: 'b', phase: 'ranking' },
    { winnerId: 'b', loserId: 'c', phase: 'refinement' },
  ],
  mode: 'insert', validationPair: null, validationChecked: true,
};
const personalRatings: PersonalRatingMap = {
  'local:a': { value: 9.5, updatedAt: '2026-10-07T00:00:00.000Z' },
  'local:c': { value: 6, updatedAt: '2026-10-07T00:00:00.000Z' },
};
const preferenceScores = { a: 9.2, b: 7.8, c: 5.1, d: 2.4 };
const snapshot = createResultsSnapshot({ collection, rankingState, preferenceScores, personalRatings });

describe('results sharing and export helpers', () => {
  it('keeps the public read-only snapshot schema compatible', () => {
    expect(isSharedResultsSnapshot(snapshot)).toBe(true);
    expect(snapshot.items.map((item) => item.name)).toEqual(['Alpha', 'Beta, "+"', 'Pokémon', 'Delta']);
    const resultData = snapshotToResultsData(snapshot);
    expect(resultData.personalRatings['local:a']?.value).toBe(9.5);
    expect(resultData.preferenceScores.d).toBe(2.4);
  });

  it('includes the full ranking in text irrespective of optional extras', () => {
    const value = createShareText(snapshot, {
      preferenceScores: false, personalRatings: false, summaryStats: false, distributions: false,
    });
    expect(value).toContain('1. Alpha');
    expect(value).toContain('4. Delta');
    expect(value).not.toContain('Distribution');
    expect(value).not.toContain('Comparisons');
    const withDetails = createShareText(snapshot, {
      preferenceScores: true, personalRatings: true, summaryStats: true, distributions: true,
    });
    expect(withDetails).toContain('1. Alpha — (2024) · Ranking Score 9.2 · Personal Rating 9.5');
    expect(withDetails).toContain('4. Delta — Ranking Score 2.4');
    expect(withDetails).toContain('Ranking score distribution');
  });

  it('exports clean quoted CSV without a collection-name column or summary CSV', () => {
    const csv = createItemsCsv(snapshot);
    expect(csv).toContain('"Rank","Title","Details","Ranking Score","Personal Rating"');
    expect(csv).toContain('"2","Beta, ""+""","2023","7.8",""');
    expect(csv).toContain('"3","Pokémon"');
    expect(csv.split('\r\n')).toHaveLength(5);
    expect(csv).not.toContain('"Collection"');
  });

  it('exports only rankable human-facing JSON fields', () => {
    const results = JSON.parse(createJsonExport(snapshot));
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({ rank: 1, title: 'Alpha', details: '2024', rankingScore: 9.2, personalRating: 9.5 });
    expect(results[1].personalRating).toBeNull();
    expect(JSON.stringify(results)).not.toContain('refinementCount');
    expect(JSON.stringify(results)).not.toContain('source');
    expect(JSON.stringify(results)).not.toContain('createdAt');
    expect(JSON.stringify(results)).not.toContain('comparisons');
  });

  it('can omit optional scores and personal ratings without omitting any items', () => {
    const opts = { preferenceScores: false, personalRatings: false, summaryStats: false, distributions: false };
    const json = JSON.parse(createJsonExport(snapshot, opts));
    expect(json).toHaveLength(4);
    expect(json[0]).toEqual({ rank: 1, title: 'Alpha', details: '2024' });
    expect(createItemsCsv(snapshot, opts).split('\r\n')[0]).toBe('"Rank","Title","Details"');
  });

  it('uses collection-name Ranked filenames and a safely sized PNG layout for 500 items', () => {
    expect(createRankedFilename('Christopher Nolan Movies', 'csv')).toBe('Christopher Nolan Movies Ranked.csv');
    expect(createRankedFilename('Best: Movies?', 'png')).toBe('Best Movies Ranked.png');
    expect(getResultsImageLayout(13, { layout: 'two', resolution: 'high', summaryStats: false }).columns).toBe(2);
    const large = getResultsImageLayout(500, { layout: 'two', resolution: 'ultra', summaryStats: false });
    expect(large.columns).toBe(4);
    expect(large.height).toBeLessThan(16384);
    expect(large.rows * large.columns).toBeGreaterThanOrEqual(500);
    expect(large.width * large.height).toBeLessThanOrEqual(44_000_000);
    const narrow = getResultsImageLayout(13, { layout: 'one', resolution: 'high', summaryStats: false });
    const wide = getResultsImageLayout(13, { layout: 'two', resolution: 'high', summaryStats: false });
    expect(narrow.width).toBeLessThan(wide.width);
    expect(getResultsImageLayout(13, { layout: 'two', resolution: 'ultra', summaryStats: false }).width).toBeGreaterThan(wide.width);
  });

  it('labels only semantically consistent subtitle data as dates or years', () => {
    const item = { id: 'a', name: 'Title', preferenceScore: 9, personalRating: null };
    expect(getResultMetadataLabel([{ ...item, source: { provider: 'tmdb', id: '1', type: 'movie' }, subtitle: '2024' }])).toBe('Release Year');
    expect(getResultMetadataLabel([{ ...item, source: { provider: 'igdb', id: '1', type: 'game' }, subtitle: '2019' }])).toBe('Release Year');
    expect(getResultMetadataLabel([{ ...item, source: { provider: 'tmdb', id: '1', type: 'tv' }, subtitle: '2011–2020' }])).toBe('Years Aired');
    expect(getResultMetadataLabel([{ ...item, source: { provider: 'hardcover', id: '1', type: 'book' }, subtitle: '2005' }])).toBe('Publication Year');
    expect(getResultMetadataLabel([{ ...item, source: { provider: 'reported-sales', id: '1', type: 'game' }, subtitle: '45.2M sold · 1996' }])).toBe('Details');
    expect(getResultMetadataLabel([
      { ...item, source: { provider: 'tmdb', id: '1', type: 'movie' }, subtitle: '2024' },
      { ...item, source: { provider: 'tmdb', id: '2', type: 'tv' }, subtitle: '2011–2020' },
    ])).toBe('Details');
  });

  it('exports accurate per-item metadata keys in JSON, including mixed collections', () => {
    const items = [
      { id: 'movie', name: 'Movie', subtitle: '2024', source: { provider: 'tmdb', id: '1', type: 'movie' } },
      { id: 'tv', name: 'TV', subtitle: '2017–', source: { provider: 'tmdb', id: '2', type: 'tv' } },
      { id: 'book', name: 'Book', subtitle: '2005', source: { provider: 'hardcover', id: '3', type: 'book' } },
      { id: 'game', name: 'Game', subtitle: '2019', source: { provider: 'igdb', id: '4', type: 'game' } },
      { id: 'sales', name: 'Sales', subtitle: '45.2M sold · 1996', source: { provider: 'reported-sales', id: '5', type: 'game' } },
      { id: 'custom', name: 'Custom', subtitle: 'Volume 2' },
    ].map((item) => ({ ...item, preferenceScore: 5, personalRating: null }));
    const mixed = { ...snapshot, items };
    const parsed = JSON.parse(createJsonExport(mixed));
    expect(parsed.map((item: Record<string, unknown>) => Object.keys(item))).toEqual([
      ['rank', 'title', 'releaseYear', 'rankingScore', 'personalRating'],
      ['rank', 'title', 'yearsAired', 'rankingScore', 'personalRating'],
      ['rank', 'title', 'publicationYear', 'rankingScore', 'personalRating'],
      ['rank', 'title', 'releaseYear', 'rankingScore', 'personalRating'],
      ['rank', 'title', 'details', 'rankingScore', 'personalRating'],
      ['rank', 'title', 'details', 'rankingScore', 'personalRating'],
    ]);
    expect(parsed[1].yearsAired).toBe('2017–');
    expect(parsed[4].details).toBe('45.2M sold · 1996');
    expect(createItemsCsv(mixed).split('\r\n')[0]).toContain('"Details"');
  });

  it('rejects malformed shared snapshots', () => {
    expect(isSharedResultsSnapshot({
      version: 1, createdAt: '2026-10-07T00:00:00.000Z', collection: { name: 'Bad' },
      items: [{ id: 'x', name: 'X', preferenceScore: '9', personalRating: null }],
      comparisons: 0, refinementCount: 0,
    })).toBe(false);
  });
});
