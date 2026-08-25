import process from 'node:process';

import {
  refreshGeneratedCollectionSource,
  validateRefreshSourceRequest,
} from '../scripts/sources/refresh-generated-collection.mjs';
import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';

export { validateRefreshSourceRequest } from '../scripts/sources/refresh-generated-collection.mjs';

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

    const validation = validateRefreshSourceRequest(body);

    if (!validation.ok) {
      return json(
        {
          error: validation.error,
        },
        400,
      );
    }

    if (validation.request.source.provider !== 'tmdb') {
      return json(
        {
          error: `Unsupported collection source provider: ${validation.request.source.provider}`,
        },
        400,
      );
    }

    const token = process.env.TMDB_READ_ACCESS_TOKEN;

    if (!token) {
      console.error('TMDB_READ_ACCESS_TOKEN is missing.');

      return json(
        {
          error: 'The TMDB collection source is not configured.',
        },
        500,
      );
    }

    try {
      const result = await refreshGeneratedCollectionSource({
        collectionId: validation.request.collectionId,
        source: validation.request.source,
        providers: {
          tmdb: createTmdbProvider(token),
        },
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
      console.error('Collection source refresh failed:', error);

      return json(
        {
          error: error instanceof Error ? error.message : 'Collection source refresh failed.',
        },
        500,
      );
    }
  },
};
