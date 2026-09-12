import { describe, expect, it, vi } from 'vitest';

import { CORE_IGDB_GAME_TYPES } from '../providers/igdb.mjs';
import {
  generateIgdbCollection,
  validateIgdbGenerationRequest,
} from './igdb-generator.mjs';

const games = [
  {
    id: 233,
    name: 'Half-Life 2',
    slug: 'half-life-2',
    first_release_date: 1100563200,
    cover: { image_id: 'half-life-2-cover' },
  },
  {
    id: 7351,
    name: 'Doom',
    slug: 'doom-2016',
    first_release_date: 1463097600,
    cover: { image_id: 'doom-cover' },
  },
];

describe('global IGDB collection generation', () => {
  it('accepts a global request without a resolved IGDB entity ID', () => {
    expect(
      validateIgdbGenerationRequest({
        mode: 'global',
        query: 'all time',
        collectionId: 'generated-all-time',
        igdbId: null,
        limit: 500,
        sort: 'popular',
      }),
    ).toEqual({
      ok: true,
      request: {
        mode: 'global',
        query: 'all time',
        collectionId: 'generated-all-time',
        igdbId: null,
        limit: 500,
        sort: 'popular',
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });
  });

  it('routes global generation through the direct global-game provider path', async () => {
    const getGamesGlobal = vi.fn(async () => games);
    const result = await generateIgdbCollection({
      request: {
        mode: 'global',
        query: 'all time',
        collectionId: 'generated-all-time',
        igdbId: null,
        limit: 200,
        sort: 'popular',
      },
      igdb: { getGamesGlobal },
      logger: { log: vi.fn() },
    });

    expect(getGamesGlobal).toHaveBeenCalledWith({
      limit: 200,
      sort: 'popular',
      gameTypes: [...CORE_IGDB_GAME_TYPES],
    });
    expect(result.collection).toMatchObject({
      id: 'generated-all-time-games',
      name: 'All-Time Games',
      description: 'Popular games from IGDB.',
      candidateSource: {
        kind: 'generated',
        provider: 'igdb',
        originalRequest: 'all time',
        definition: {
          schemaVersion: 2,
          mediaType: 'game',
          mode: 'global',
          query: 'all time',
          igdbId: null,
          resolvedName: 'All-Time',
          limit: 200,
          sort: 'popular',
          gameTypes: [...CORE_IGDB_GAME_TYPES],
        },
      },
    });
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Half-Life 2',
      'Doom',
    ]);
  });
});
