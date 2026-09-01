import { describe, expect, it } from 'vitest';

import { validateIgdbGenerationRequest } from '../../api/generate.js';
import { CORE_IGDB_GAME_TYPES } from '../providers/igdb.mjs';

describe('IGDB API generation validation', () => {
  it('accepts the runtime game request shape used by the browser generator', () => {
    expect(
      validateIgdbGenerationRequest({
        mediaType: 'game',
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'generated-1234',
        limit: 50,
        igdbId: 5,
        sort: 'popular',
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      }),
    ).toEqual({
      ok: true,
      request: {
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'generated-1234',
        igdbId: 5,
        limit: 50,
        sort: 'popular',
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });
  });
});
