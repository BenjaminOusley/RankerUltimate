import { describe, expect, it, vi } from 'vitest';

import {
  createShareResultHandler,
  getSharedResultPath,
  isValidSharedResultsSnapshot,
} from '../../api/share-result.js';

class BlobNotFoundError extends Error {
  constructor() {
    super('not found');
    this.name = 'BlobNotFoundError';
  }
}

function createSnapshot(overrides = {}) {
  return {
    version: 1,
    createdAt: '2026-10-07T04:00:00.000Z',
    collection: {
      name: 'Test Results',
      description: 'Shared result test',
    },
    items: [
      {
        id: 'alpha',
        name: 'Alpha',
        subtitle: '2026',
        image:
          'https://rankerultimate.public.blob.vercel-storage.com/catalog-images/v1/tmdb/abc123',
        source: {
          provider: 'tmdb',
          id: '123',
          type: 'movie',
        },
        preferenceScore: 9.4,
        personalRating: 9,
      },
    ],
    comparisons: 12,
    refinementCount: 2,
    ...overrides,
  };
}

function createHarness() {
  const stored = new Map();
  const put = vi.fn(async (pathname, body) => {
    if (stored.has(pathname)) {
      throw new Error('already exists');
    }

    stored.set(pathname, String(body));
    return {
      url: `https://rankerultimate.public.blob.vercel-storage.com/${pathname}`,
    };
  });
  const head = vi.fn(async (pathname) => {
    if (!stored.has(pathname)) {
      throw new BlobNotFoundError();
    }

    return {
      url: `https://rankerultimate.public.blob.vercel-storage.com/${pathname}`,
    };
  });
  const fetchImpl = vi.fn(async (url) => {
    const pathname = new URL(url).pathname.replace(/^\//, '');
    const body = stored.get(pathname);

    if (!body) {
      return new Response('missing', { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const handler = createShareResultHandler({
    token: 'test-token',
    blobClient: { head, put },
    fetchImpl,
  });

  return { handler, stored, head, put, fetchImpl };
}

describe('shared results API', () => {
  it('stores a validated snapshot and serves it back by id', async () => {
    const { handler, stored, put } = createHarness();
    const snapshot = createSnapshot();
    const createResponse = await handler.fetch(
      new Request('https://ranker.test/api/share-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }),
    );
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created.id).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.has(getSharedResultPath(created.id))).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);

    const getResponse = await handler.fetch(
      new Request(`https://ranker.test/api/share-result?id=${created.id}`),
    );
    const loaded = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(loaded.snapshot).toEqual(snapshot);
  });

  it('deduplicates identical snapshots by deterministic content hash', async () => {
    const { handler, put } = createHarness();
    const snapshot = createSnapshot();

    const first = await handler.fetch(
      new Request('https://ranker.test/api/share-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }),
    );
    const second = await handler.fetch(
      new Request('https://ranker.test/api/share-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }),
    );

    expect((await first.json()).id).toBe((await second.json()).id);
    expect(second.status).toBe(200);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('rejects snapshots that point shared posters at arbitrary external hosts', async () => {
    const snapshot = createSnapshot({
      items: [
        {
          id: 'bad',
          name: 'Bad Image',
          image: 'https://example.com/tracker.png',
          preferenceScore: 5,
          personalRating: null,
        },
      ],
    });

    expect(isValidSharedResultsSnapshot(snapshot)).toBe(true);

    const { handler } = createHarness();
    const response = await handler.fetch(
      new Request('https://ranker.test/api/share-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects malformed share ids', async () => {
    const { handler } = createHarness();
    const response = await handler.fetch(
      new Request('https://ranker.test/api/share-result?id=not-valid'),
    );

    expect(response.status).toBe(400);
  });
});
