import { resolveCollectionRequestTurn } from '../scripts/resolution/collection-request-resolver.mjs';

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

    const resolution = resolveCollectionRequestTurn({
      text: body?.text,
      context: body?.context,
    });

    if (!resolution.ok) {
      return json({ error: resolution.error }, 400);
    }

    return json({ resolution: resolution.result });
  },
};
