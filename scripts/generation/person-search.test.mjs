import { describe, expect, it } from 'vitest';

import { findPersonMatches } from './person-search.mjs';

describe('findPersonMatches', () => {
  it('prefers exact matches in the expected department', async () => {
    const tmdb = {
      async searchPerson() {
        return [
          {
            id: 1,
            name: 'Christopher Nolan',
            known_for_department: 'Directing',
            known_for: [
              {
                title: 'Inception',
              },
            ],
          },
          {
            id: 2,
            name: 'Christopher Nolan',
            known_for_department: 'Acting',
            known_for: [],
          },
          {
            id: 3,
            name: 'Christopher Nolan',
            known_for_department: 'Directing',
            known_for: [],
          },
        ];
      },
    };

    const matches = await findPersonMatches({
      tmdb,
      query: 'Christopher Nolan',
      mode: 'director',
    });

    expect(matches.map((person) => person.id)).toEqual([1, 3]);
  });

  it('returns one exact acting match when it is unambiguous', async () => {
    const tmdb = {
      async searchPerson() {
        return [
          {
            id: 30614,
            name: 'Ryan Gosling',
            known_for_department: 'Acting',
            known_for: [
              {
                title: 'Blade Runner 2049',
              },
              {
                title: 'La La Land',
              },
            ],
          },
          {
            id: 99,
            name: 'Ryan Gosling Jr.',
            known_for_department: 'Acting',
            known_for: [],
          },
        ];
      },
    };

    const matches = await findPersonMatches({
      tmdb,
      query: 'Ryan Gosling',
      mode: 'actor',
    });

    expect(matches).toEqual([
      {
        id: 30614,
        name: 'Ryan Gosling',
        department: 'Acting',
        knownFor: ['Blade Runner 2049', 'La La Land'],
      },
    ]);
  });

  it('falls back to department matches for a partial name', async () => {
    const tmdb = {
      async searchPerson() {
        return [
          {
            id: 1,
            name: 'Chris Nolan',
            known_for_department: 'Directing',
            known_for: [],
          },
          {
            id: 2,
            name: 'Nolan Smith',
            known_for_department: 'Acting',
            known_for: [],
          },
        ];
      },
    };

    const matches = await findPersonMatches({
      tmdb,
      query: 'Nolan',
      mode: 'director',
    });

    expect(matches.map((person) => person.id)).toEqual([1]);
  });
});
