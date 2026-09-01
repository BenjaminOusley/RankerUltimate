import { describe, expect, it, vi } from 'vitest';

import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
} from '../providers/igdb.mjs';
import {
  buildGenerationRequestFromPlannedSource,
  executeCollectionPlan,
} from './collection-plan-executor.mjs';

const collectionId = 'generated-11111111-2222-4333-8444-555555555555';

function tmdbSource(overrides = {}) {
  return {
    provider: 'tmdb',
    mediaType: 'movie',
    mode: 'company',
    query: 'Pixar',
    resolvedId: 3,
    resolvedName: 'Pixar',
    parameters: {
      limit: 50,
      sort: 'popularity',
      fromYear: null,
      toYear: null,
      minRuntime: null,
      excludeDocumentaries: false,
      includeAdult: false,
      language: 'en-US',
    },
    ...overrides,
  };
}

function igdbSource(overrides = {}) {
  return {
    provider: 'igdb',
    mediaType: 'game',
    mode: 'franchise',
    query: 'Halo',
    resolvedId: 92,
    resolvedName: 'Halo',
    parameters: {
      limit: 50,
      sort: 'popular',
      gameTypes: [
        ...CORE_IGDB_GAME_TYPES,
        ...DLC_EXPANSION_IGDB_GAME_TYPES,
      ],
    },
    ...overrides,
  };
}

function generatedResult({ provider, mediaType, name, itemId, collectionSource }) {
  return {
    collection: {
      id: `${collectionId}-${mediaType}`,
      name,
      description: `${name} description`,
      candidateSource: collectionSource,
      items: [
        {
          id: `${name.toLocaleLowerCase().replace(/\s+/gu, '-')}-${itemId}`,
          name,
          source: {
            provider,
            type: mediaType === 'game' ? 'game' : mediaType,
            id: String(itemId),
          },
        },
      ],
    },
    candidateCount: 1,
    validatedCount: 1,
    missingPosterCount: 1,
  };
}

describe('collection plan executor', () => {
  it('maps a planned TMDB source into the existing generation request contract', () => {
    expect(buildGenerationRequestFromPlannedSource(tmdbSource(), collectionId)).toEqual({
      mediaType: 'movie',
      mode: 'company',
      query: 'Pixar',
      collectionId,
      limit: 50,
      tmdbId: 3,
      fromYear: null,
      toYear: null,
      sort: 'popularity',
      minRuntime: null,
      excludeDocumentaries: false,
      includeAdult: false,
      language: 'en-US',
    });
  });

  it('maps a planned IGDB source and preserves the DLC/expansion scope choice', () => {
    expect(buildGenerationRequestFromPlannedSource(igdbSource(), collectionId)).toMatchObject({
      mediaType: 'game',
      mode: 'franchise',
      query: 'Halo',
      collectionId,
      igdbId: 92,
      limit: 50,
      sort: 'popular',
      gameTypes: [
        ...CORE_IGDB_GAME_TYPES,
        ...DLC_EXPANSION_IGDB_GAME_TYPES,
      ],
    });
  });

  it('executes a single plan through the existing generator and preserves the conversational request', async () => {
    const source = tmdbSource();
    const generateTmdb = vi.fn(async ({ request }) =>
      generatedResult({
        provider: 'tmdb',
        mediaType: 'movie',
        name: 'Pixar Movies',
        itemId: 1,
        collectionSource: {
          kind: 'generated',
          provider: 'tmdb',
          originalRequest: request.query,
          definition: {
            collectionId: request.collectionId,
          },
        },
      }),
    );

    const result = await executeCollectionPlan({
      plannedRequest: {
        status: 'planned',
        requestText: 'Pixar movies',
        subject: 'Pixar',
        mediaTypes: ['movie'],
        plan: {
          kind: 'single',
          originalRequest: 'Pixar movies',
          sources: [source],
        },
      },
      collectionId,
      tmdb: {},
      generateTmdb,
    });

    expect(generateTmdb).toHaveBeenCalledOnce();
    expect(result.collection.name).toBe('Pixar Movies');
    expect(result.collection.candidateSource.originalRequest).toBe('Pixar movies');
  });

  it('executes composite sources sequentially and merges candidates by canonical identity', async () => {
    const callOrder = [];
    const movieSource = tmdbSource();
    const gameSource = igdbSource({ query: 'Pixar', resolvedName: 'Pixar' });

    const generateTmdb = vi.fn(async () => {
      callOrder.push('tmdb');

      return {
        ...generatedResult({
          provider: 'tmdb',
          mediaType: 'movie',
          name: 'Pixar Movies',
          itemId: 1,
          collectionSource: {
            kind: 'generated',
            provider: 'tmdb',
            definition: { child: 'movie' },
          },
        }),
        collection: {
          ...generatedResult({
            provider: 'tmdb',
            mediaType: 'movie',
            name: 'Pixar Movies',
            itemId: 1,
            collectionSource: {
              kind: 'generated',
              provider: 'tmdb',
              definition: { child: 'movie' },
            },
          }).collection,
          items: [
            {
              id: 'shared-local-shape',
              name: 'Shared title',
              source: { provider: 'tmdb', type: 'movie', id: '1' },
            },
          ],
        },
      };
    });

    const generateIgdb = vi.fn(async () => {
      callOrder.push('igdb');

      return {
        collection: {
          id: `${collectionId}-games`,
          name: 'Pixar Games',
          candidateSource: {
            kind: 'generated',
            provider: 'igdb',
            definition: { child: 'game' },
          },
          items: [
            {
              id: 'same-local-id-does-not-collide',
              name: 'Shared title',
              source: { provider: 'igdb', type: 'game', id: '1' },
            },
            {
              id: 'another-copy',
              name: 'Duplicate game identity',
              source: { provider: 'igdb', type: 'game', id: '1' },
            },
          ],
        },
        candidateCount: 2,
        validatedCount: 2,
        missingPosterCount: 2,
      };
    });

    const result = await executeCollectionPlan({
      plannedRequest: {
        status: 'planned',
        requestText: 'Pixar movies and games',
        subject: 'Pixar',
        mediaTypes: ['movie', 'game'],
        plan: {
          kind: 'composite',
          originalRequest: 'Pixar movies and games',
          sources: [movieSource, gameSource],
        },
      },
      collectionId,
      tmdb: {},
      igdb: {},
      generateTmdb,
      generateIgdb,
    });

    expect(callOrder).toEqual(['tmdb', 'igdb']);
    expect(result.collection.id).toBe(collectionId);
    expect(result.collection.name).toBe('Pixar Movies & Games');
    expect(result.collection.items).toHaveLength(2);
    expect(result.collection.candidateSource).toMatchObject({
      kind: 'composite',
      originalRequest: 'Pixar movies and games',
    });
    expect(result.collection.candidateSource.sources).toHaveLength(2);
  });

  it('rejects an invalid single plan before executing providers', async () => {
    await expect(
      executeCollectionPlan({
        plannedRequest: {
          status: 'planned',
          requestText: 'Pixar things',
          subject: 'Pixar',
          mediaTypes: ['movie', 'tv'],
          plan: {
            kind: 'single',
            originalRequest: 'Pixar things',
            sources: [tmdbSource(), tmdbSource({ mediaType: 'tv' })],
          },
        },
        collectionId,
        tmdb: {},
      }),
    ).rejects.toThrow('exactly one source');
  });
});
