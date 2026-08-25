import { describe, expect, it } from 'vitest';

import {
  buildTmdbGenerationRequestFromSource,
  validateRefreshSourceRequest,
} from './refresh-generated-collection.mjs';

function createTmdbSource(overrides = {}) {
  return {
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
      ...overrides,
    },
  };
}

describe('validateRefreshSourceRequest', () => {
  it('accepts a generated source', () => {
    const result = validateRefreshSourceRequest({
      collectionId: 'pixar-features-movies',
      source: createTmdbSource(),
    });

    expect(result.ok).toBe(true);
  });

  it('rejects embedded sources', () => {
    const result = validateRefreshSourceRequest({
      collectionId: 'mcu-movies',
      source: {
        kind: 'embedded',
        provider: 'tmdb',
      },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Only generated collection sources can be refreshed.',
    });
  });
});

describe('buildTmdbGenerationRequestFromSource', () => {
  it('reconstructs the original generation request from the saved definition', () => {
    const result = buildTmdbGenerationRequestFromSource(
      'pixar-features-movies',
      createTmdbSource(),
    );

    expect(result).toEqual({
      ok: true,
      request: {
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

  it('supports older generated definitions that do not store collectionId', () => {
    const source = createTmdbSource();
    delete source.definition.collectionId;

    const result = buildTmdbGenerationRequestFromSource('pixar-features-movies', source);

    expect(result.ok).toBe(true);
    expect(result.request.collectionId).toBe('pixar-features');
  });

  it('rejects a malformed TMDB source definition', () => {
    const result = buildTmdbGenerationRequestFromSource(
      'pixar-features-movies',
      createTmdbSource({ limit: 999 }),
    );

    expect(result).toEqual({
      ok: false,
      error: 'TMDB source definition is invalid: Maximum results must be between 1 and 250.',
    });
  });
});
