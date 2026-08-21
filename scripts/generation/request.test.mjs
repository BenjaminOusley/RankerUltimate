import { describe, expect, it } from 'vitest';

import { parseGenerationRequest } from './request.mjs';

describe('parseGenerationRequest', () => {
  it('creates a request with default options', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror']);

    expect(result).toEqual({
      ok: true,
      request: {
        mode: 'genre',
        query: 'Horror',
        collectionId: 'horror',
        limit: 250,
        tmdbId: null,
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

  it('parses all supported options', () => {
    const result = parseGenerationRequest([
      'actor',
      'Ryan Gosling',
      'gosling',
      '--limit',
      '50',
      '--tmdb-id',
      '30614',
      '--from',
      '2010',
      '--to',
      '2019',
      '--sort',
      'popularity',
      '--min-runtime',
      '75',
      '--exclude-documentaries',
      '--include-adult',
    ]);

    expect(result).toEqual({
      ok: true,
      request: {
        mode: 'actor',
        query: 'Ryan Gosling',
        collectionId: 'gosling',
        limit: 50,
        tmdbId: 30614,
        fromYear: 2010,
        toYear: 2019,
        sort: 'popularity',
        minRuntime: 75,
        excludeDocumentaries: true,
        includeAdult: true,
        language: 'en-US',
      },
    });
  });

  it('rejects missing required arguments', () => {
    const result = parseGenerationRequest(['genre', 'Horror']);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toContain('Missing arguments.');
    }
  });

  it('rejects an unsupported mode', () => {
    const result = parseGenerationRequest(['banana', 'Horror', 'horror']);

    expect(result).toEqual({
      ok: false,
      error:
        'Unsupported generation mode: banana\n' +
        'Currently supported: company, company-features, director, actor, genre',
    });
  });

  it('rejects an invalid limit', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--limit', '0']);

    expect(result).toEqual({
      ok: false,
      error: '--limit must be a positive integer.',
    });
  });

  it('rejects an invalid TMDB ID', () => {
    const result = parseGenerationRequest(['actor', 'Ryan Gosling', 'gosling', '--tmdb-id', 'abc']);

    expect(result).toEqual({
      ok: false,
      error: '--tmdb-id must be a positive integer.',
    });
  });

  it('rejects a TMDB ID for an incompatible mode', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--tmdb-id', '27']);

    expect(result).toEqual({
      ok: false,
      error: '--tmdb-id can only be used with company, company-features, actor, or director mode.',
    });
  });

  it('rejects a backwards year range', () => {
    const result = parseGenerationRequest([
      'genre',
      'Horror',
      'horror',
      '--from',
      '2000',
      '--to',
      '1990',
    ]);

    expect(result).toEqual({
      ok: false,
      error: '--from cannot be later than --to.',
    });
  });

  it('rejects an unsupported sort', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--sort', 'random']);

    expect(result).toEqual({
      ok: false,
      error: '--sort must be release-asc, release-desc, or popularity.',
    });
  });

  it('rejects an invalid minimum runtime', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--min-runtime', '-1']);

    expect(result).toEqual({
      ok: false,
      error: '--min-runtime must be a non-negative integer.',
    });
  });

  it('rejects unknown options', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--whatever']);

    expect(result).toEqual({
      ok: false,
      error: 'Unknown option: --whatever',
    });
  });

  it('rejects an option with a missing value', () => {
    const result = parseGenerationRequest(['genre', 'Horror', 'horror', '--limit']);

    expect(result).toEqual({
      ok: false,
      error: '--limit requires a value.',
    });
  });

  it('accepts a TMDB ID for company mode', () => {
    const result = parseGenerationRequest(['company', 'Pixar', 'pixar', '--tmdb-id', '3']);

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.request.tmdbId).toBe(3);
    }
  });
});
