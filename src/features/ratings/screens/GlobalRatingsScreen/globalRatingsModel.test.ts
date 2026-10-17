import { describe, expect, it } from 'vitest';
import type { RankItem } from '@/domain/models';
import { buildRatingCatalog, sortRatedItems, type RatedItem } from './globalRatingsModel';
import type { PersonalRatingMap } from '../../personalRatings';

function row(name: string, subtitle: string, rating: number | null, updatedAt: string | null): RatedItem {
  const item: RankItem = { id: name, name, subtitle };
  return { key: `local:${name}`, item, rating, updatedAt };
}

const sample = [
  row('Zeta', '2000', null, '2026-01-02'),
  row('Alpha', '2022', 9.5, '2026-01-01'),
  row('Beta', '1984', 8, '2026-01-03'),
  row('Gamma', 'Unknown', null, null),
];
const names = (items: RatedItem[]) => items.map((r) => r.item.name);

describe('Global Ratings sorting', () => {
  it('sorts both name directions, naturally', () => {
    expect(names(sortRatedItems(sample, 'nameAsc'))).toEqual(['Alpha', 'Beta', 'Gamma', 'Zeta']);
    expect(names(sortRatedItems(sample, 'nameDesc'))).toEqual(['Zeta', 'Gamma', 'Beta', 'Alpha']);
  });
  it('sorts dated items chronologically and leaves unknown years at the end', () => {
    expect(names(sortRatedItems(sample, 'dateDesc'))).toEqual(['Alpha', 'Zeta', 'Beta', 'Gamma']);
    expect(names(sortRatedItems(sample, 'dateAsc'))).toEqual(['Beta', 'Zeta', 'Alpha', 'Gamma']);
  });
  it('sorts rating descending and ascending without confusing unrated with zero', () => {
    expect(names(sortRatedItems(sample, 'highest'))).toEqual(['Alpha', 'Beta', 'Gamma', 'Zeta']);
    expect(names(sortRatedItems(sample, 'lowest'))).toEqual(['Beta', 'Alpha', 'Gamma', 'Zeta']);
  });
  it('honors the most recent rating edit, including a cleared rating', () => {
    expect(names(sortRatedItems(sample, 'recent'))).toEqual(['Beta', 'Zeta', 'Alpha', 'Gamma']);
  });
  it('does not mutate its input', () => {
    const original = names(sample);
    sortRatedItems(sample, 'nameDesc');
    expect(names(sample)).toEqual(original);
  });
});

const storedRatings: PersonalRatingMap = {
  'tmdb:movie:862': { value: 9.5, updatedAt: '2026-10-11T00:00:00.000Z' },
  'igdb:game:1': { value: 8, updatedAt: '2026-10-11T01:00:00.000Z' },
};
const toyStory = { id: 'toy-862', name: 'Toy Story', source: { provider: 'tmdb', type: 'movie', id: '862' } };
describe('Global Ratings catalog', () => {
  it('combines collection metadata with independent ratings', () => {
    const result = buildRatingCatalog([], [toyStory], [], {}, storedRatings);
    expect(result.find(item => item.key === 'tmdb:movie:862')?.rating).toBe(9.5);
    expect(result.find(item => item.key === 'igdb:game:1')?.rating).toBe(8);
  });
  it('retains remembered standalone item information', () => {
    const result = buildRatingCatalog([], [], [], { 'tmdb:movie:862': toyStory }, storedRatings);
    expect(result.find(item => item.key === 'tmdb:movie:862')?.item.name).toBe('Toy Story');
  });
});
