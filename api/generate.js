import process from 'node:process';

import { generateTmdbCollection } from '../scripts/generation/tmdb-generator.mjs';

import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';

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

  if (!GENERATION_MODES.has(mode)) {
    return failure('Invalid generation mode.');
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
    mode !== 'director'
  ) {
    return failure(
      'TMDB ID can only be used with company, company-features, actor, or director mode.',
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

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return json(
        {
          error: 'Method not allowed.',
        },
        405,
      );
    }

    const token = process.env.TMDB_READ_ACCESS_TOKEN;

    if (!token) {
      console.error('TMDB_READ_ACCESS_TOKEN is missing.');

      return json(
        {
          error: 'The collection generator is not configured.',
        },
        500,
      );
    }

    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return json(
        {
          error: 'Request body must be JSON.',
        },
        415,
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          error: 'Invalid JSON request body.',
        },
        400,
      );
    }

    const validation = validateGenerationRequest(body);

    if (!validation.ok) {
      return json(
        {
          error: validation.error,
        },
        400,
      );
    }

    try {
      const tmdb = createTmdbProvider(token);

      const result = await generateTmdbCollection({
        request: validation.request,
        tmdb,
      });

      return json({
        collection: result.collection,

        meta: {
          candidateCount: result.candidateCount,

          validatedCount: result.validatedCount,

          missingPosterCount: result.missingPosterCount,
        },
      });
    } catch (error) {
      console.error('Collection generation failed:', error);

      return json(
        {
          error: error instanceof Error ? error.message : 'Collection generation failed.',
        },
        500,
      );
    }
  },
};
