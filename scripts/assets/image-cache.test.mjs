import { describe, expect, it, vi } from 'vitest';

import {
  IMAGE_CACHE_NAMESPACE,
  createImageCache,
  getImageCachePath,
} from './image-cache.mjs';

function blobNotFound() {
  const error = new Error('not found');
  error.name = 'BlobNotFoundError';
  return error;
}

function imageResponse(bytes = [1, 2, 3], headers = {}) {
  return new Response(Uint8Array.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      ...headers,
    },
  });
}

function createBlobClient({ existing = new Map(), putFailure = null } = {}) {
  const head = vi.fn(async (pathname) => {
    const found = existing.get(pathname);

    if (!found) {
      throw blobNotFound();
    }

    return found;
  });

  const put = vi.fn(async (pathname, body, options) => {
    if (putFailure) {
      throw putFailure;
    }

    const result = {
      pathname,
      url: `https://rankerultimate.public.blob.vercel-storage.com/${pathname}`,
      contentType: options.contentType,
      size: body.byteLength,
    };

    existing.set(pathname, result);
    return result;
  });

  return {
    existing,
    head,
    put,
  };
}

describe('shared image cache', () => {
  it('creates stable provider-specific paths from upstream URLs', () => {
    const source = 'https://image.tmdb.org/t/p/w500/example.jpg';
    const first = getImageCachePath(source);
    const second = getImageCachePath(source);

    expect(first).toBe(second);
    expect(first).toMatch(new RegExp(`^${IMAGE_CACHE_NAMESPACE}/tmdb/[a-f0-9]{64}$`));
  });

  it('returns an existing cached blob without downloading the upstream image', async () => {
    const source = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg';
    const pathname = getImageCachePath(source);
    const existingUrl = `https://rankerultimate.public.blob.vercel-storage.com/${pathname}`;
    const blobClient = createBlobClient({
      existing: new Map([[pathname, { pathname, url: existingUrl }]]),
    });
    const fetchImpl = vi.fn();
    const cache = createImageCache({
      token: 'test-token',
      blobClient,
      fetchImpl,
    });

    await expect(cache.cacheUrl(source)).resolves.toBe(existingUrl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(blobClient.put).not.toHaveBeenCalled();
  });

  it('downloads image bytes and stores them in public Blob storage on a cache miss', async () => {
    const source = 'https://stephenking.com/images/books/carrie/hardcover_prop_embed.jpg';
    const blobClient = createBlobClient();
    const fetchImpl = vi.fn(async () => imageResponse([10, 20, 30, 40]));
    const cache = createImageCache({
      token: 'test-token',
      blobClient,
      fetchImpl,
    });

    const cachedUrl = await cache.cacheUrl(source);

    expect(cachedUrl).toMatch(/^https:\/\/rankerultimate\.public\.blob\.vercel-storage\.com\//);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(blobClient.put).toHaveBeenCalledOnce();

    const [, bytes, options] = blobClient.put.mock.calls[0];

    expect([...bytes]).toEqual([10, 20, 30, 40]);
    expect(options).toMatchObject({
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'image/jpeg',
      token: 'test-token',
    });
  });

  it('coalesces duplicate collection artwork into one shared cache operation', async () => {
    const source = 'https://image.tmdb.org/t/p/w500/shared.jpg';
    const blobClient = createBlobClient();
    const fetchImpl = vi.fn(async () => imageResponse());
    const cache = createImageCache({
      token: 'test-token',
      blobClient,
      fetchImpl,
      concurrency: 2,
    });

    const collections = await cache.cacheCollections([
      {
        id: 'one',
        items: [
          { id: 'a', image: source },
          { id: 'b', image: source },
        ],
      },
      {
        id: 'two',
        items: [{ id: 'c', image: source }],
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(blobClient.put).toHaveBeenCalledOnce();
    expect(collections[0].items[0].image).toBe(collections[1].items[0].image);
  });

  it('leaves already-cached public Blob URLs untouched', async () => {
    const source =
      'https://rankerultimate.public.blob.vercel-storage.com/catalog-images/v1/tmdb/existing';
    const blobClient = createBlobClient();
    const fetchImpl = vi.fn();
    const cache = createImageCache({
      token: 'test-token',
      blobClient,
      fetchImpl,
    });

    await expect(cache.cacheUrl(source)).resolves.toBe(source);
    expect(blobClient.head).not.toHaveBeenCalled();
    expect(blobClient.put).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsupported upstream hosts instead of acting as an arbitrary image proxy', async () => {
    const cache = createImageCache({
      token: 'test-token',
      blobClient: createBlobClient(),
      fetchImpl: vi.fn(),
    });

    await expect(cache.cacheUrl('https://example.com/image.jpg')).rejects.toThrow(
      'Image cache does not allow upstream host: example.com',
    );
  });

  it('rejects non-image responses', async () => {
    const cache = createImageCache({
      token: 'test-token',
      blobClient: createBlobClient(),
      fetchImpl: vi.fn(async () =>
        new Response('<html>nope</html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
          },
        }),
      ),
    });

    await expect(
      cache.cacheUrl('https://image.tmdb.org/t/p/w500/not-an-image.jpg'),
    ).rejects.toThrow('unsupported content type text/html');
  });

  it('rejects images above the configured byte limit', async () => {
    const cache = createImageCache({
      token: 'test-token',
      blobClient: createBlobClient(),
      maximumBytes: 3,
      fetchImpl: vi.fn(async () => imageResponse([1, 2, 3, 4])),
    });

    await expect(
      cache.cacheUrl('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/large.jpg'),
    ).rejects.toThrow('larger than 3 bytes');
  });

  it('recovers when another request wins the deterministic Blob upload race', async () => {
    const source = 'https://assets.hardcover.app/example.jpg';
    const pathname = getImageCachePath(source);
    const winnerUrl = `https://rankerultimate.public.blob.vercel-storage.com/${pathname}`;
    const existing = new Map();
    const raceError = new Error('blob already exists');
    let headCalls = 0;

    const blobClient = {
      head: vi.fn(async () => {
        headCalls += 1;

        if (headCalls === 1) {
          throw blobNotFound();
        }

        return {
          pathname,
          url: winnerUrl,
        };
      }),
      put: vi.fn(async () => {
        existing.set(pathname, true);
        throw raceError;
      }),
    };

    const cache = createImageCache({
      token: 'test-token',
      blobClient,
      fetchImpl: vi.fn(async () => imageResponse()),
    });

    await expect(cache.cacheUrl(source)).resolves.toBe(winnerUrl);
    expect(blobClient.head).toHaveBeenCalledTimes(2);
    expect(blobClient.put).toHaveBeenCalledOnce();
  });
});
