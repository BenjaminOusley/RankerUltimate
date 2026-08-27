import { describe, expect, it, vi } from 'vitest';

import {
  refreshGeneratedCollectionSource,
  validateRefreshSourceRequest,
} from './refresh-generated-collection.mjs';
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

});
