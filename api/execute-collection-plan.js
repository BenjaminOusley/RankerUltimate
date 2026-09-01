import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { createIgdbProvider } from '../scripts/providers/igdb.mjs';
import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';
import { executeCollectionPlan } from '../scripts/resolution/collection-plan-executor.mjs';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredProviders(plannedRequest) {
  const sources = isObject(plannedRequest?.plan) && Array.isArray(plannedRequest.plan.sources)
    ? plannedRequest.plan.sources
    : [];

  return new Set(
    sources
      .map((source) => (isObject(source) ? source.provider : null))
      .filter((provider) => provider === 'tmdb' || provider === 'igdb'),
  );
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

    if (!isObject(body) || !isObject(body.plannedRequest)) {
      return json({ error: 'Collection execution requires a planned request.' }, 400);
    }

    const requiredProviders = getRequiredProviders(body.plannedRequest);
    const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
    const igdbClientId = process.env.IGDB_CLIENT_ID;
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET;

    if (requiredProviders.has('tmdb') && !tmdbToken) {
      return json({ error: 'TMDB collection generation is not configured.' }, 500);
    }

    if (requiredProviders.has('igdb') && (!igdbClientId || !igdbClientSecret)) {
      return json({ error: 'IGDB collection generation is not configured.' }, 500);
    }

    try {
      const result = await executeCollectionPlan({
        plannedRequest: body.plannedRequest,
        collectionId: `generated-${randomUUID()}`,
        tmdb: requiredProviders.has('tmdb') ? createTmdbProvider(tmdbToken) : null,
        igdb: requiredProviders.has('igdb')
          ? createIgdbProvider({
              clientId: igdbClientId,
              clientSecret: igdbClientSecret,
            })
          : null,
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
      console.error('Collection plan execution failed:', error);

      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Collection plan execution failed.',
        },
        500,
      );
    }
  },
};
