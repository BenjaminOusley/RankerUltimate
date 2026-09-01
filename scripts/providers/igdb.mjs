const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_API_BASE = 'https://api.igdb.com/v4';
const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload';
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const MAX_QUERY_LIMIT = 500;
const MAX_COMPANY_INVOLVEMENTS = 5_000;
const MAX_RELATION_GAME_ROWS = 5_000;

const GAME_FIELDS =
  'id,name,slug,first_release_date,cover.image_id,total_rating,total_rating_count,game_type.type,game_status.status,version_parent';
const GAME_SEARCH_FIELDS =
  `${GAME_FIELDS},dlcs,expansions,standalone_expansions`;

const GAME_SORTS = {
  popular: 'total_rating_count desc',
  rating: 'total_rating desc',
  'release-asc': 'first_release_date asc',
  'release-desc': 'first_release_date desc',
  name: 'name asc',
};

export const CORE_IGDB_GAME_TYPES = Object.freeze([
  'main-game',
  'remake',
  'remaster',
  'expanded-game',
]);

export const EXPANSION_IGDB_GAME_TYPES = Object.freeze([
  'standalone-expansion',
  'expansion',
]);

export const DLC_IGDB_GAME_TYPES = Object.freeze(['dlc-addon']);

export const DLC_EXPANSION_IGDB_GAME_TYPES = Object.freeze([
  'standalone-expansion',
  'dlc-addon',
  'expansion',
]);

export const SEASON_IGDB_GAME_TYPES = Object.freeze(['season']);

const KNOWN_IGDB_GAME_TYPES = new Set([
  ...CORE_IGDB_GAME_TYPES,
  ...DLC_EXPANSION_IGDB_GAME_TYPES,
  ...SEASON_IGDB_GAME_TYPES,
]);

const EXCLUDED_GAME_STATUSES = new Set([
  'alpha',
  'beta',
  'cancelled',
  'rumored',
]);

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function normalizeLimit(limit, fallback = 10) {
  const value = limit ?? fallback;

  if (!Number.isInteger(value) || value < 1 || value > MAX_QUERY_LIMIT) {
    throw new Error(`IGDB limit must be between 1 and ${MAX_QUERY_LIMIT}.`);
  }

  return value;
}

function normalizePositiveId(id, name = 'IGDB ID') {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return id;
}

function normalizeGameSort(sort = 'popular') {
  if (!Object.hasOwn(GAME_SORTS, sort)) {
    throw new Error(`Unsupported IGDB game sort: ${sort}`);
  }

  return sort;
}

function escapeApicalypseString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function quoted(value) {
  return `"${escapeApicalypseString(value)}"`;
}

function normalizeIds(ids) {
  const uniqueIds = [...new Set(ids)];

  if (
    uniqueIds.length === 0 ||
    uniqueIds.some((id) => !Number.isSafeInteger(id) || id < 1)
  ) {
    throw new Error('IGDB IDs must be positive integers.');
  }

  if (uniqueIds.length > MAX_QUERY_LIMIT) {
    throw new Error(`IGDB ID lookup supports at most ${MAX_QUERY_LIMIT} IDs per request.`);
  }

  return uniqueIds;
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeReferenceLabel(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeIgdbGameType(value) {
  const label = normalizeReferenceLabel(value)
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ');

  if (label === 'main game') return 'main-game';
  if (label === 'standalone expansion') return 'standalone-expansion';
  if (label === 'dlc addon' || label === 'dlc') return 'dlc-addon';
  if (label === 'expansion') return 'expansion';
  if (label === 'remake') return 'remake';
  if (label === 'remaster') return 'remaster';
  if (label === 'expanded game') return 'expanded-game';
  if (label === 'season') return 'season';

  return label;
}

export function normalizeIgdbGameTypes(gameTypes = CORE_IGDB_GAME_TYPES) {
  if (!Array.isArray(gameTypes) || gameTypes.length === 0) {
    throw new Error('IGDB game types must be a non-empty array.');
  }

  const normalized = [...new Set(gameTypes.map(normalizeIgdbGameType))];

  if (normalized.some((gameType) => !KNOWN_IGDB_GAME_TYPES.has(gameType))) {
    throw new Error('Unsupported IGDB game type selection.');
  }

  return normalized;
}

export function isRankableIgdbGame(
  game,
  { gameTypes = CORE_IGDB_GAME_TYPES } = {},
) {
  if (!game || game.version_parent != null) {
    return false;
  }

  const allowedGameTypes = new Set(normalizeIgdbGameTypes(gameTypes));
  const gameType = normalizeIgdbGameType(game.game_type?.type);

  if (gameType && !allowedGameTypes.has(gameType)) {
    return false;
  }

  const gameStatus = normalizeReferenceLabel(game.game_status?.status);

  if (gameStatus && EXCLUDED_GAME_STATUSES.has(gameStatus)) {
    return false;
  }

  return true;
}

function sortGames(games, sort) {
  const normalizedSort = normalizeGameSort(sort);
  const copy = [...games];

  if (normalizedSort === 'popular') {
    return copy.sort((a, b) => {
      const countDifference = (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0);

      if (countDifference !== 0) {
        return countDifference;
      }

      return (b.total_rating ?? -1) - (a.total_rating ?? -1);
    });
  }

  if (normalizedSort === 'release-asc') {
    return copy.sort(
      (a, b) =>
        (a.first_release_date ?? Number.MAX_SAFE_INTEGER) -
        (b.first_release_date ?? Number.MAX_SAFE_INTEGER),
    );
  }

  if (normalizedSort === 'release-desc') {
    return copy.sort(
      (a, b) => (b.first_release_date ?? 0) - (a.first_release_date ?? 0),
    );
  }

  if (normalizedSort === 'name') {
    return copy.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? '')),
    );
  }

  return copy.sort((a, b) => {
    const ratingDifference = (b.total_rating ?? -1) - (a.total_rating ?? -1);

    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    return (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0);
  });
}

export function getIgdbReleaseYear(game) {
  if (!Number.isFinite(game?.first_release_date)) {
    return undefined;
  }

  const date = new Date(game.first_release_date * 1000);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return String(date.getUTCFullYear());
}

export function createIgdbImageUrl(imageId, size = 'cover_big_2x') {
  if (typeof imageId !== 'string' || imageId.length === 0) {
    return undefined;
  }

  return `${IGDB_IMAGE_BASE}/t_${size}/${imageId}.jpg`;
}

export function createIgdbRankItem(game) {
  if (!game || !Number.isSafeInteger(game.id) || game.id < 1) {
    throw new Error('IGDB game is missing a valid ID.');
  }

  const name = requireNonEmptyString(game.name, 'IGDB game name');
  const slug =
    typeof game.slug === 'string' && game.slug.length > 0 ? game.slug : slugify(name);
  const releaseYear = getIgdbReleaseYear(game);
  const coverImageId = game.cover?.image_id;

  return {
    id: `${slug}-${game.id}`,
    name,
    ...(releaseYear ? { subtitle: releaseYear } : {}),
    ...(coverImageId ? { image: createIgdbImageUrl(coverImageId) } : {}),
    source: {
      provider: 'igdb',
      id: String(game.id),
      type: 'game',
    },
  };
}

export function createIgdbProvider({
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
} = {}) {
  const normalizedClientId = requireNonEmptyString(clientId, 'IGDB client ID');
  const normalizedClientSecret = requireNonEmptyString(
    clientSecret,
    'IGDB client secret',
  );

  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for IGDB.');
  }

  let tokenCache = null;

  function clearAccessToken() {
    tokenCache = null;
  }

  async function getAccessToken({ forceRefresh = false } = {}) {
    if (
      !forceRefresh &&
      tokenCache &&
      tokenCache.expiresAt - TOKEN_EXPIRY_SKEW_MS > now()
    ) {
      return tokenCache.accessToken;
    }

    const body = new URLSearchParams({
      client_id: normalizedClientId,
      client_secret: normalizedClientSecret,
      grant_type: 'client_credentials',
    });

    const response = await fetchImpl(TWITCH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const suffix = detail ? `: ${detail.slice(0, 300)}` : '';

      throw new Error(
        `Twitch OAuth returned ${response.status} ${response.statusText}${suffix}`,
      );
    }

    const data = await response.json();
    const accessToken = data?.access_token;
    const expiresIn = Number(data?.expires_in);

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('Twitch OAuth response did not include an access token.');
    }

    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error('Twitch OAuth response did not include a valid token lifetime.');
    }

    tokenCache = {
      accessToken,
      expiresAt: now() + expiresIn * 1000,
    };

    return accessToken;
  }

  async function request(endpoint, body, { retryUnauthorized = true } = {}) {
    if (typeof endpoint !== 'string' || !/^[a-z0-9_/-]+$/.test(endpoint)) {
      throw new Error(`Invalid IGDB endpoint: ${endpoint}`);
    }

    const query = requireNonEmptyString(body, 'IGDB query');
    const accessToken = await getAccessToken();

    const response = await fetchImpl(
      `${IGDB_API_BASE}/${endpoint.replace(/^\/+/, '')}`,
      {
        method: 'POST',
        headers: {
          'Client-ID': normalizedClientId,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'text/plain',
        },
        body: query,
      },
    );

    if (response.status === 401 && retryUnauthorized) {
      clearAccessToken();
      await getAccessToken({ forceRefresh: true });
      return request(endpoint, body, { retryUnauthorized: false });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const suffix = detail ? `: ${detail.slice(0, 300)}` : '';

      throw new Error(
        `IGDB returned ${response.status} ${response.statusText} for ${endpoint}${suffix}`,
      );
    }

    return response.json();
  }

  async function searchGames(search, limit = 10) {
    const normalizedSearch = requireNonEmptyString(search, 'IGDB game search');
    const normalizedLimit = normalizeLimit(limit);
    const fetchLimit = Math.min(
      MAX_QUERY_LIMIT,
      Math.max(normalizedLimit, normalizedLimit * 4),
    );
    const games = await request(
      'games',
      [
        `search ${quoted(normalizedSearch)};`,
        `fields ${GAME_SEARCH_FIELDS};`,
        'where version_parent = null;',
        `limit ${fetchLimit};`,
      ].join('\n'),
    );

    return games.filter(isRankableIgdbGame).slice(0, normalizedLimit);
  }

  async function searchPlatforms(search, limit = 20) {
    const normalizedSearch = requireNonEmptyString(search, 'IGDB platform search');
    const normalizedLimit = normalizeLimit(limit, 20);

    return request(
      'platforms',
      [
        `search ${quoted(normalizedSearch)};`,
        'fields id,name,abbreviation,slug;',
        `limit ${normalizedLimit};`,
      ].join('\n'),
    );
  }

  async function searchNamedEndpoint(endpoint, search, fields, limit = 20) {
    const normalizedSearch = requireNonEmptyString(
      search,
      `IGDB ${endpoint} search`,
    );
    const normalizedLimit = normalizeLimit(limit, 20);

    return request(
      endpoint,
      [
        `fields ${fields};`,
        `where name ~ *${quoted(normalizedSearch)}*;`,
        'sort name asc;',
        `limit ${normalizedLimit};`,
      ].join('\n'),
    );
  }

  async function searchGenres(search, limit = 20) {
    return searchNamedEndpoint('genres', search, 'id,name,slug', limit);
  }

  async function searchFranchises(search, limit = 20) {
    return searchNamedEndpoint('franchises', search, 'id,name,slug', limit);
  }

  async function searchCompanies(search, limit = 20) {
    return searchNamedEndpoint(
      'companies',
      search,
      'id,name,slug,logo.image_id',
      limit,
    );
  }

  async function getNamedEntityById(endpoint, id, fields) {
    const normalizedId = normalizePositiveId(id);
    const results = await request(
      endpoint,
      [`fields ${fields};`, `where id = ${normalizedId};`, 'limit 1;'].join('\n'),
    );

    return results[0] ?? null;
  }

  async function getGenreById(id) {
    return getNamedEntityById('genres', id, 'id,name,slug');
  }

  async function getFranchiseById(id) {
    return getNamedEntityById('franchises', id, 'id,name,slug,games');
  }

  async function getPlatformById(id) {
    return getNamedEntityById('platforms', id, 'id,name,abbreviation,slug');
  }

  async function getCompanyById(id) {
    return getNamedEntityById('companies', id, 'id,name,slug,logo.image_id');
  }

  async function getGamesByIds(ids) {
    const normalizedIds = normalizeIds(ids);

    return request(
      'games',
      [
        `fields ${GAME_FIELDS};`,
        `where id = (${normalizedIds.join(',')});`,
        `limit ${normalizedIds.length};`,
      ].join('\n'),
    );
  }

  async function getGameById(id) {
    const games = await getGamesByIds([id]);
    return games[0] ?? null;
  }

  async function getGamesByRelation({
    relation,
    id,
    limit = 100,
    sort = 'popular',
    gameTypes = CORE_IGDB_GAME_TYPES,
  }) {
    if (
      relation !== 'genres' &&
      relation !== 'platforms' &&
      relation !== 'franchises'
    ) {
      throw new Error(`Unsupported direct IGDB game relation: ${relation}`);
    }

    const normalizedId = normalizePositiveId(id);
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedSort = normalizeGameSort(sort);
    const normalizedGameTypes = normalizeIgdbGameTypes(gameTypes);
    const pageSize = Math.min(
      MAX_QUERY_LIMIT,
      Math.max(100, normalizedLimit * 4),
    );
    const uniqueGames = new Map();

    for (
      let offset = 0;
      offset < MAX_RELATION_GAME_ROWS;
      offset += pageSize
    ) {
      const games = await request(
        'games',
        [
          `fields ${GAME_FIELDS};`,
          `where version_parent = null & ${relation} = ${normalizedId};`,
          `sort ${GAME_SORTS[normalizedSort]};`,
          `limit ${pageSize};`,
          ...(offset > 0 ? [`offset ${offset};`] : []),
        ].join('\n'),
      );

      for (const game of games) {
        if (
          Number.isSafeInteger(game?.id) &&
          isRankableIgdbGame(game, { gameTypes: normalizedGameTypes })
        ) {
          uniqueGames.set(game.id, game);
        }
      }

      const rankableGames = sortGames(
        [...uniqueGames.values()],
        normalizedSort,
      );

      if (
        rankableGames.length >= normalizedLimit ||
        games.length < pageSize
      ) {
        return rankableGames.slice(0, normalizedLimit);
      }
    }

    throw new Error(
      `IGDB ${relation} ${normalizedId} has more than ${MAX_RELATION_GAME_ROWS} game records; refusing to return a potentially incomplete candidate pool.`,
    );
  }

  async function getGamesByParentGameId({
    id,
    limit = 100,
    sort = 'popular',
    gameTypes = CORE_IGDB_GAME_TYPES,
  }) {
    const normalizedId = normalizePositiveId(id, 'IGDB parent game ID');
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedSort = normalizeGameSort(sort);
    const normalizedGameTypes = normalizeIgdbGameTypes(gameTypes);
    const parentListFields = new Map([
      ['dlc-addon', 'dlcs'],
      ['expansion', 'expansions'],
      ['standalone-expansion', 'standalone_expansions'],
    ]);
    const authoritativeIds = new Set();
    const reverseGameTypes = [];

    const parentResults = await request(
      'games',
      [
        `fields ${GAME_SEARCH_FIELDS};`,
        `where id = ${normalizedId};`,
        'limit 1;',
      ].join('\n'),
    );
    const parentGame = parentResults[0] ?? null;

    if (!parentGame) {
      return [];
    }

    for (const gameType of normalizedGameTypes) {
      const field = parentListFields.get(gameType);

      if (!field) {
        reverseGameTypes.push(gameType);
        continue;
      }

      for (const childId of Array.isArray(parentGame[field]) ? parentGame[field] : []) {
        if (Number.isSafeInteger(childId) && childId > 0) {
          authoritativeIds.add(childId);
        }
      }
    }

    const uniqueGames = new Map();
    const authoritativeIdList = [...authoritativeIds];

    for (let offset = 0; offset < authoritativeIdList.length; offset += MAX_QUERY_LIMIT) {
      const batchIds = authoritativeIdList.slice(offset, offset + MAX_QUERY_LIMIT);
      const games = await getGamesByIds(batchIds);

      for (const game of games) {
        if (
          Number.isSafeInteger(game?.id) &&
          isRankableIgdbGame(game, { gameTypes: normalizedGameTypes })
        ) {
          uniqueGames.set(game.id, game);
        }
      }
    }

    if (reverseGameTypes.length > 0) {
      const pageSize = Math.min(
        MAX_QUERY_LIMIT,
        Math.max(100, normalizedLimit * 4),
      );

      for (
        let offset = 0;
        offset < MAX_RELATION_GAME_ROWS;
        offset += pageSize
      ) {
        const games = await request(
          'games',
          [
            `fields ${GAME_FIELDS};`,
            `where version_parent = null & parent_game = ${normalizedId};`,
            `sort ${GAME_SORTS[normalizedSort]};`,
            `limit ${pageSize};`,
            ...(offset > 0 ? [`offset ${offset};`] : []),
          ].join('\n'),
        );

        for (const game of games) {
          if (
            Number.isSafeInteger(game?.id) &&
            isRankableIgdbGame(game, { gameTypes: reverseGameTypes })
          ) {
            uniqueGames.set(game.id, game);
          }
        }

        if (games.length < pageSize) {
          break;
        }

        if (offset + pageSize >= MAX_RELATION_GAME_ROWS) {
          throw new Error(
            `IGDB parent game ${normalizedId} has more than ${MAX_RELATION_GAME_ROWS} child game records; refusing to return a potentially incomplete candidate pool.`,
          );
        }
      }
    }

    return sortGames([...uniqueGames.values()], normalizedSort).slice(
      0,
      normalizedLimit,
    );
  }

  async function getGamesByFranchiseId({
    id,
    limit = 100,
    sort = 'popular',
    gameTypes = CORE_IGDB_GAME_TYPES,
  }) {
    const normalizedId = normalizePositiveId(id, 'IGDB franchise ID');
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedSort = normalizeGameSort(sort);
    const normalizedGameTypes = normalizeIgdbGameTypes(gameTypes);
    const franchise = await getFranchiseById(normalizedId);

    if (!franchise) {
      return [];
    }

    const gameIds = [
      ...new Set(
        (Array.isArray(franchise.games) ? franchise.games : []).filter(
          (gameId) => Number.isSafeInteger(gameId) && gameId > 0,
        ),
      ),
    ];

    if (gameIds.length === 0) {
      return [];
    }

    const uniqueGames = new Map();

    // IGDB limits one ID-list lookup to 500 IDs. The franchise record itself
    // contains the authoritative association list, so load those IDs in
    // batches rather than relying on the games endpoint's relation index.
    for (let offset = 0; offset < gameIds.length; offset += MAX_QUERY_LIMIT) {
      const batchIds = gameIds.slice(offset, offset + MAX_QUERY_LIMIT);
      const games = await getGamesByIds(batchIds);

      for (const game of games) {
        if (
          Number.isSafeInteger(game?.id) &&
          isRankableIgdbGame(game, { gameTypes: normalizedGameTypes })
        ) {
          uniqueGames.set(game.id, game);
        }
      }
    }

    return sortGames([...uniqueGames.values()], normalizedSort).slice(
      0,
      normalizedLimit,
    );
  }

  async function getGamesByCompanyId({
    id,
    limit = 100,
    sort = 'popular',
    gameTypes = CORE_IGDB_GAME_TYPES,
  }) {
    const normalizedId = normalizePositiveId(id, 'IGDB company ID');
    const normalizedLimit = normalizeLimit(limit, 100);
    const normalizedGameTypes = normalizeIgdbGameTypes(gameTypes);
    const uniqueGames = new Map();

    for (
      let offset = 0;
      offset < MAX_COMPANY_INVOLVEMENTS;
      offset += MAX_QUERY_LIMIT
    ) {
      const involvementRows = await request(
        'involved_companies',
        [
          `fields game.${GAME_FIELDS.split(',').join(',game.')};`,
          `where company = ${normalizedId};`,
          `limit ${MAX_QUERY_LIMIT};`,
          `offset ${offset};`,
        ].join('\n'),
      );

      for (const row of involvementRows) {
        const game = row.game;

        if (
          game &&
          Number.isSafeInteger(game.id) &&
          isRankableIgdbGame(game, { gameTypes: normalizedGameTypes })
        ) {
          uniqueGames.set(game.id, game);
        }
      }

      if (involvementRows.length < MAX_QUERY_LIMIT) {
        return sortGames([...uniqueGames.values()], sort).slice(
          0,
          normalizedLimit,
        );
      }
    }

    throw new Error(
      `IGDB company ${normalizedId} has more than ${MAX_COMPANY_INVOLVEMENTS} involvement records; refusing to return a potentially incomplete candidate pool.`,
    );
  }

  return {
    request,
    getAccessToken,
    clearAccessToken,
    searchGames,
    searchPlatforms,
    searchGenres,
    searchFranchises,
    searchCompanies,
    getGenreById,
    getFranchiseById,
    getPlatformById,
    getCompanyById,
    getGamesByIds,
    getGameById,
    getGamesByRelation,
    getGamesByParentGameId,
    getGamesByFranchiseId,
    getGamesByCompanyId,
  };
}
