import { describe, expect, it, vi } from 'vitest';

import { CORE_IGDB_GAME_TYPES } from '../providers/igdb.mjs';
import { planCollectionRequest } from './collection-request-planner.mjs';
import { resolveCollectionRequestTurn } from './collection-request-resolver.mjs';

function createNoLookupIgdb() {
  return {
    searchGenres: vi.fn(async () => {
      throw new Error('global game requests must not search genres');
    }),
    searchFranchises: vi.fn(async () => {
      throw new Error('global game requests must not search franchises');
    }),
    searchPlatforms: vi.fn(async () => {
      throw new Error('global game requests must not search platforms');
    }),
    searchCompanies: vi.fn(async () => {
      throw new Error('global game requests must not search companies');
    }),
  };
}

describe('game natural-language regressions', () => {
  it('plans top all-time games as a global IGDB collection without entity lookup', async () => {
    const resolution = resolveCollectionRequestTurn({
      text: 'top 200 games all time',
    });

    expect(resolution).toMatchObject({
      ok: true,
      result: {
        status: 'ready-for-planning',
        subject: 'top 200 all time',
        mediaTypes: ['game'],
      },
    });

    const igdb = createNoLookupIgdb();
    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb,
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'igdb',
            mediaType: 'game',
            mode: 'global',
            query: 'all time',
            resolvedId: null,
            resolvedName: 'All-Time',
            parameters: {
              limit: 200,
              sort: 'popular',
              gameTypes: [...CORE_IGDB_GAME_TYPES],
            },
          },
        ],
      },
    });

    expect(igdb.searchGenres).not.toHaveBeenCalled();
    expect(igdb.searchFranchises).not.toHaveBeenCalled();
    expect(igdb.searchPlatforms).not.toHaveBeenCalled();
    expect(igdb.searchCompanies).not.toHaveBeenCalled();
  });

  it('maps platformer wording to IGDB Platform genre', async () => {
    const searchGenres = vi.fn(async (query) =>
      String(query).toLowerCase() === 'platform'
        ? [{ id: 8, name: 'Platform' }]
        : [],
    );
    const igdb = {
      searchGenres,
      async searchFranchises() {
        return [];
      },
      async searchPlatforms() {
        return [];
      },
      async searchCompanies() {
        return [];
      },
    };
    const resolution = resolveCollectionRequestTurn({
      text: 'top 200 platformer games',
    });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb,
    });

    expect(searchGenres).toHaveBeenCalledWith('platform', 10);
    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'igdb',
            mediaType: 'game',
            mode: 'genre',
            query: 'platformer',
            resolvedId: 8,
            resolvedName: 'Platform',
            parameters: {
              limit: 200,
              sort: 'popular',
              gameTypes: [...CORE_IGDB_GAME_TYPES],
            },
          },
        ],
      },
    });
  });
});

it('keeps an all-time modifier scoped to an explicit platformer genre', async () => {
  const searchGenres = vi.fn(async (query) =>
    String(query).toLowerCase() === 'platform'
      ? [{ id: 8, name: 'Platform' }]
      : [],
  );
  const igdb = {
    searchGenres,
    async searchFranchises() {
      return [];
    },
    async searchPlatforms() {
      return [];
    },
    async searchCompanies() {
      return [];
    },
  };

  const resolution = resolveCollectionRequestTurn({
    text: 'top 200 platformer games all time',
  });

  expect(resolution.ok).toBe(true);
  expect(resolution.result.status).toBe('ready-for-planning');

  const planned = await planCollectionRequest({
    request: resolution.result,
    igdb,
  });

  expect(searchGenres).toHaveBeenCalledWith('platform', 10);
  expect(planned).toMatchObject({
    status: 'planned',
    plan: {
      sources: [
        {
          provider: 'igdb',
          mediaType: 'game',
          mode: 'genre',
          query: 'platformer',
          resolvedId: 8,
          resolvedName: 'Platform',
          parameters: {
            limit: 200,
            sort: 'popular',
            gameTypes: [...CORE_IGDB_GAME_TYPES],
          },
        },
      ],
    },
  });
});

it('treats "platform games" as the Platform genre while keeping all-time as a ranking modifier', async () => {
  const searchGenres = vi.fn(async (query) =>
    String(query).toLowerCase() === 'platform'
      ? [{ id: 8, name: 'Platform' }]
      : [],
  );
  const igdb = {
    searchGenres,
    async searchFranchises() {
      return [];
    },
    async searchPlatforms() {
      return [];
    },
    async searchCompanies() {
      return [];
    },
  };

  const resolution = resolveCollectionRequestTurn({
    text: 'top 200 platform games all time',
  });

  expect(resolution.ok).toBe(true);
  expect(resolution.result.status).toBe('ready-for-planning');

  const planned = await planCollectionRequest({
    request: resolution.result,
    igdb,
  });

  expect(searchGenres).toHaveBeenCalledWith('platform', 10);
  expect(planned).toMatchObject({
    status: 'planned',
    plan: {
      sources: [
        {
          provider: 'igdb',
          mediaType: 'game',
          mode: 'genre',
          query: 'platform',
          resolvedId: 8,
          resolvedName: 'Platform',
          parameters: {
            limit: 200,
            sort: 'popular',
            gameTypes: [...CORE_IGDB_GAME_TYPES],
          },
        },
      ],
    },
  });
});

