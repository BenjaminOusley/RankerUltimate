import process from 'node:process';

import { planCollectionRequest } from '../scripts/resolution/collection-request-planner.mjs';
import { createIgdbProvider } from '../scripts/providers/igdb.mjs';
import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function validatePlanningBody(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      error: 'Collection planning request must be an object.',
    };
  }

  const request = value.request;

  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return {
      ok: false,
      error: 'Collection planning requires a ready request.',
    };
  }

  return {
    ok: true,
    request,
  };
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405);
    }

    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return json({ error: 'Request body must be JSON.' }, 415);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON request body.' }, 400);
    }

    const validation = validatePlanningBody(body);

    if (!validation.ok) {
      return json({ error: validation.error }, 400);
    }

    const mediaTypes = Array.isArray(validation.request.mediaTypes)
      ? validation.request.mediaTypes
      : [];
    const needsTmdb = mediaTypes.some((mediaType) => mediaType === 'movie' || mediaType === 'tv');
    const needsIgdb = mediaTypes.includes('game');

    const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
    const igdbClientId = process.env.IGDB_CLIENT_ID;
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET;

    if (needsTmdb && !tmdbToken) {
      return json({ error: 'TMDB collection planning is not configured.' }, 500);
    }

    if (needsIgdb && (!igdbClientId || !igdbClientSecret)) {
      return json({ error: 'IGDB collection planning is not configured.' }, 500);
    }

    try {
      const plan = await planCollectionRequest({
        request: validation.request,
        tmdb: needsTmdb ? createTmdbProvider(tmdbToken) : null,
        igdb: needsIgdb
          ? createIgdbProvider({
              clientId: igdbClientId,
              clientSecret: igdbClientSecret,
            })
          : null,
      });

      return json({ plan });
    } catch (error) {
      console.error('Collection request planning failed:', error);

      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Collection request planning failed.',
        },
        500,
      );
    }
  },
};
