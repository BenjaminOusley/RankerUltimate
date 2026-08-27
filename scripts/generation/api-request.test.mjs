import { describe, expect, it } from 'vitest';

import { validateGenerationRequest } from '../../api/generate.js';

function createRequest(overrides = {}) {
  return {
    mediaType: 'movie',
    mode: 'genre',
    query: 'Horror',
    collectionId: 'horror-genre',
    limit: 50,
    tmdbId: null,
    fromYear: 1980,
    toYear: 1989,
    sort: 'popularity',
    minRuntime: 75,
    excludeDocumentaries: true,
    includeAdult: false,
    language: 'en-US',
    ...overrides,
  };
}

describe('validateGenerationRequest', () => {
  it('accepts a valid request', () => {
    const result = validateGenerationRequest(createRequest());

    expect(result.ok).toBe(true);
  });

  it('rejects a limit above the server maximum', () => {
    const result = validateGenerationRequest(
      createRequest({
        limit: 251,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'Maximum results must be between 1 and 250.',
    });
  });

  it('rejects a backwards year range', () => {
    const result = validateGenerationRequest(
      createRequest({
        fromYear: 2000,
        toYear: 1990,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'From Year cannot be later than To Year.',
    });
  });

  it('accepts a TMDB genre ID so generated genre sources can refresh stably', () => {
    const result = validateGenerationRequest(
      createRequest({
        tmdbId: 27,
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts a TMDB ID for company mode', () => {
    const result = validateGenerationRequest(
      createRequest({
        mode: 'company',
        query: 'Pixar',
        collectionId: 'pixar',
        tmdbId: 3,
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('accepts TV genre requests', () => {
    const result = validateGenerationRequest(
      createRequest({
        mediaType: 'tv',
        mode: 'genre',
        query: 'Drama',
        collectionId: 'tv-drama',
        minRuntime: null,
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('rejects movie-only modes for TV', () => {
    const result = validateGenerationRequest(
      createRequest({
        mediaType: 'tv',
        mode: 'director',
        query: 'Christopher Nolan',
        collectionId: 'nolan-tv',
        minRuntime: null,
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'director mode is only supported for movies.',
    });
  });

});
