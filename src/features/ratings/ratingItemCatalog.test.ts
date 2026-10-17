import { beforeEach, describe, expect, it } from 'vitest';
import { getCanonicalItemKey } from '@/domain/itemIdentity';
import { itemKind, loadRatedItemCatalog, rememberRatedItem, placeholderForRatingKey, seedRatedItemCatalog, mergeKnownRatedItems } from './ratingItemCatalog';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  } });
});

describe('independent item metadata catalog', () => {
  it('preserves source metadata outside collections', () => {
    const item = { id: 'dune-25', name: 'Dune', image: 'https://example.com/dune.jpg', source: { provider: 'hardcover', type: 'book', id: '25' } };
    rememberRatedItem({}, item);
    expect(loadRatedItemCatalog()[getCanonicalItemKey(item)]).toMatchObject(item);
    expect(itemKind(item)).toBe('book');
  });
  it('does not accept corrupted metadata or a spoofed identity key', () => {
    data.set('rankerultimate:rated-items:v1', JSON.stringify({ 'igdb:game:1': { id: 'bad', name: 'Wrong' } }));
    expect(loadRatedItemCatalog()).toEqual({});
  });
  it('keeps metadata for ratings created before the Global Ratings feature', () => {
    const item = { id: 'toy-862', name: 'Toy Story', source: { provider: 'tmdb', type: 'movie', id: '862' } };
    const ratings = { 'tmdb:movie:862': { value: 9, updatedAt: '2026-10-11T00:00:00.000Z' } };
    const result = seedRatedItemCatalog({}, [item], ratings);
    expect(result['tmdb:movie:862']).toEqual(item);
    expect(loadRatedItemCatalog()['tmdb:movie:862']).toEqual(item);
  });
  it('imports late-loaded rated metadata without writing during the merge', () => {
    const item = { id: 'lotr-100', name: 'The Return of the King', source: { provider: 'hardcover', type: 'book', id: '100' } };
    const ratings = { 'hardcover:book:100': { value: 10, updatedAt: '2026-10-11T00:00:00Z' } };
    const merged = mergeKnownRatedItems({}, [item], ratings);
    expect(merged['hardcover:book:100']).toEqual(item);
    expect(loadRatedItemCatalog()).toEqual({});
  });
  it('categorizes non-IGDB game datasets as games', () => {
    expect(itemKind({ id: 'ac', name: 'Animal Crossing', source: { provider: 'reported-sales', type: 'game', id: 'abc' } })).toBe('game');
  });
  it('records a timestamp when a rating is cleared for recent-unrated ordering', () => {
    const item = { id: 'game-1', name: 'Game 1' };
    const remembered = rememberRatedItem({}, item);
    expect(Date.parse(remembered['local:game-1'].lastRatingEditAt ?? '')).not.toBeNaN();
  });
  it('can reconstruct identities for orphan ratings', () => {
    expect(getCanonicalItemKey(placeholderForRatingKey('tmdb:movie:862')!)).toBe('tmdb:movie:862');
    expect(getCanonicalItemKey(placeholderForRatingKey('local:hello')!)).toBe('local:hello');
  });
});
