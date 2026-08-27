import process from 'node:process';

import { findIgdbEntityMatches } from '../scripts/generation/igdb-entity-search.mjs';
import { createIgdbProvider } from '../scripts/providers/igdb.mjs';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export function validateIgdbEntitySearchRequest(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      error: 'IGDB entity search request must be an object.',
    };
  }

  const { mode, query } = value;

  if (!['genre', 'franchise', 'platform', 'company'].includes(mode)) {
    return {
      ok: false,
      error: 'IGDB entity search mode must be genre, franchise, platform, or company.',
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

    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(
        {
          error: 'The IGDB collection generator is not configured.',
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

    const validation = validateIgdbEntitySearchRequest(body);

    if (!validation.ok) {
      return json(
        {
          error: validation.error,
        },
        400,
      );
    }

    try {
      const igdb = createIgdbProvider({
        clientId,
        clientSecret,
      });

      const matches = await findIgdbEntityMatches({
        igdb,
        mode: validation.request.mode,
        query: validation.request.query,
      });

      return json({ matches });
    } catch (error) {
      console.error('IGDB entity search failed:', error);

      return json(
        {
          error: error instanceof Error ? error.message : 'IGDB entity search failed.',
        },
        500,
      );
    }
  },
};
