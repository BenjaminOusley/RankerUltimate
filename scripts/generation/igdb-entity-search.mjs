import { createIgdbImageUrl } from '../providers/igdb.mjs';

const MODES = new Set(['genre', 'franchise', 'platform', 'company']);

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function normalizeMode(mode) {
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported IGDB entity search mode: ${mode}`);
  }

  return mode;
}

function normalizeMatch(mode, entity) {
  const detail =
    mode === 'platform'
      ? entity.abbreviation ?? null
      : mode === 'company'
        ? 'Game company'
        : null;

  const image =
    mode === 'company' && entity.logo?.image_id
      ? createIgdbImageUrl(entity.logo.image_id, 'logo_med')
      : null;

  return {
    id: entity.id,
    name: entity.name,
    detail,
    image,
  };
}

export async function findIgdbEntityMatches({ igdb, mode, query, limit = 20 }) {
  if (!igdb) {
    throw new Error('IGDB provider is not configured.');
  }

  const normalizedMode = normalizeMode(mode);
  const normalizedQuery = requireNonEmptyString(query, 'IGDB entity search query');

  let entities;

  if (normalizedMode === 'genre') {
    entities = await igdb.searchGenres(normalizedQuery, limit);
  } else if (normalizedMode === 'franchise') {
    entities = await igdb.searchFranchises(normalizedQuery, limit);
  } else if (normalizedMode === 'platform') {
    entities = await igdb.searchPlatforms(normalizedQuery, limit);
  } else {
    entities = await igdb.searchCompanies(normalizedQuery, limit);
  }

  const matches = entities
    .filter(
      (entity) =>
        Number.isSafeInteger(entity?.id) &&
        entity.id > 0 &&
        typeof entity?.name === 'string' &&
        entity.name.trim().length > 0,
    )
    .map((entity) => normalizeMatch(normalizedMode, entity));

  return matches.sort((a, b) => {
    const aExact = a.name.localeCompare(normalizedQuery, undefined, { sensitivity: 'accent' }) === 0;
    const bExact = b.name.localeCompare(normalizedQuery, undefined, { sensitivity: 'accent' }) === 0;

    if (aExact !== bExact) {
      return aExact ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}
