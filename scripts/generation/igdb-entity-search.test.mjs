import { describe, expect, it } from 'vitest';

import { findIgdbEntityMatches } from './igdb-entity-search.mjs';

describe('IGDB entity search', () => {
  it('searches the endpoint associated with the requested mode', async () => {
    const calls = [];
    const igdb = {
      async searchGenres(query, limit) {
        calls.push(['genre', query, limit]);
        return [{ id: 5, name: 'Shooter' }];
      },
      async searchFranchises() {
        throw new Error('wrong endpoint');
      },
      async searchPlatforms() {
        throw new Error('wrong endpoint');
      },
      async searchCompanies() {
        throw new Error('wrong endpoint');
      },
    };

    const matches = await findIgdbEntityMatches({
      igdb,
      mode: 'genre',
      query: 'Shooter',
      limit: 7,
    });

    expect(calls).toEqual([['genre', 'Shooter', 7]]);
    expect(matches).toEqual([
      {
        id: 5,
        name: 'Shooter',
        detail: null,
        image: null,
      },
    ]);
  });

  it('puts an exact match before broader matches', async () => {
    const igdb = {
      async searchFranchises() {
        return [
          { id: 2, name: 'Halo Wars' },
          { id: 1, name: 'Halo' },
          { id: 3, name: 'Halo: The Master Chief Collection' },
        ];
      },
    };

    const matches = await findIgdbEntityMatches({
      igdb,
      mode: 'franchise',
      query: 'Halo',
    });

    expect(matches[0]).toMatchObject({ id: 1, name: 'Halo' });
  });

  it('adds useful platform and company display metadata', async () => {
    const platformMatches = await findIgdbEntityMatches({
      igdb: {
        async searchPlatforms() {
          return [{ id: 48, name: 'PlayStation 4', abbreviation: 'PS4' }];
        },
      },
      mode: 'platform',
      query: 'PlayStation 4',
    });

    const companyMatches = await findIgdbEntityMatches({
      igdb: {
        async searchCompanies() {
          return [{ id: 70, name: 'Nintendo', logo: { image_id: 'logo123' } }];
        },
      },
      mode: 'company',
      query: 'Nintendo',
    });

    expect(platformMatches[0].detail).toBe('PS4');
    expect(companyMatches[0].image).toBe(
      'https://images.igdb.com/igdb/image/upload/t_logo_med/logo123.jpg',
    );
  });
});
