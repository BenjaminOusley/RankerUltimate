import { describe, expect, it } from 'vitest';

import { generateIgdbCollection } from '../generation/igdb-generator.mjs';
import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
  EXPANSION_IGDB_GAME_TYPES,
  SEASON_IGDB_GAME_TYPES,
  createIgdbProvider,
  isRankableIgdbGame,
} from '../providers/igdb.mjs';
import { buildGenerationRequestFromPlannedSource } from './collection-plan-executor.mjs';
import { planCollectionRequest } from './collection-request-planner.mjs';
import {
  detectCollectionRequestMediaTypes,
  resolveCollectionRequestTurn,
} from './collection-request-resolver.mjs';

const collectionId = 'generated-game-content-scope-test';

function createFakeIgdb() {
  const games = new Map([
    ['world of warcraft', { id: 10, name: 'World of Warcraft' }],
    ['destiny', { id: 20, name: 'Destiny' }],
    ['destiny 2', { id: 21, name: 'Destiny 2' }],
  ]);

  return {
    async searchGames(query) {
      const match = games.get(String(query).toLocaleLowerCase());
      return match ? [match] : [];
    },
    async searchGenres(query) {
      return String(query).toLocaleLowerCase() === 'shooter'
        ? [{ id: 5, name: 'Shooter' }]
        : [];
    },
    async searchFranchises(query) {
      if (/halo/iu.test(query)) {
        return [{ id: 30, name: 'Halo' }];
      }

      return [];
    },
    async searchPlatforms() {
      return [];
    },
    async searchCompanies() {
      return [];
    },
  };
}

async function resolveAndPlan(text) {
  const resolution = resolveCollectionRequestTurn({ text });

  expect(resolution.ok).toBe(true);
  expect(resolution.result.status).toBe('ready-for-planning');

  return planCollectionRequest({
    request: resolution.result,
    igdb: createFakeIgdb(),
  });
}

function response({ status = 200, json = {}, text = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async json() {
      return json;
    },
    async text() {
      return text;
    },
  };
}

describe('conversational game content scopes', () => {
  it('infers game media from game-specific content nouns without overriding explicit media', () => {
    expect(detectCollectionRequestMediaTypes('World of Warcraft expansions')).toEqual(['game']);
    expect(detectCollectionRequestMediaTypes('Destiny DLC')).toEqual(['game']);
    expect(detectCollectionRequestMediaTypes('Destiny 2 seasons')).toEqual(['game']);
    expect(detectCollectionRequestMediaTypes('TV seasons')).toEqual(['tv']);
  });

  it('resolves bare expansions, DLC, and seasons as exclusive parent-game scopes', async () => {
    const expansions = await resolveAndPlan('World of Warcraft expansions');
    const dlc = await resolveAndPlan('Destiny DLC');
    const seasons = await resolveAndPlan('Destiny 2 seasons');

    expect(expansions).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'igdb',
            mediaType: 'game',
            mode: 'parent-game',
            query: 'World of Warcraft',
            resolvedId: 10,
            parameters: {
              gameTypes: [...EXPANSION_IGDB_GAME_TYPES],
            },
          },
        ],
      },
    });

    expect(dlc.plan.sources[0]).toMatchObject({
      mode: 'parent-game',
      query: 'Destiny',
      resolvedId: 20,
      parameters: {
        gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
      },
    });

    expect(seasons.plan.sources[0]).toMatchObject({
      mode: 'parent-game',
      query: 'Destiny 2',
      resolvedId: 21,
      parameters: {
        gameTypes: [...SEASON_IGDB_GAME_TYPES],
      },
    });
  });

  it('uses actual child content to disambiguate duplicate exact parent-game titles', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Destiny DLC' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb: {
        async searchGames(query) {
          expect(query).toBe('Destiny');

          return [
            {
              id: 1,
              name: 'Destiny',
              first_release_date: 315532800,
              game_type: { type: 'Main Game' },
              dlcs: [1001],
            },
            {
              id: 20,
              name: 'Destiny',
              first_release_date: 1410220800,
              game_type: { type: 'Main Game' },
              expansions: [2001, 2002],
            },
            {
              id: 300,
              name: 'Destiny',
              first_release_date: 1577836800,
              game_type: { type: 'Main Game' },
              dlcs: [3001],
            },
          ];
        },
        async getGamesByParentGameId({ id, gameTypes }) {
          expect(gameTypes).toEqual([...DLC_EXPANSION_IGDB_GAME_TYPES]);

          return id === 20 ? [{ id: 2001, name: 'The Dark Below' }] : [];
        },
      },
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            mode: 'parent-game',
            query: 'Destiny',
            resolvedId: 20,
            resolvedName: 'Destiny',
            resolvedYear: '2014',
            parameters: {
              gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
            },
          },
        ],
      },
    });
  });

  it('prefers a canonical main game when multiple exact titles expose the requested content', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Destiny DLC' });

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb: {
        async searchGames() {
          return [
            {
              id: 20,
              name: 'Destiny',
              first_release_date: 1410220800,
              game_type: { type: 'Main Game' },
              dlcs: [2001],
            },
            {
              id: 21,
              name: 'Destiny',
              first_release_date: 1442275200,
              game_type: { type: 'Expanded Game' },
              dlcs: [2101],
            },
          ];
        },
        async getGamesByParentGameId({ id }) {
          return [{ id: id * 100, name: 'Child content' }];
        },
      },
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            mode: 'parent-game',
            resolvedId: 20,
            resolvedYear: '2014',
          },
        ],
      },
    });
  });

  it('uses readable year-based clarification examples instead of exposing parent-game internals', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Destiny DLC' });

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb: {
        async searchGames() {
          return [
            {
              id: 10,
              name: 'Destiny',
              first_release_date: 946684800,
              game_type: { type: 'Main Game' },
              dlcs: [1001],
            },
            {
              id: 20,
              name: 'Destiny',
              first_release_date: 1410220800,
              game_type: { type: 'Main Game' },
              dlcs: [2001],
            },
          ];
        },
        async getGamesByParentGameId() {
          return [{ id: 999, name: 'Matching DLC' }];
        },
      },
    });

    expect(planned).toMatchObject({
      status: 'clarification',
      reason: 'ambiguous-entity',
      examples: ['Destiny (2000) DLC', 'Destiny (2014) DLC'],
    });
    expect(planned.examples.join(' ')).not.toContain('parent-game');
  });

  it('accepts a year-qualified parent-game clarification response', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Destiny (2014) DLC' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb: {
        async searchGames(query) {
          expect(query).toBe('Destiny');

          return [
            {
              id: 10,
              name: 'Destiny',
              first_release_date: 946684800,
              game_type: { type: 'Main Game' },
            },
            {
              id: 20,
              name: 'Destiny',
              first_release_date: 1410220800,
              game_type: { type: 'Main Game' },
            },
          ];
        },
      },
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            mode: 'parent-game',
            query: 'Destiny',
            resolvedId: 20,
            resolvedYear: '2014',
            parameters: {
              gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
            },
          },
        ],
      },
    });
  });

  it('requests parent-content relationship fields when searching exact games', async () => {
    let body = '';

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      async fetchImpl(url, init) {
        if (String(url).includes('id.twitch.tv')) {
          return response({
            json: {
              access_token: 'token',
              expires_in: 3600,
            },
          });
        }

        body = init.body;
        return response({ json: [] });
      },
    });

    await provider.searchGames('Destiny', 20);

    expect(body).toContain('dlcs,expansions,standalone_expansions');
  });

  it('keeps broad game requests core-only and makes include modifiers additive', async () => {
    const broad = await resolveAndPlan('Halo games');
    const inclusive = await resolveAndPlan('Halo games including DLC and expansions');
    const excluding = await resolveAndPlan('Halo games without DLC and expansions');

    expect(broad.plan.sources[0]).toMatchObject({
      mode: 'franchise',
      query: 'Halo',
      parameters: {
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });

    expect(inclusive.plan.sources[0]).toMatchObject({
      mode: 'franchise',
      query: 'Halo',
      parameters: {
        gameTypes: [
          ...CORE_IGDB_GAME_TYPES,
          ...DLC_EXPANSION_IGDB_GAME_TYPES,
        ],
      },
    });

    expect(excluding.plan.sources[0]).toMatchObject({
      mode: 'franchise',
      query: 'Halo',
      parameters: {
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });
  });

  it('preserves the existing bare numeric collection-limit behavior', async () => {
    const result = await resolveAndPlan('300 Halo games');

    expect(result).toMatchObject({
      status: 'clarification',
      reason: 'unsupported-limit',
    });
  });

  it('passes explicit gameTypes through the executor contract', async () => {
    const planned = await resolveAndPlan('Destiny DLC');
    const generationRequest = buildGenerationRequestFromPlannedSource(
      planned.plan.sources[0],
      collectionId,
    );

    expect(generationRequest).toMatchObject({
      mediaType: 'game',
      mode: 'parent-game',
      query: 'Destiny',
      gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
    });
  });

  it('generates and persists a parent-game DLC collection with scope-aware naming', async () => {
    const result = await generateIgdbCollection({
      request: {
        mode: 'parent-game',
        query: 'Destiny',
        collectionId,
        igdbId: 20,
        limit: 50,
        sort: 'popular',
        gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
      },
      igdb: {
        async getGameById() {
          return { id: 20, name: 'Destiny' };
        },
        async getGamesByParentGameId({ id, gameTypes }) {
          expect(id).toBe(20);
          expect(gameTypes).toEqual([...DLC_EXPANSION_IGDB_GAME_TYPES]);

          return [
            {
              id: 2001,
              name: 'Destiny: The Dark Below',
              slug: 'destiny-the-dark-below',
              first_release_date: 1418083200,
              game_type: { type: 'Expansion' },
              version_parent: null,
            },
          ];
        },
      },
      logger: { log() {} },
    });

    expect(result.collection).toMatchObject({
      name: 'Destiny DLC',
      description: 'DLC for Destiny.',
      candidateSource: {
        kind: 'generated',
        provider: 'igdb',
        definition: {
          schemaVersion: 2,
          mode: 'parent-game',
          igdbId: 20,
          gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
        },
      },
    });
  });

  it('accepts seasons only when the selected IGDB scope includes seasons', () => {
    const season = {
      id: 1,
      name: 'Example Season',
      game_type: { type: 'Season' },
      game_status: { status: 'Released' },
      version_parent: null,
    };

    expect(isRankableIgdbGame(season)).toBe(false);
    expect(
      isRankableIgdbGame(season, {
        gameTypes: [...SEASON_IGDB_GAME_TYPES],
      }),
    ).toBe(true);
  });

  it('loads DLC from the parent games authoritative DLC list', async () => {
    const bodies = [];
    let requestNumber = 0;

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      async fetchImpl(url, init) {
        if (String(url).includes('id.twitch.tv')) {
          return response({
            json: {
              access_token: 'token',
              expires_in: 3600,
            },
          });
        }

        requestNumber += 1;
        bodies.push(init.body);

        if (requestNumber === 1) {
          return response({
            json: [
              {
                id: 20,
                name: 'Destiny',
                dlcs: [2001],
                expansions: [],
                standalone_expansions: [],
              },
            ],
          });
        }

        return response({
          json: [
            {
              id: 2001,
              name: 'Destiny: The Dark Below',
              game_type: { type: 'Expansion' },
              game_status: { status: 'Released' },
              version_parent: null,
            },
          ],
        });
      },
    });

    const games = await provider.getGamesByParentGameId({
      id: 20,
      limit: 10,
      sort: 'popular',
      gameTypes: [...DLC_EXPANSION_IGDB_GAME_TYPES],
    });

    expect(bodies[0]).toContain('where id = 20;');
    expect(bodies[0]).toContain('dlcs,expansions,standalone_expansions');
    expect(bodies[1]).toContain('where id = (2001);');
    expect(bodies.some((body) => body.includes('parent_game = 20'))).toBe(false);
    expect(games.map((game) => game.id)).toEqual([2001]);
  });

  it('uses parent_game reverse lookup for content without a parent-side list such as seasons', async () => {
    const bodies = [];
    let requestNumber = 0;

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      async fetchImpl(url, init) {
        if (String(url).includes('id.twitch.tv')) {
          return response({
            json: {
              access_token: 'token',
              expires_in: 3600,
            },
          });
        }

        requestNumber += 1;
        bodies.push(init.body);

        if (requestNumber === 1) {
          return response({
            json: [{ id: 21, name: 'Destiny 2' }],
          });
        }

        return response({
          json: [
            {
              id: 77,
              name: 'Destiny 2: Example Season',
              game_type: { type: 'Season' },
              game_status: { status: 'Released' },
              version_parent: null,
            },
          ],
        });
      },
    });

    const games = await provider.getGamesByParentGameId({
      id: 21,
      limit: 10,
      sort: 'popular',
      gameTypes: [...SEASON_IGDB_GAME_TYPES],
    });

    expect(bodies[0]).toContain('where id = 21;');
    expect(bodies[1]).toContain('where version_parent = null & parent_game = 21;');
    expect(games.map((game) => game.id)).toEqual([77]);
  });

});
