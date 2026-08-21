import { describe, expect, it } from 'vitest';

import { generateTmdbCollection } from './tmdb-generator.mjs';

const silentLogger = {
  log() {},
  error() {},
};

function createRequest(overrides = {}) {
  return {
    mode: 'genre',
    query: 'Horror',
    collectionId: 'test',
    limit: 250,
    tmdbId: null,
    fromYear: null,
    toYear: null,
    sort: 'release-asc',
    minRuntime: null,
    excludeDocumentaries: false,
    includeAdult: false,
    language: 'en-US',
    ...overrides,
  };
}

function movie({
  id,
  title,
  releaseDate,
  runtime = 100,
  genres = [],
  popularity = 0,
  adult = false,
  video = false,
}) {
  return {
    id,
    title,
    release_date: releaseDate,
    runtime,
    genres,
    popularity,
    adult,
    video,
    poster_path: null,
  };
}

describe('generateTmdbCollection', () => {
  it('keeps only actual Director credits', async () => {
    const details = new Map([
      [
        1,
        movie({
          id: 1,
          title: 'Directed Movie',
          releaseDate: '2001-01-01',
        }),
      ],
      [
        2,
        movie({
          id: 2,
          title: 'Produced Movie',
          releaseDate: '2002-01-01',
        }),
      ],
    ]);

    const tmdb = {
      async getPersonById() {
        return {
          id: 525,
          name: 'Test Director',
          known_for_department: 'Directing',
        };
      },

      async getPersonMovieCredits() {
        return {
          cast: [],
          crew: [
            {
              id: 1,
              title: 'Directed Movie',
              release_date: '2001-01-01',
              job: 'Director',
              adult: false,
              video: false,
              popularity: 1,
            },
            {
              id: 2,
              title: 'Produced Movie',
              release_date: '2002-01-01',
              job: 'Producer',
              adult: false,
              video: false,
              popularity: 2,
            },
          ],
        };
      },

      async getMovieById(id) {
        return details.get(id);
      },
    };

    const result = await generateTmdbCollection({
      request: createRequest({
        mode: 'director',
        query: 'Test Director',
        collectionId: 'test-director',
        tmdbId: 525,
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(result.collection.items.map((item) => item.name)).toEqual(['Directed Movie']);

    expect(result.candidateCount).toBe(1);

    expect(result.collection.description).toBe('Movies directed by Test Director.');
  });

  it('applies the limit after canonical validation', async () => {
    const details = new Map([
      [
        1,
        movie({
          id: 1,
          title: 'Too Short',
          releaseDate: '2000-01-01',
          runtime: 30,
        }),
      ],
      [
        2,
        movie({
          id: 2,
          title: 'Documentary',
          releaseDate: '2001-01-01',
          genres: [
            {
              id: 99,
              name: 'Documentary',
            },
          ],
        }),
      ],
      [
        3,
        movie({
          id: 3,
          title: 'First Valid',
          releaseDate: '2002-01-01',
        }),
      ],
      [
        4,
        movie({
          id: 4,
          title: 'Second Valid',
          releaseDate: '2003-01-01',
        }),
      ],
    ]);

    const loadedIds = [];

    const tmdb = {
      async getPersonById() {
        return {
          id: 1,
          name: 'Test Actor',
          known_for_department: 'Acting',
        };
      },

      async getPersonMovieCredits() {
        return {
          crew: [],
          cast: [
            {
              id: 1,
              release_date: '2000-01-01',
              adult: false,
              video: false,
              popularity: 1,
            },
            {
              id: 2,
              release_date: '2001-01-01',
              adult: false,
              video: false,
              popularity: 2,
            },
            {
              id: 3,
              release_date: '2002-01-01',
              adult: false,
              video: false,
              popularity: 3,
            },
            {
              id: 4,
              release_date: '2003-01-01',
              adult: false,
              video: false,
              popularity: 4,
            },
          ],
        };
      },

      async getMovieById(id) {
        loadedIds.push(id);
        return details.get(id);
      },
    };

    const result = await generateTmdbCollection({
      request: createRequest({
        mode: 'actor',
        query: 'Test Actor',
        collectionId: 'test-actor',
        tmdbId: 1,
        limit: 1,
        minRuntime: 75,
        excludeDocumentaries: true,
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(result.collection.items.map((item) => item.name)).toEqual(['First Valid']);

    expect(result.validatedCount).toBe(1);

    expect(loadedIds).toEqual([1, 2, 3]);
  });

  it('sorts person credits by descending release date', async () => {
    const details = new Map([
      [
        1,
        movie({
          id: 1,
          title: 'Old',
          releaseDate: '2000-01-01',
        }),
      ],
      [
        2,
        movie({
          id: 2,
          title: 'Newest',
          releaseDate: '2020-01-01',
        }),
      ],
      [
        3,
        movie({
          id: 3,
          title: 'Middle',
          releaseDate: '2010-01-01',
        }),
      ],
    ]);

    const tmdb = {
      async getPersonById() {
        return {
          id: 1,
          name: 'Test Actor',
          known_for_department: 'Acting',
        };
      },

      async getPersonMovieCredits() {
        return {
          crew: [],
          cast: [
            {
              id: 1,
              release_date: '2000-01-01',
              adult: false,
              video: false,
            },
            {
              id: 2,
              release_date: '2020-01-01',
              adult: false,
              video: false,
            },
            {
              id: 3,
              release_date: '2010-01-01',
              adult: false,
              video: false,
            },
          ],
        };
      },

      async getMovieById(id) {
        return details.get(id);
      },
    };

    const result = await generateTmdbCollection({
      request: createRequest({
        mode: 'actor',
        query: 'Test Actor',
        collectionId: 'release-desc-test',
        tmdbId: 1,
        sort: 'release-desc',
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(result.collection.items.map((item) => item.name)).toEqual(['Newest', 'Middle', 'Old']);
  });

  it('builds the correct Discover filters', async () => {
    let receivedFilters = null;
    let receivedLimit = null;

    const tmdb = {
      async getMovieGenres() {
        return [
          {
            id: 27,
            name: 'Horror',
          },
        ];
      },

      async discoverMovies(filters, limit) {
        receivedFilters = filters;
        receivedLimit = limit;

        return [
          {
            id: 1,
          },
        ];
      },

      async getMovieById() {
        return movie({
          id: 1,
          title: 'Horror Movie',
          releaseDate: '1985-01-01',
          runtime: 90,
        });
      },
    };

    await generateTmdbCollection({
      request: createRequest({
        mode: 'genre',
        query: 'Horror',
        collectionId: 'horror-80s',
        fromYear: 1980,
        toYear: 1989,
        sort: 'popularity',
        limit: 50,
        minRuntime: 75,
        excludeDocumentaries: true,
        includeAdult: true,
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(receivedLimit).toBe(50);

    expect(receivedFilters).toEqual({
      include_adult: 'true',
      include_video: 'false',
      language: 'en-US',
      sort_by: 'popularity.desc',
      with_genres: '27',
      'primary_release_date.gte': '1980-01-01',
      'primary_release_date.lte': '1989-12-31',
      'with_runtime.gte': '75',
      without_genres: '99',
    });
  });

  it('applies company-feature defaults during canonical validation', async () => {
    let receivedFilters = null;

    const details = new Map([
      [
        1,
        movie({
          id: 1,
          title: 'Short Film',
          releaseDate: '2000-01-01',
          runtime: 60,
        }),
      ],
      [
        2,
        movie({
          id: 2,
          title: 'Feature Film',
          releaseDate: '2001-01-01',
          runtime: 90,
        }),
      ],
    ]);

    const tmdb = {
      async searchCompany() {
        return [
          {
            id: 3,
            name: 'Pixar',
          },
        ];
      },

      async discoverMovies(filters) {
        receivedFilters = filters;

        return [
          {
            id: 1,
          },
          {
            id: 2,
          },
        ];
      },

      async getMovieById(id) {
        return details.get(id);
      },
    };

    const result = await generateTmdbCollection({
      request: createRequest({
        mode: 'company-features',
        query: 'Pixar Animation Studios',
        collectionId: 'pixar-features',
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(receivedFilters['with_runtime.gte']).toBe('75');

    expect(receivedFilters.without_genres).toBe('99');

    expect(receivedFilters.region).toBe('US');

    expect(receivedFilters.with_release_type).toBe('3|2');

    expect(result.collection.items.map((item) => item.name)).toEqual(['Feature Film']);
  });

  it('uses the canonical adult flag as final validation', async () => {
    const tmdb = {
      async getPersonById() {
        return {
          id: 1,
          name: 'Test Actor',
          known_for_department: 'Acting',
        };
      },

      async getPersonMovieCredits() {
        return {
          crew: [],
          cast: [
            {
              id: 1,
              release_date: '2000-01-01',
              adult: false,
              video: false,
            },
          ],
        };
      },

      async getMovieById() {
        return movie({
          id: 1,
          title: 'Adult Movie',
          releaseDate: '2000-01-01',
          adult: true,
        });
      },
    };

    await expect(
      generateTmdbCollection({
        request: createRequest({
          mode: 'actor',
          query: 'Test Actor',
          collectionId: 'adult-test',
          tmdbId: 1,
          includeAdult: false,
        }),
        tmdb,
        today: '2026-08-20',
        logger: silentLogger,
      }),
    ).rejects.toThrow('No movies passed validation.');

    const included = await generateTmdbCollection({
      request: createRequest({
        mode: 'actor',
        query: 'Test Actor',
        collectionId: 'adult-test',
        tmdbId: 1,
        includeAdult: true,
      }),
      tmdb,
      today: '2026-08-20',
      logger: silentLogger,
    });

    expect(included.collection.items).toHaveLength(1);
  });
});
