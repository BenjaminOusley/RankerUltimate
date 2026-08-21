import process from 'node:process';

import { findPersonMatches } from '../scripts/generation/person-search.mjs';

import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export function validatePersonSearchRequest(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      error: 'Person search request must be an object.',
    };
  }

  const { mode, query } = value;

  if (mode !== 'actor' && mode !== 'director') {
    return {
      ok: false,
      error: 'Person search mode must be actor or director.',
    };
  }

  if (typeof query !== 'string' || query.trim().length < 1 || query.trim().length > 200) {
    return {
      ok: false,
      error: 'Search query must contain between 1 and 200 characters.',
    };
  }

  return {
    ok: true,
    request: {
      mode,
      query: query.trim(),
    },
  };
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
      return json(
        {
          error: 'The collection generator is not configured.',
        },
        500,
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

    const validation = validatePersonSearchRequest(body);

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

      const matches = await findPersonMatches({
        tmdb,
        query: validation.request.query,
        mode: validation.request.mode,
      });

      return json({
        matches,
      });
    } catch (error) {
      console.error('Person search failed:', error);

      return json(
        {
          error: error instanceof Error ? error.message : 'Person search failed.',
        },
        500,
      );
    }
  },
};
