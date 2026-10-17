import process from 'node:process';
import { findRateItems, ITEM_DISCOVERY_SOURCES } from '../scripts/discovery/search-items.mjs';
import { createTmdbProvider } from '../scripts/providers/tmdb.mjs';
import { createIgdbProvider } from '../scripts/providers/igdb.mjs';
import { createHardcoverProvider } from '../scripts/providers/hardcover.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function validateFindRateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Invalid request.' };
  const { provider, mediaType, query } = value;
  if (!ITEM_DISCOVERY_SOURCES.includes(provider)) return { ok: false, error: 'Unknown search provider.' };
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 200)
    return { ok: false, error: 'Search must contain 2–200 characters.' };
  if (provider === 'tmdb' && mediaType !== 'movie' && mediaType !== 'tv')
    return { ok: false, error: 'Choose Movies or TV Shows.' };
  return { ok: true, request: { provider, mediaType, query: query.trim() } };
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (!(request.headers.get('content-type') ?? '').includes('application/json'))
      return json({ error: 'JSON request required.' }, 415);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
    const validation = validateFindRateRequest(body);
    if (!validation.ok) return json({ error: validation.error }, 400);
    const { provider, mediaType, query } = validation.request;
    const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    const hardcoverToken = process.env.HARDCOVER_API_TOKEN;
    if (provider === 'tmdb' && !tmdbToken) return json({ error: 'TMDB is not configured.' }, 503);
    if (provider === 'igdb' && (!clientId || !clientSecret)) return json({ error: 'IGDB is not configured.' }, 503);
    if (provider === 'hardcover' && !hardcoverToken) return json({ error: 'Hardcover is not configured.' }, 503);
    try {
      const items = await findRateItems({
        provider, mediaType, query,
        providers: {
          tmdb: provider === 'tmdb' ? createTmdbProvider(tmdbToken) : null,
          igdb: provider === 'igdb' ? createIgdbProvider({ clientId, clientSecret }) : null,
          hardcover: provider === 'hardcover' ? createHardcoverProvider({ token: hardcoverToken }) : null,
        },
      });
      return json({ items });
    } catch (error) {
      console.error('Find & Rate search failed:', error);
      return json({ error: error instanceof Error ? error.message : 'Item search failed.' }, 500);
    }
  },
};
