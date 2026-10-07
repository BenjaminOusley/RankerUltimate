import { createHash } from 'node:crypto';
import process from 'node:process';

export const IMAGE_CACHE_NAMESPACE = 'catalog-images/v1';
export const IMAGE_CACHE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_CACHE_CONCURRENCY = 6;
export const IMAGE_CACHE_BROWSER_TTL_SECONDS = 31_536_000;

const PUBLIC_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';
const MAX_REDIRECTS = 3;

const IMAGE_SOURCE_HOSTS = new Map([
  ['image.tmdb.org', 'tmdb'],
  ['images.igdb.com', 'igdb'],
  ['assets.hardcover.app', 'hardcover'],
  ['stephenking.com', 'stephenking'],
  ['www.stephenking.com', 'stephenking'],
]);

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function requireToken(value) {
  const token = String(value ?? '').trim();

  if (!token) {
    throw new Error('RankerUltimate image cache is not configured.');
  }

  return token;
}

function isPublicBlobUrl(url) {
  return url.protocol === 'https:' && url.hostname.endsWith(PUBLIC_BLOB_HOST_SUFFIX);
}

function normalizeSourceUrl(value) {
  let url;

  try {
    url = new URL(String(value ?? ''));
  } catch {
    throw new Error(`Image cache received an invalid image URL: ${String(value ?? '')}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`Image cache only accepts HTTPS image URLs: ${url.href}`);
  }

  url.hash = '';

  return url;
}

function resolveImageSource(url) {
  if (isPublicBlobUrl(url)) {
    return {
      kind: 'cached',
      provider: 'vercel-blob',
    };
  }

  const provider = IMAGE_SOURCE_HOSTS.get(url.hostname.toLowerCase());

  if (!provider) {
    throw new Error(`Image cache does not allow upstream host: ${url.hostname}`);
  }

  return {
    kind: 'upstream',
    provider,
  };
}

export function getImageCachePath(sourceUrl) {
  const url = normalizeSourceUrl(sourceUrl);
  const source = resolveImageSource(url);

  if (source.kind === 'cached') {
    return null;
  }

  const digest = createHash('sha256').update(url.href).digest('hex');

  return `${IMAGE_CACHE_NAMESPACE}/${source.provider}/${digest}`;
}

function isBlobNotFoundError(error) {
  return error?.name === 'BlobNotFoundError' || error?.constructor?.name === 'BlobNotFoundError';
}

function normalizedContentType(response) {
  return String(response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

async function readResponseBytes(response, maximumBytes) {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(
      `Image cache rejected an image larger than ${maximumBytes} bytes (${declaredLength} bytes).`,
    );
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (bytes.byteLength > maximumBytes) {
      throw new Error(`Image cache rejected an image larger than ${maximumBytes} bytes.`);
    }

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error(`Image cache rejected an image larger than ${maximumBytes} bytes.`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

async function fetchImageResponse(fetchImpl, sourceUrl) {
  let currentUrl = normalizeSourceUrl(sourceUrl);
  const originalSource = resolveImageSource(currentUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        'User-Agent': 'RankerUltimate image-cache/1.0',
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');

      if (!location) {
        throw new Error(
          `Image cache received redirect ${response.status} without a Location header from ${currentUrl.href}.`,
        );
      }

      if (redirectCount === MAX_REDIRECTS) {
        throw new Error(`Image cache exceeded ${MAX_REDIRECTS} redirects for ${sourceUrl}.`);
      }

      const redirectedUrl = normalizeSourceUrl(new URL(location, currentUrl).href);
      const redirectedSource = resolveImageSource(redirectedUrl);

      if (
        redirectedSource.kind !== 'upstream' ||
        redirectedSource.provider !== originalSource.provider
      ) {
        throw new Error(
          `Image cache rejected a redirect from ${currentUrl.hostname} to ${redirectedUrl.hostname}.`,
        );
      }

      currentUrl = redirectedUrl;
      continue;
    }

    return response;
  }

  throw new Error(`Image cache could not resolve ${sourceUrl}.`);
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= values.length) {
        return;
      }

      results[index] = await mapper(values[index], index);
    }
  }

  const workerCount = Math.min(concurrency, values.length);

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function loadDefaultBlobClient() {
  const { head, put } = await import('@vercel/blob');

  return {
    head,
    put,
  };
}

export function createImageCache({
  token = process.env.BLOB_READ_WRITE_TOKEN,
  fetchImpl = globalThis.fetch,
  blobClient = null,
  logger = console,
  maximumBytes = IMAGE_CACHE_MAX_BYTES,
  concurrency = IMAGE_CACHE_CONCURRENCY,
} = {}) {
  const normalizedToken = requireToken(token);

  if (typeof fetchImpl !== 'function') {
    throw new Error('RankerUltimate image cache requires a fetch implementation.');
  }

  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('RankerUltimate image cache maximumBytes must be a positive integer.');
  }

  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('RankerUltimate image cache concurrency must be a positive integer.');
  }

  const cachePromises = new Map();
  let resolvedBlobClient = null;

  async function getBlobClient() {
    if (resolvedBlobClient) {
      return resolvedBlobClient;
    }

    resolvedBlobClient = blobClient ?? (await loadDefaultBlobClient());

    if (
      typeof resolvedBlobClient?.head !== 'function' ||
      typeof resolvedBlobClient?.put !== 'function'
    ) {
      throw new Error('RankerUltimate image cache requires Blob head and put functions.');
    }

    return resolvedBlobClient;
  }

  async function headIfPresent(pathname) {
    const client = await getBlobClient();

    try {
      return await client.head(pathname, {
        token: normalizedToken,
      });
    } catch (error) {
      if (isBlobNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async function cacheUrlUnmemoized(sourceUrl) {
    const url = normalizeSourceUrl(sourceUrl);
    const source = resolveImageSource(url);

    if (source.kind === 'cached') {
      return url.href;
    }

    const pathname = getImageCachePath(url.href);
    const existing = await headIfPresent(pathname);

    if (existing?.url) {
      return existing.url;
    }

    const response = await fetchImageResponse(fetchImpl, url.href);

    if (!response.ok) {
      throw new Error(
        `Image cache could not download ${url.href}: ${response.status} ${response.statusText}.`,
      );
    }

    const contentType = normalizedContentType(response);

    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new Error(
        `Image cache rejected ${url.href}: unsupported content type ${contentType || 'unknown'}.`,
      );
    }

    const bytes = await readResponseBytes(response, maximumBytes);

    if (bytes.byteLength === 0) {
      throw new Error(`Image cache received an empty image from ${url.href}.`);
    }

    const client = await getBlobClient();

    try {
      const uploaded = await client.put(pathname, bytes, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: IMAGE_CACHE_BROWSER_TTL_SECONDS,
        contentType,
        token: normalizedToken,
      });

      logger?.log?.(`Cached image: ${source.provider} -> ${uploaded.url}`);

      return uploaded.url;
    } catch (error) {
      /*
       * Another request can populate the same deterministic pathname after our
       * HEAD miss but before PUT. Re-read the pathname before treating the PUT
       * error as a real failure.
       */
      const raced = await headIfPresent(pathname);

      if (raced?.url) {
        return raced.url;
      }

      throw error;
    }
  }

  async function cacheUrl(sourceUrl) {
    const url = normalizeSourceUrl(sourceUrl);
    const source = resolveImageSource(url);

    if (source.kind === 'cached') {
      return Promise.resolve(url.href);
    }

    const cacheKey = url.href;
    const existingPromise = cachePromises.get(cacheKey);

    if (existingPromise) {
      return existingPromise;
    }

    const promise = cacheUrlUnmemoized(cacheKey);
    cachePromises.set(cacheKey, promise);

    return promise;
  }

  async function cacheCollections(collections) {
    if (!Array.isArray(collections)) {
      throw new Error('RankerUltimate image cache expected an array of collections.');
    }

    const sourceUrls = [];
    const seen = new Set();

    for (const collection of collections) {
      for (const item of collection?.items ?? []) {
        if (typeof item?.image !== 'string' || item.image.length === 0) {
          continue;
        }

        const normalized = normalizeSourceUrl(item.image);
        const source = resolveImageSource(normalized);

        if (source.kind === 'cached') {
          continue;
        }

        if (!seen.has(normalized.href)) {
          seen.add(normalized.href);
          sourceUrls.push(normalized.href);
        }
      }
    }

    const cachedUrls = await mapWithConcurrency(sourceUrls, concurrency, cacheUrl);
    const replacements = new Map(sourceUrls.map((url, index) => [url, cachedUrls[index]]));

    return collections.map((collection) => ({
      ...collection,
      items: (collection?.items ?? []).map((item) => {
        if (typeof item?.image !== 'string' || item.image.length === 0) {
          return item;
        }

        const normalized = normalizeSourceUrl(item.image);
        const replacement = replacements.get(normalized.href);

        if (!replacement || replacement === item.image) {
          return item;
        }

        return {
          ...item,
          image: replacement,
        };
      }),
    }));
  }

  async function cacheCollection(collection) {
    const [cached] = await cacheCollections([collection]);
    return cached;
  }

  return {
    cacheUrl,
    cacheCollection,
    cacheCollections,
  };
}

export async function cacheCollectionImages(collection, options = {}) {
  return createImageCache(options).cacheCollection(collection);
}

export async function cacheManifestImages(manifest, options = {}) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.collections)) {
    throw new Error('RankerUltimate image cache expected a manifest with collections.');
  }

  const imageCache = createImageCache(options);
  const collections = await imageCache.cacheCollections(manifest.collections);

  return {
    ...manifest,
    collections,
  };
}
