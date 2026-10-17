import { describe, it, expect, vi } from 'vitest';
import { findRateItems, rankDiscoveryMatches } from './search-items.mjs';
import { validateFindRateRequest } from '../../api/find-rate-items.js';

const providers = {
  tmdb: { searchMovie: vi.fn(async () => [{ id: 862, title: 'Toy Story', release_date: '1995-11-22', poster_path: '/toy.jpg' }]),
    searchTv: vi.fn(async () => [{ id: 1399, name: 'Game of Thrones', first_air_date: '2011-04-17' }]) },
  igdb: { searchGames: vi.fn(async () => [{ id: 100, name: 'Halo', slug: 'halo', first_release_date: 946684800, cover: { image_id: 'co1' } }]) },
  hardcover: { searchBooks: vi.fn(async () => [
    { id: 100, canonical_id: 25, title: 'Dune', release_year: 1965, image: { url: 'https://example.com/dune.jpg' } },
    { id: 101, canonical_id: 25, title: 'Dune', release_year: 1965 },
  ]) },
};

describe('Find & Rate shared discovery', () => {
  it('filters unrelated provider matches and puts exact titles first', () => {
    const rows = [{ name: 'Halo 3: ODST' }, { name: 'Harry Potter 3' }, { name: 'Halo 3' }];
    expect(rankDiscoveryMatches(rows, 'Halo 3', item => item.name).map(item => item.name))
      .toEqual(['Halo 3', 'Halo 3: ODST']);
    const shows = [{ name: 'Breaking the Deal With My Hockey Bad Boy' }, { name: 'Breaking Bad Fortune Teller' }, { name: 'Breaking Bad' }];
    expect(rankDiscoveryMatches(shows, 'Breaking Bad', item => item.name).map(item => item.name))
      .toEqual(['Breaking Bad', 'Breaking Bad Fortune Teller']);
  });
  it('handles series qualifiers without showing unrelated titles', () => {
    const rows = [{ name: 'The Two Towers' }, { name: 'Dune Messiah' }, { name: 'Dune' }];
    expect(rankDiscoveryMatches(rows, 'Dune', item => item.name).map(item => item.name))
      .toEqual(['Dune', 'Dune Messiah']);
  });
  it('validates provider, query, and required TMDB type', () => {
    expect(validateFindRateRequest({ provider: 'tmdb', query: 'Halo' }).ok).toBe(false);
    expect(validateFindRateRequest({ provider: 'foo', query: 'Halo' }).ok).toBe(false);
    expect(validateFindRateRequest({ provider: 'igdb', query: ' a ' }).ok).toBe(false);
    expect(validateFindRateRequest({ provider: 'hardcover', query: ' Dune ' }).ok).toBe(true);
  });
  it('returns canonical TMDB movie and show keys', async () => {
    const movie = await findRateItems({ provider: 'tmdb', mediaType: 'movie', query: 'Toy Story', providers });
    expect(movie[0].source).toEqual({ provider: 'tmdb', type: 'movie', id: '862' });
    const tv = await findRateItems({ provider: 'tmdb', mediaType: 'tv', query: 'Game of Thrones', providers });
    expect(tv[0].source).toEqual({ provider: 'tmdb', type: 'tv', id: '1399' });
  });
  it('returns canonical IGDB game metadata', async () => {
    const games = await findRateItems({ provider: 'igdb', query: 'Halo', providers });
    expect(games[0].source).toEqual({ provider: 'igdb', type: 'game', id: '100' });
    expect(games[0].image).toContain('co1');
  });
  it('deduplicates Hardcover editions by canonical book concept', async () => {
    const books = await findRateItems({ provider: 'hardcover', query: 'Dune', providers });
    expect(books).toHaveLength(1);
    expect(books[0].source).toEqual({ provider: 'hardcover', type: 'book', id: '25' });
  });
});
