import { describe, expect, it, vi } from 'vitest';

import {
  generateIgdbCollection,
  validateIgdbGenerationRequest,
} from './igdb-generator.mjs';

const halo = {
  id: 1,
  name: 'Halo',
  slug: 'halo',
  first_release_date: 1009843200,
  cover: {
    image_id: 'halo-cover',
  },
};

describe('IGDB collection generation', () => {
  it('validates a normalized source-backed generation request', () => {
    expect(
      validateIgdbGenerationRequest({
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'generated-test',
        igdbId: 5,
        limit: 50,
        sort: 'rating',
      }),
    ).toEqual({
      ok: true,
      request: {
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'generated-test',
        igdbId: 5,
        limit: 50,
        sort: 'rating',
      },
    });
  });

  it('creates a refreshable IGDB genre collection with canonical RankItems', async () => {
    const igdb = {
      getGenreById: vi.fn().mockResolvedValue({
        id: 5,
        name: 'Shooter',
        slug: 'shooter',
      }),
      getGamesByRelation: vi.fn().mockResolvedValue([halo]),
    };

    const result = await generateIgdbCollection({
      request: {
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'generated-test',
        igdbId: 5,
        limit: 50,
        sort: 'rating',
      },
      igdb,
      logger: {
        log() {},
      },
    });

    expect(igdb.getGamesByRelation).toHaveBeenCalledWith({
      relation: 'genres',
      id: 5,
      limit: 50,
      sort: 'rating',
    });
    expect(result.collection).toMatchObject({
      id: 'generated-test-games',
      name: 'Shooter Games',
      candidateSource: {
        kind: 'generated',
        provider: 'igdb',
        originalRequest: 'Shooter',
        definition: {
          schemaVersion: 1,
          collectionId: 'generated-test',
          mediaType: 'game',
          mode: 'genre',
          query: 'Shooter',
          igdbId: 5,
          resolvedName: 'Shooter',
          limit: 50,
          sort: 'rating',
        },
      },
    });
    expect(result.collection.items[0]).toMatchObject({
      name: 'Halo',
      source: {
        provider: 'igdb',
        type: 'game',
        id: '1',
      },
    });
  });

  it('routes franchise generation through the franchise-specific provider path', async () => {
    const igdb = {
      getFranchiseById: vi.fn().mockResolvedValue({
        id: 24,
        name: 'Halo',
        games: [1],
      }),
      getGamesByFranchiseId: vi.fn().mockResolvedValue([halo]),
    };

    const result = await generateIgdbCollection({
      request: {
        mode: 'franchise',
        query: 'Halo',
        collectionId: 'generated-halo',
        igdbId: 24,
        limit: 25,
        sort: 'release-asc',
      },
      igdb,
      logger: {
        log() {},
      },
    });

    expect(igdb.getGamesByFranchiseId).toHaveBeenCalledWith(
      24,
      25,
      'release-asc',
    );
    expect(result.collection.name).toBe('Halo Games');
  });
});
