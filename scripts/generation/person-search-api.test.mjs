import { describe, expect, it } from 'vitest';

import { validatePersonSearchRequest } from '../../api/search-person.js';

describe('validatePersonSearchRequest', () => {
  it('accepts a valid director search', () => {
    expect(
      validatePersonSearchRequest({
        mode: 'director',
        query: 'Christopher Nolan',
      }),
    ).toEqual({
      ok: true,
      request: {
        mode: 'director',
        query: 'Christopher Nolan',
      },
    });
  });

  it('accepts a valid actor search', () => {
    expect(
      validatePersonSearchRequest({
        mode: 'actor',
        query: 'Ryan Gosling',
      }).ok,
    ).toBe(true);
  });

  it('rejects a non-person mode', () => {
    expect(
      validatePersonSearchRequest({
        mode: 'genre',
        query: 'Horror',
      }),
    ).toEqual({
      ok: false,
      error: 'Person search mode must be actor or director.',
    });
  });

  it('rejects an empty query', () => {
    expect(
      validatePersonSearchRequest({
        mode: 'actor',
        query: '   ',
      }),
    ).toEqual({
      ok: false,
      error: 'Search query must contain between 1 and 200 characters.',
    });
  });
});
