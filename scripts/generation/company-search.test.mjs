import { describe, expect, it } from 'vitest';

import { findCompanyMatches } from './company-search.mjs';

describe('findCompanyMatches', () => {
  it('prefers exact company matches', async () => {
    const tmdb = {
      async searchCompany() {
        return [
          {
            id: 1,
            name: 'Marvel',
            origin_country: 'US',
            logo_path: null,
          },
          {
            id: 2,
            name: 'Marvel Studios',
            origin_country: 'US',
            logo_path: null,
          },
        ];
      },
    };

    const matches = await findCompanyMatches({
      tmdb,
      query: 'Marvel',
    });

    expect(matches.map((company) => company.id)).toEqual([1]);
  });

  it('supports containment aliases', async () => {
    const tmdb = {
      async searchCompany() {
        return [
          {
            id: 3,
            name: 'Pixar',
            origin_country: 'US',
            logo_path: null,
          },
        ];
      },
    };

    const matches = await findCompanyMatches({
      tmdb,
      query: 'Pixar Animation Studios',
    });

    expect(matches).toEqual([
      {
        id: 3,
        name: 'Pixar',
        originCountry: 'US',
        logo: null,
      },
    ]);
  });

  it('falls back to search results when no exact or alias match exists', async () => {
    const tmdb = {
      async searchCompany() {
        return [
          {
            id: 10,
            name: 'Company One',
            origin_country: 'US',
            logo_path: null,
          },
          {
            id: 11,
            name: 'Company Two',
            origin_country: 'GB',
            logo_path: null,
          },
        ];
      },
    };

    const matches = await findCompanyMatches({
      tmdb,
      query: 'Unknown',
    });

    expect(matches.map((company) => company.id)).toEqual([10, 11]);
  });
});
