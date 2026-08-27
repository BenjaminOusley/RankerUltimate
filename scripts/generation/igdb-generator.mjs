import { createIgdbRankItem } from '../providers/igdb.mjs';

const MAX_COLLECTION_LIMIT = 250;
const MODES = new Set(['genre', 'franchise', 'platform', 'company']);
const SORTS = new Set(['rating', 'release-asc', 'release-desc', 'name']);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function validateRequest(request) {
  if (!isObject(request)) {
    throw new Error('IGDB generation request must be an object.');
  }

  if (!MODES.has(request.mode)) {
    throw new Error(`Unsupported IGDB generation mode: ${request.mode}`);
  }

  const query = requireNonEmptyString(request.query, 'IGDB generation query');
  const collectionId = requireNonEmptyString(
    request.collectionId,
    'IGDB collection ID',
  );

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collectionId)) {
    throw new Error('IGDB collection ID must be a lowercase slug.');
  }

  if (!Number.isSafeInteger(request.igdbId) || request.igdbId < 1) {
    throw new Error('IGDB generation requires a resolved positive IGDB ID.');
  }

  const limit = request.limit ?? 50;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COLLECTION_LIMIT) {
    throw new Error(`IGDB collection limit must be between 1 and ${MAX_COLLECTION_LIMIT}.`);
  }

  const sort = request.sort ?? 'rating';

  if (!SORTS.has(sort)) {
    throw new Error(`Unsupported IGDB collection sort: ${sort}`);
  }

  return {
    mode: request.mode,
    query,
    collectionId,
    igdbId: request.igdbId,
    limit,
    sort,
  };
}

async function loadResolvedEntity(igdb, request) {
  if (request.mode === 'genre') {
    return igdb.getGenreById(request.igdbId);
  }

  if (request.mode === 'franchise') {
    return igdb.getFranchiseById(request.igdbId);
  }

  if (request.mode === 'platform') {
    return igdb.getPlatformById(request.igdbId);
  }

  return igdb.getCompanyById(request.igdbId);
}

async function loadGames(igdb, request) {
  if (request.mode === 'genre') {
    return igdb.getGamesByRelation({
      relation: 'genres',
      id: request.igdbId,
      limit: request.limit,
      sort: request.sort,
    });
  }

  if (request.mode === 'platform') {
    return igdb.getGamesByRelation({
      relation: 'platforms',
      id: request.igdbId,
      limit: request.limit,
      sort: request.sort,
    });
  }

  if (request.mode === 'franchise') {
    return igdb.getGamesByFranchiseId(request.igdbId, request.limit, request.sort);
  }

  return igdb.getGamesByCompanyId(request.igdbId, request.limit, request.sort);
}

function createCollection(request, resolvedEntity, items) {
  const entityName = resolvedEntity.name;

  let description;

  if (request.mode === 'genre') {
    description = `${entityName} games from IGDB.`;
  } else if (request.mode === 'franchise') {
    description = `Games in the ${entityName} franchise.`;
  } else if (request.mode === 'platform') {
    description = `Games released on ${entityName}.`;
  } else {
    description = `Games associated with ${entityName}.`;
  }

  return {
    id: `${request.collectionId}-games`,
    name: `${entityName} Games`,
    description,
    candidateSource: {
      kind: 'generated',
      provider: 'igdb',
      originalRequest: request.query,
      definition: {
        schemaVersion: 1,
        collectionId: request.collectionId,
        mediaType: 'game',
        mode: request.mode,
        query: request.query,
        igdbId: resolvedEntity.id,
        resolvedName: entityName,
        limit: request.limit,
        sort: request.sort,
      },
    },
    items,
  };
}

export async function generateIgdbCollection({ request, igdb, logger = console }) {
  if (!igdb) {
    throw new Error('IGDB provider is not configured.');
  }

  const normalizedRequest = validateRequest(request);
  const resolvedEntity = await loadResolvedEntity(igdb, normalizedRequest);

  if (!resolvedEntity) {
    throw new Error(
      `IGDB ${normalizedRequest.mode} ${normalizedRequest.igdbId} was not found.`,
    );
  }

  logger.log(
    `✓ ${normalizedRequest.mode}: ${resolvedEntity.name} [IGDB ${resolvedEntity.id}]`,
  );

  const games = await loadGames(igdb, normalizedRequest);
  const uniqueGames = [...new Map(games.map((game) => [game.id, game])).values()];

  if (uniqueGames.length === 0) {
    throw new Error(`No games were found for ${resolvedEntity.name}.`);
  }

  const items = uniqueGames.map(createIgdbRankItem);
  const missingPosterCount = items.filter((item) => !item.image).length;

  logger.log(`Found ${items.length} game candidate(s).`);

  return {
    collection: createCollection(normalizedRequest, resolvedEntity, items),
    resolvedEntity,
    candidateCount: uniqueGames.length,
    validatedCount: items.length,
    missingPosterCount,
  };
}

export function validateIgdbGenerationRequest(request) {
  try {
    return {
      ok: true,
      request: validateRequest(request),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid IGDB generation request.',
    };
  }
}
