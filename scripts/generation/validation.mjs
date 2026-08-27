const GENERATION_MEDIA_TYPES = new Set(['movie', 'tv']);

const GENERATION_MODES = new Set(['company', 'company-features', 'director', 'actor', 'genre']);

const GENERATION_SORTS = new Set(['release-asc', 'release-desc', 'popularity']);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalInteger(value, minimum, maximum) {
  if (value === null) {
    return true;
  }

  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function failure(error) {
  return {
    ok: false,
    error,
  };
}

export function validateGenerationRequest(value) {
  if (!isObject(value)) {
    return failure('Generation request must be an object.');
  }

  const {
    mode,
    query,
    collectionId,
    limit,
    tmdbId,
    fromYear,
    toYear,
    sort,
    minRuntime,
    excludeDocumentaries,
    includeAdult,
    language,
  } = value;

  const mediaType = value.mediaType ?? 'movie';

  if (!GENERATION_MEDIA_TYPES.has(mediaType)) {
    return failure('Invalid media type.');
  }

  if (!GENERATION_MODES.has(mode)) {
    return failure('Invalid generation mode.');
  }

  if (mediaType === 'tv' && (mode === 'company-features' || mode === 'director')) {
    return failure(`${mode} mode is only supported for movies.`);
  }

  if (typeof query !== 'string' || query.trim().length === 0 || query.trim().length > 200) {
    return failure('Search query must contain between 1 and 200 characters.');
  }

  if (
    typeof collectionId !== 'string' ||
    collectionId.length === 0 ||
    collectionId.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collectionId)
  ) {
    return failure('Invalid collection ID.');
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
    return failure('Maximum results must be between 1 and 250.');
  }

  if (!isOptionalInteger(tmdbId, 1, Number.MAX_SAFE_INTEGER)) {
    return failure('Invalid TMDB ID.');
  }

  if (
    tmdbId !== null &&
    mode !== 'company' &&
    mode !== 'company-features' &&
    mode !== 'actor' &&
    mode !== 'director' &&
    mode !== 'genre'
  ) {
    return failure(
      'TMDB ID can only be used with company, company-features, actor, director, or genre mode.',
    );
  }

  if (!isOptionalInteger(fromYear, 1870, 9999)) {
    return failure('Invalid From Year.');
  }

  if (!isOptionalInteger(toYear, 1870, 9999)) {
    return failure('Invalid To Year.');
  }

  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    return failure('From Year cannot be later than To Year.');
  }

  if (!GENERATION_SORTS.has(sort)) {
    return failure('Invalid generation sort.');
  }

  if (!isOptionalInteger(minRuntime, 0, 1000)) {
    return failure('Minimum runtime must be between 0 and 1000 minutes.');
  }

  if (mediaType === 'tv' && minRuntime !== null) {
    return failure('Minimum runtime is currently only supported for movies.');
  }

  if (typeof excludeDocumentaries !== 'boolean') {
    return failure('Exclude documentaries must be a boolean.');
  }

  if (typeof includeAdult !== 'boolean') {
    return failure('Include adult titles must be a boolean.');
  }

  if (language !== 'en-US') {
    return failure('Unsupported metadata language.');
  }

  return {
    ok: true,
    request: {
      mediaType,
      mode,
      query: query.trim(),
      collectionId,
      limit,
      tmdbId,
      fromYear,
      toYear,
      sort,
      minRuntime,
      excludeDocumentaries,
      includeAdult,
      language,
    },
  };
}
