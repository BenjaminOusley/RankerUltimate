import { createHash } from 'node:crypto';
import process from 'node:process';

import { createImageCache } from '../scripts/assets/image-cache.mjs';

export const SHARED_RESULT_NAMESPACE = 'shared-results/v1';
export const MAX_SHARED_RESULT_BYTES = 750 * 1024;

const SHARE_ID_PATTERN = /^[a-f0-9]{64}$/;

function json(body, status = 200, cacheControl = 'no-store') {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheControl,
    },
  });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringWithin(value, maximumLength) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isOptionalStringWithin(value, maximumLength) {
  return value === undefined || (typeof value === 'string' && value.length <= maximumLength);
}

function isAllowedImageUrl(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value !== 'string' || value.length > 2048) {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSource(value) {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    isStringWithin(value.provider, 80) &&
    isStringWithin(value.id, 200) &&
    isOptionalStringWithin(value.type, 80)
  );
}

function isScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
}

function isSharedItem(value) {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isStringWithin(value.id, 300) &&
    isStringWithin(value.name, 300) &&
    isOptionalStringWithin(value.subtitle, 300) &&
    isAllowedImageUrl(value.image) &&
    isSource(value.source) &&
    isScore(value.preferenceScore) &&
    (value.personalRating === null || isScore(value.personalRating))
  );
}

export function isValidSharedResultsSnapshot(value) {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  if (!isRecord(value.collection) || !isStringWithin(value.collection.name, 300)) {
    return false;
  }

  if (!isOptionalStringWithin(value.collection.description, 2000)) {
    return false;
  }

  if (
    typeof value.createdAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 1500 ||
    !value.items.every(isSharedItem) ||
    !Number.isSafeInteger(value.comparisons) ||
    value.comparisons < 0 ||
    !Number.isSafeInteger(value.refinementCount) ||
    value.refinementCount < 0
  ) {
    return false;
  }

  return true;
}

export function getSharedResultId(snapshot) {
  const serialized = JSON.stringify(snapshot);
  const bytes = Buffer.byteLength(serialized, 'utf8');

  if (bytes > MAX_SHARED_RESULT_BYTES) {
    throw new Error(`Shared results are larger than the ${MAX_SHARED_RESULT_BYTES} byte limit.`);
  }

  return createHash('sha256').update(serialized).digest('hex');
}

export function getSharedResultPath(id) {
  if (!SHARE_ID_PATTERN.test(id)) {
    throw new Error('Invalid shared result id.');
  }

  return `${SHARED_RESULT_NAMESPACE}/${id}.json`;
}

function isBlobNotFoundError(error) {
  return error?.name === 'BlobNotFoundError' || error?.constructor?.name === 'BlobNotFoundError';
}

async function loadDefaultBlobClient() {
  const { head, put } = await import('@vercel/blob');
  return { head, put };
}

export function createShareResultHandler({
  token = process.env.BLOB_READ_WRITE_TOKEN,
  blobClient = null,
  fetchImpl = globalThis.fetch,
  imageCache = null,
} = {}) {
  const normalizedToken = String(token ?? '').trim();
  let resolvedBlobClient = null;
  let resolvedImageCache = null;

  async function getBlobClient() {
    if (!normalizedToken) {
      throw new Error('RankerUltimate shared results storage is not configured.');
    }

    if (resolvedBlobClient) {
      return resolvedBlobClient;
    }

    resolvedBlobClient = blobClient ?? (await loadDefaultBlobClient());

    if (
      typeof resolvedBlobClient?.head !== 'function' ||
      typeof resolvedBlobClient?.put !== 'function'
    ) {
      throw new Error('RankerUltimate shared results storage requires Blob head and put functions.');
    }

    return resolvedBlobClient;
  }

  function getImageCache() {
    if (resolvedImageCache) {
      return resolvedImageCache;
    }

    resolvedImageCache = imageCache ?? createImageCache({ token: normalizedToken });
    return resolvedImageCache;
  }

  async function cacheSnapshotImages(snapshot) {
    const cache = getImageCache();
    const cachedCollection = await cache.cacheCollection({
      id: 'shared-results',
      name: snapshot.collection.name,
      items: snapshot.items,
    });

    return {
      ...snapshot,
      items: cachedCollection.items,
    };
  }

  async function headIfPresent(pathname) {
    const client = await getBlobClient();

    try {
      return await client.head(pathname, { token: normalizedToken });
    } catch (error) {
      if (isBlobNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function handlePost(request) {
    const contentType = request.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      return json({ error: 'Request body must be JSON.' }, 415);
    }

    const raw = await request.text();

    if (Buffer.byteLength(raw, 'utf8') > MAX_SHARED_RESULT_BYTES) {
      return json({ error: 'Shared results are too large.' }, 413);
    }

    let snapshot;

    try {
      snapshot = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON request body.' }, 400);
    }

    if (!isValidSharedResultsSnapshot(snapshot)) {
      return json({ error: 'Invalid shared results snapshot.' }, 400);
    }

    let storedSnapshot;

    try {
      storedSnapshot = await cacheSnapshotImages(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid shared results image.';

      if (
        message.includes('does not allow upstream host') ||
        message.includes('invalid image URL') ||
        message.includes('only accepts HTTPS')
      ) {
        return json({ error: message }, 400);
      }

      throw error;
    }

    const serialized = JSON.stringify(storedSnapshot);
    const id = getSharedResultId(storedSnapshot);
    const pathname = getSharedResultPath(id);
    const existing = await headIfPresent(pathname);

    if (existing?.url) {
      return json({ id });
    }

    const client = await getBlobClient();

    try {
      await client.put(pathname, serialized, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        contentType: 'application/json; charset=utf-8',
        token: normalizedToken,
      });
    } catch (error) {
      const raced = await headIfPresent(pathname);

      if (!raced?.url) {
        throw error;
      }
    }

    return json({ id }, 201);
  }

  async function handleGet(request) {
    const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';

    if (!SHARE_ID_PATTERN.test(id)) {
      return json({ error: 'Invalid shared result id.' }, 400);
    }

    const existing = await headIfPresent(getSharedResultPath(id));

    if (!existing?.url) {
      return json({ error: 'Shared results were not found.' }, 404);
    }

    const response = await fetchImpl(existing.url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Shared results storage returned ${response.status}.`);
    }

    const snapshot = await response.json();

    if (!isValidSharedResultsSnapshot(snapshot)) {
      throw new Error('Stored shared results are invalid.');
    }

    return json(
      { snapshot },
      200,
      'public, max-age=60, stale-while-revalidate=300',
    );
  }

  return {
    async fetch(request) {
      try {
        if (request.method === 'POST') {
          return await handlePost(request);
        }

        if (request.method === 'GET') {
          return await handleGet(request);
        }

        return json({ error: 'Method not allowed.' }, 405);
      } catch (error) {
        console.error('Shared results request failed:', error);
        return json(
          {
            error: error instanceof Error ? error.message : 'Shared results request failed.',
          },
          500,
        );
      }
    },
  };
}

export default {
  async fetch(request) {
    return createShareResultHandler().fetch(request);
  },
};
