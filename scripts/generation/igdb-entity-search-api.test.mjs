import { describe, expect, it } from 'vitest';

import { validateIgdbEntitySearchRequest } from '../../api/search-igdb-entity.js';

describe('validateIgdbEntitySearchRequest', () => {
  it('accepts supported IGDB entity searches', () => {
    expect(
      validateIgdbEntitySearchRequest({
        mode: 'franchise',
        query: ' Halo ',
      }),
    ).toEqual({
      ok: true,
      request: {
        mode: 'franchise',
        query: 'Halo',
      },
    });
  });

  it('rejects unsupported modes', () => {
    expect(
      validateIgdbEntitySearchRequest({
        mode: 'actor',
        query: 'Steve Downes',
      }),
    ).toEqual({
      ok: false,
      error: 'IGDB entity search mode must be genre, franchise, platform, or company.',
    });
  });
});
