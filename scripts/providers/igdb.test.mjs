import { describe, expect, it } from 'vitest';

import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
  createIgdbImageUrl,
  createIgdbProvider,
  createIgdbRankItem,
  getIgdbReleaseYear,
  isRankableIgdbGame,
} from './igdb.mjs';

function response({ status = 200, json = {}, text = '' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
    async json() {
      return json;
    },
    async text() {
      return text;
    },
  };
}

describe('IGDB provider', () => {
  it('normalizes an IGDB game into a canonical RankItem source', () => {
    const item = createIgdbRankItem({
      id: 1942,
      name: 'The Witcher 3: Wild Hunt',
      slug: 'the-witcher-3-wild-hunt',
      first_release_date: 1431993600,
      cover: {
        image_id: 'abc123',
      },
    });

    expect(item).toEqual({
      id: 'the-witcher-3-wild-hunt-1942',
      name: 'The Witcher 3: Wild Hunt',
      subtitle: '2015',
      image: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/abc123.jpg',
      source: {
        provider: 'igdb',
        id: '1942',
        type: 'game',
      },
    });
  });

  it('constructs IGDB image URLs and release years', () => {
    expect(createIgdbImageUrl('cover-id')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover-id.jpg',
    );
    expect(getIgdbReleaseYear({ first_release_date: 946684800 })).toBe('2000');
  });

  it('keeps core game releases and filters add-ons, bundles, mods, packs, and unreleased noise', () => {
    const game = (type, status = 'Released') => ({
      id: 1,
      name: 'Example',
      game_type: { type },
      game_status: { status },
      version_parent: null,
    });

    expect(isRankableIgdbGame(game('Main Game'))).toBe(true);
    expect(isRankableIgdbGame(game('Standalone Expansion'))).toBe(false);
    expect(isRankableIgdbGame(game('Remake'))).toBe(true);
    expect(isRankableIgdbGame(game('Remaster'))).toBe(true);
    expect(isRankableIgdbGame(game('Expanded Game'))).toBe(true);

    expect(isRankableIgdbGame(game('DLC / Addon'))).toBe(false);
    expect(isRankableIgdbGame(game('Expansion'))).toBe(false);
    expect(isRankableIgdbGame(game('Bundle'))).toBe(false);
    expect(isRankableIgdbGame(game('Mod'))).toBe(false);
    expect(isRankableIgdbGame(game('Season'))).toBe(false);
    expect(isRankableIgdbGame(game('Pack'))).toBe(false);
    expect(isRankableIgdbGame(game('Update'))).toBe(false);
    expect(isRankableIgdbGame(game('Port'))).toBe(false);

    expect(isRankableIgdbGame(game('Main Game', 'Cancelled'))).toBe(false);
    expect(isRankableIgdbGame(game('Main Game', 'Rumored'))).toBe(false);
    expect(isRankableIgdbGame(game('Main Game', 'Alpha'))).toBe(false);
    expect(isRankableIgdbGame(game('Main Game', 'Beta'))).toBe(false);
    expect(isRankableIgdbGame(game('Main Game', 'Early Access'))).toBe(true);
    expect(isRankableIgdbGame(game('Main Game', 'Delisted'))).toBe(true);

    const withDlcExpansions = {
      gameTypes: [...CORE_IGDB_GAME_TYPES, ...DLC_EXPANSION_IGDB_GAME_TYPES],
    };

    expect(isRankableIgdbGame(game('Standalone Expansion'), withDlcExpansions)).toBe(true);
    expect(isRankableIgdbGame(game('DLC / Addon'), withDlcExpansions)).toBe(true);
    expect(isRankableIgdbGame(game('Expansion'), withDlcExpansions)).toBe(true);
    expect(isRankableIgdbGame(game('Bundle'), withDlcExpansions)).toBe(false);
  });

  it('gets an app token and reuses it while valid', async () => {
    const calls = [];

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      now: () => 1_000,
      async fetchImpl(url, init) {
        calls.push({ url: String(url), init });

        if (String(url).includes('id.twitch.tv')) {
          return response({
            json: {
              access_token: 'token-1',
              expires_in: 3600,
            },
          });
        }

        return response({ json: [] });
      },
    });

    await provider.searchGames('Halo', 5);
    await provider.searchPlatforms('PlayStation', 5);

    const tokenCalls = calls.filter((call) => call.url.includes('id.twitch.tv'));
    const apiCalls = calls.filter((call) => call.url.includes('api.igdb.com'));

    expect(tokenCalls).toHaveLength(1);
    expect(apiCalls).toHaveLength(2);
    expect(apiCalls[0].init.headers.Authorization).toBe('Bearer token-1');
    expect(apiCalls[0].init.headers['Client-ID']).toBe('client-id');
  });

  it('refreshes the token once after a 401 and retries the IGDB request', async () => {
    let tokenNumber = 0;
    let igdbRequestNumber = 0;

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      async fetchImpl(url) {
        if (String(url).includes('id.twitch.tv')) {
          tokenNumber += 1;
          return response({
            json: {
              access_token: `token-${tokenNumber}`,
              expires_in: 3600,
            },
          });
        }

        igdbRequestNumber += 1;

        if (igdbRequestNumber === 1) {
          return response({ status: 401 });
        }

        return response({
          json: [
            {
              id: 1,
              name: 'Halo',
            },
          ],
        });
      },
    });

    const result = await provider.searchGames('Halo');

    expect(tokenNumber).toBe(2);
    expect(igdbRequestNumber).toBe(2);
    expect(result[0].name).toBe('Halo');
  });

  it('escapes user search text before putting it into an APICalypse query', async () => {
    let requestBody = '';

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

        requestBody = init.body;
        return response({ json: [] });
      },
    });

    await provider.searchGames('A "quoted" game');

    expect(requestBody).toContain('search "A \\"quoted\\" game";');
  });

  it('uses case-insensitive infix matching for non-searchable named endpoints', async () => {
    let requestBody = '';

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

        requestBody = init.body;
        return response({ json: [] });
      },
    });

    await provider.searchGenres('role playing');

    expect(requestBody).toContain('where name ~ *"role playing"*;');
  });

  it('builds direct relation queries for genre and platform candidate pools', async () => {
    const bodies = [];

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

        bodies.push(init.body);
        return response({ json: [] });
      },
    });

    await provider.getGamesByRelation({
      relation: 'genres',
      id: 12,
      limit: 25,
      sort: 'release-desc',
    });

    await provider.getGamesByRelation({
      relation: 'platforms',
      id: 48,
      limit: 10,
      sort: 'rating',
    });

    expect(bodies[0]).toContain('where version_parent = null & genres = 12;');
    expect(bodies[0]).toContain('game_type.type,game_status.status');
    expect(bodies[0]).toContain('sort first_release_date desc;');
    expect(bodies[1]).toContain('where version_parent = null & platforms = 48;');
    expect(bodies[1]).toContain('sort total_rating desc;');
  });

  it('filters non-game franchise noise before returning ranking candidates', async () => {
    let requestNumber = 0;

    const provider = createIgdbProvider({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      async fetchImpl(url) {
        if (String(url).includes('id.twitch.tv')) {
          return response({
            json: {
              access_token: 'token',
              expires_in: 3600,
            },
          });
        }

        requestNumber += 1;

        if (requestNumber === 1) {
          return response({
            json: [{ id: 1, name: 'Halo', games: [10, 11, 12, 13] }],
          });
        }

        return response({
          json: [
            {
              id: 10,
              name: 'Halo: Combat Evolved',
              game_type: { type: 'Main Game' },
              game_status: { status: 'Released' },
              total_rating_count: 100,
            },
            {
              id: 11,
              name: 'Halo Multiplayer Map Pack',
              game_type: { type: 'Pack' },
              game_status: { status: 'Released' },
              total_rating_count: 80,
            },
            {
              id: 12,
              name: 'Halo Collection Bundle',
              game_type: { type: 'Bundle' },
              game_status: { status: 'Released' },
              total_rating_count: 70,
            },
            {
              id: 13,
              name: 'Cancelled Halo Project',
              game_type: { type: 'Main Game' },
              game_status: { status: 'Cancelled' },
              total_rating_count: 60,
            },
          ],
        });
      },
    });

    const games = await provider.getGamesByFranchiseId({
      id: 1,
      limit: 50,
      sort: 'popular',
    });

    expect(games.map((game) => game.id)).toEqual([10]);
  });

  it('uses rating-count popularity for the default broad game sort', async () => {
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

    await provider.getGamesByRelation({
      relation: 'genres',
      id: 5,
      limit: 10,
    });

    expect(body).toContain('sort total_rating_count desc;');
  });

  it('loads canonical named entities by stable IGDB ID', async () => {
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
        return response({
          json: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
        });
      },
    });

    const genre = await provider.getGenreById(12);

    expect(genre.name).toBe('Role-playing (RPG)');
    expect(body).toContain('where id = 12;');
  });

  it('batches large franchise candidate pools using the franchise game ID list', async () => {
    const apiBodies = [];
    let apiRequestNumber = 0;
    const franchiseGameIds = Array.from(
      { length: 501 },
      (_, index) => 1_000 + index,
    );

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

        apiRequestNumber += 1;
        apiBodies.push(init.body);

        if (apiRequestNumber === 1) {
          return response({
            json: [
              {
                id: 99,
                name: 'Mario',
                slug: 'mario',
                games: franchiseGameIds,
              },
            ],
          });
        }

        if (apiRequestNumber === 2) {
          return response({
            json: Array.from({ length: 500 }, (_, index) => ({
              id: 1_000 + index,
              name: `Mario add-on ${index}`,
              game_type: { type: 'DLC / Addon' },
              game_status: { status: 'Released' },
              version_parent: null,
              total_rating_count: 10_000 - index,
            })),
          });
        }

        return response({
          json: [
            {
              id: 1_500,
              name: 'Super Mario Bros.',
              game_type: { type: 'Main Game' },
              game_status: { status: 'Released' },
              version_parent: null,
              total_rating_count: 9_000,
            },
          ],
        });
      },
    });

    const games = await provider.getGamesByFranchiseId({
      id: 99,
      limit: 1,
      sort: 'popular',
    });

    expect(games.map((game) => game.id)).toEqual([1_500]);
    expect(apiBodies).toHaveLength(3);
    expect(apiBodies[0]).toContain('fields id,name,slug,games;');
    expect(apiBodies[1]).toContain('where id = (');
    expect(apiBodies[1]).toContain('limit 500;');
    expect(apiBodies[2]).toContain('where id = (1500);');
    expect(apiBodies[2]).toContain('limit 1;');
    expect(apiBodies.some((body) => body.includes('where franchises = 99;'))).toBe(
      false,
    );
  });
});
