import process from 'node:process';

import {
  generateIgdbCollection,
  validateIgdbGenerationRequest,
} from '../scripts/generation/igdb-generator.mjs';
import { generateTmdbCollection } from '../scripts/generation/tmdb-generator.mjs';
import { validateGenerationRequest } from '../scripts/generation/validation.mjs';
import { createIgdbProvider } from '../scripts/providers/igdb.mjs';
import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';

export { validateIgdbGenerationRequest } from '../scripts/generation/igdb-generator.mjs';
export { validateGenerationRequest } from '../scripts/generation/validation.mjs';

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

async function generateGameCollection(body) {
  const validation = validateIgdbGenerationRequest(body);

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: validation.error,
    };
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('IGDB_CLIENT_ID or IGDB_CLIENT_SECRET is missing.');

    return {
      ok: false,
      status: 500,
      error: 'The IGDB collection generator is not configured.',
    };
  }

  const igdb = createIgdbProvider({
    clientId,
    clientSecret,
  });

  return {
    ok: true,
    result: await generateIgdbCollection({
      request: validation.request,
      igdb,
    }),
  };
}

async function generateTmdbMediaCollection(body) {
  const validation = validateGenerationRequest(body);

  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: validation.error,
    };
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;

  if (!token) {
    console.error('TMDB_READ_ACCESS_TOKEN is missing.');

    return {
      ok: false,
      status: 500,
      error: 'The TMDB collection generator is not configured.',
    };
  }

  return {
    ok: true,
    result: await generateTmdbCollection({
      request: validation.request,
      tmdb: createTmdbProvider(token),
    }),
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

    try {
      const generation =
        body?.mediaType === 'game'
          ? await generateGameCollection(body)
          : await generateTmdbMediaCollection(body);

      if (!generation.ok) {
        return json(
          {
            error: generation.error,
          },
          generation.status,
        );
      }

      return json({
        collection: generation.result.collection,
        meta: {
          candidateCount: generation.result.candidateCount,
          validatedCount: generation.result.validatedCount,
          missingPosterCount: generation.result.missingPosterCount,
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
