import { describe, expect, it, vi } from 'vitest';

import {
  refreshGeneratedCollectionSource,
  validateRefreshSourceRequest,
} from './refresh-generated-collection.mjs';
import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
} from '../providers/igdb.mjs';
import { buildIgdbGenerationRequestFromSource } from './providers/igdb-source.mjs';
import { buildTmdbGenerationRequestFromSource } from './providers/tmdb-source.mjs';

const pixarSource = {
  kind: 'generated',
  provider: 'tmdb',
  originalRequest: 'Pixar Animation Studios',
  definition: {
    schemaVersion: 1,
    collectionId: 'pixar-features',
    mode: 'company-features',
    query: 'Pixar Animation Studios',
    tmdbId: 3,
    mediaTypes: ['movie'],
    limit: 250,
    fromYear: null,
    toYear: null,
    sort: 'release-asc',
    minRuntime: null,
    excludeDocumentaries: false,
    includeAdult: false,
    language: 'en-US',
  },
};

describe('generated collection source refresh', () => {
  it('validates a generated source request without knowing provider details', () => {
    expect(
      validateRefreshSourceRequest({
        collectionId: 'pixar-features-movies',
        source: pixarSource,
      }),
    ).toMatchObject({
      ok: true,
    });
  });

  it('reconstructs the original TMDB generation request from the saved source definition', () => {
    const result = buildTmdbGenerationRequestFromSource(
      'pixar-features-movies',
      pixarSource,
    );

    expect(result).toEqual({
      ok: true,
      request: {
        mediaType: 'movie',
        mode: 'company-features',
        query: 'Pixar Animation Studios',
        collectionId: 'pixar-features',
        limit: 250,
        tmdbId: 3,
        fromYear: null,
        toYear: null,
        sort: 'release-asc',
        minRuntime: null,
        excludeDocumentaries: false,
        includeAdult: false,
        language: 'en-US',
      },
    });
  });

  it('dispatches refreshes through the registered source provider', async () => {
    const tmdbRefresh = vi.fn().mockResolvedValue({
      collection: {
        id: 'pixar-features-movies',
        name: 'Pixar Feature Films',
        items: [],
      },
      candidateCount: 0,
      validatedCount: 0,
      missingPosterCount: 0,
    });

    const result = await refreshGeneratedCollectionSource({
      collectionId: 'pixar-features-movies',
      source: pixarSource,
      refreshers: {
        tmdb: tmdbRefresh,
      },
      today: '2026-08-25',
      logger: console,
    });

    expect(tmdbRefresh).toHaveBeenCalledWith({
      collectionId: 'pixar-features-movies',
      source: pixarSource,
      today: '2026-08-25',
      logger: console,
    });
    expect(result.collection.id).toBe('pixar-features-movies');
  });

  it('rejects unsupported providers at the dispatcher boundary', async () => {
    await expect(
      refreshGeneratedCollectionSource({
        collectionId: 'example-collection',
        source: {
          kind: 'generated',
          provider: 'future-provider',
          definition: {},
        },
        refreshers: {},
      }),
    ).rejects.toThrow('Unsupported collection source provider: future-provider');
  });

  it('reconstructs TV sources without coupling refresh to movie-only fields', () => {
    const result = buildTmdbGenerationRequestFromSource('generated-test-tv', {
      kind: 'generated',
      provider: 'tmdb',
      originalRequest: 'Drama',
      definition: {
        schemaVersion: 2,
        collectionId: 'generated-test',
        mediaType: 'tv',
        mode: 'genre',
        query: 'Drama',
        tmdbId: 18,
        mediaTypes: ['tv'],
        limit: 50,
        fromYear: null,
        toYear: null,
        sort: 'popularity',
        minRuntime: null,
        excludeDocumentaries: false,
        includeAdult: false,
        language: 'en-US',
      },
    });

    expect(result).toEqual({
      ok: true,
      request: {
        mediaType: 'tv',
        mode: 'genre',
        query: 'Drama',
        collectionId: 'generated-test',
        limit: 50,
        tmdbId: 18,
        fromYear: null,
        toYear: null,
        sort: 'popularity',
        minRuntime: null,
        excludeDocumentaries: false,
        includeAdult: false,
        language: 'en-US',
      },
    });
  });

  it('reconstructs IGDB sources from stable provider IDs', () => {
    const result = buildIgdbGenerationRequestFromSource('generated-halo-games', {
      kind: 'generated',
      provider: 'igdb',
      originalRequest: 'Halo',
      definition: {
        schemaVersion: 1,
        collectionId: 'generated-halo',
        mediaType: 'game',
        mode: 'franchise',
        query: 'Halo',
        igdbId: 24,
        resolvedName: 'Halo',
        limit: 50,
        sort: 'release-asc',
      },
    });

    expect(result).toEqual({
      ok: true,
      request: {
        mode: 'franchise',
        query: 'Halo',
        collectionId: 'generated-halo',
        igdbId: 24,
        limit: 50,
        sort: 'release-asc',
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });
  });

  it('preserves explicit IGDB DLC and expansion scope during refresh reconstruction', () => {
    const gameTypes = [
      ...CORE_IGDB_GAME_TYPES,
      ...DLC_EXPANSION_IGDB_GAME_TYPES,
    ];

    const result = buildIgdbGenerationRequestFromSource('generated-destiny-games', {
      kind: 'generated',
      provider: 'igdb',
      originalRequest: 'Destiny',
      definition: {
        schemaVersion: 2,
        collectionId: 'generated-destiny',
        mediaType: 'game',
        mode: 'franchise',
        query: 'Destiny',
        igdbId: 5,
        resolvedName: 'Destiny',
        limit: 50,
        sort: 'popular',
        gameTypes,
      },
    });

    expect(result).toEqual({
      ok: true,
      request: {
        mode: 'franchise',
        query: 'Destiny',
        collectionId: 'generated-destiny',
        igdbId: 5,
        limit: 50,
        sort: 'popular',
        gameTypes,
      },
    });
  });

  it('dispatches IGDB refreshes without coupling the generic dispatcher to games', async () => {
    const igdbRefresh = vi.fn().mockResolvedValue({
      collection: {
        id: 'generated-halo-games',
        name: 'Halo Games',
        items: [],
      },
      candidateCount: 0,
      validatedCount: 0,
      missingPosterCount: 0,
    });

    const source = {
      kind: 'generated',
      provider: 'igdb',
      definition: {
        mode: 'franchise',
        query: 'Halo',
        collectionId: 'generated-halo',
        igdbId: 24,
        limit: 50,
        sort: 'rating',
      },
    };

    const result = await refreshGeneratedCollectionSource({
      collectionId: 'generated-halo-games',
      source,
      refreshers: {
        igdb: igdbRefresh,
      },
      logger: console,
    });

    expect(igdbRefresh).toHaveBeenCalledWith({
      collectionId: 'generated-halo-games',
      source,
      today: undefined,
      logger: console,
    });
    expect(result.collection.name).toBe('Halo Games');
  });

  it('validates composite sources without coupling them to specific providers', () => {
    expect(
      validateRefreshSourceRequest({
        collectionId: 'star-wars-movies-and-games',
        source: {
          kind: 'composite',
          originalRequest: 'Star Wars movies and games',
          sources: [
            pixarSource,
            {
              kind: 'generated',
              provider: 'igdb',
              definition: {
                schemaVersion: 2,
                mediaType: 'game',
                mode: 'franchise',
                igdbId: 1,
              },
            },
          ],
        },
      }),
    ).toMatchObject({ ok: true });
  });

  it('refreshes composite sources sequentially and deduplicates canonical items', async () => {
    const sharedItem = {
      id: 'shared-1',
      name: 'Shared Item',
      source: { provider: 'tmdb', type: 'movie', id: '1' },
      image: 'poster.jpg',
    };

    const tmdbRefresh = vi.fn().mockResolvedValue({
      collection: {
        id: 'mixed-media',
        name: 'Movies',
        items: [
          sharedItem,
          {
            id: 'movie-2',
            name: 'Movie Two',
            source: { provider: 'tmdb', type: 'movie', id: '2' },
          },
        ],
      },
      candidateCount: 2,
      validatedCount: 2,
      missingPosterCount: 1,
    });

    const secondTmdbRefresh = vi.fn().mockResolvedValue({
      collection: {
        id: 'mixed-media',
        name: 'Other Movies',
        items: [sharedItem],
      },
      candidateCount: 1,
      validatedCount: 1,
      missingPosterCount: 0,
    });

    let call = 0;
    const compositeRefresher = vi.fn(async (args) => {
      call += 1;
      return call === 1 ? tmdbRefresh(args) : secondTmdbRefresh(args);
    });

    const source = {
      kind: 'composite',
      originalRequest: 'two movie groups',
      sources: [
        pixarSource,
        {
          ...pixarSource,
          definition: {
            ...pixarSource.definition,
            tmdbId: 4,
          },
        },
      ],
    };

    const result = await refreshGeneratedCollectionSource({
      collectionId: 'mixed-media',
      source,
      refreshers: { tmdb: compositeRefresher },
    });

    expect(compositeRefresher).toHaveBeenCalledTimes(2);
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Shared Item',
      'Movie Two',
    ]);
    expect(result.collection.candidateSource).toEqual(source);
    expect(result.candidateCount).toBe(3);
    expect(result.validatedCount).toBe(2);
    expect(result.missingPosterCount).toBe(1);
  });

});
