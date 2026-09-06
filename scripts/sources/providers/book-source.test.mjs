import { describe, expect, it, vi } from 'vitest';

import {
  buildBookGenerationRequestFromSource,
  refreshBookCollectionSource,
} from './book-source.mjs';

const source = {
  kind: 'generated',
  provider: 'hardcover',
  originalRequest: 'fantasy books',
  definition: {
    schemaVersion: 1,
    collectionId: 'generated-fantasy',
    mediaType: 'book',
    mode: 'tag-series',
    query: 'fantasy',
    hardcoverId: 10,
    resolvedName: 'Fantasy',
    limit: 50,
    sort: 'popular',
    tagSlug: 'fantasy',
    tagCategorySlug: 'genre',
    candidateLimit: 150,
  },
};

describe('Hardcover generated collection source', () => {
  it('reconstructs the saved semantic source without fuzzy re-resolution', () => {
    expect(
      buildBookGenerationRequestFromSource('saved-fantasy-book-series', source),
    ).toEqual({
      ok: true,
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'fantasy',
        collectionId: 'generated-fantasy',
        hardcoverId: 10,
        resolvedName: 'Fantasy',
        limit: 50,
        sort: 'popular',
        tagSlug: 'fantasy',
        tagCategorySlug: 'genre',
        candidateLimit: 150,
      },
    });
  });

  it('refreshes through the persisted Hardcover ID and preserves the library collection ID', async () => {
    const hardcover = {
      getBooksByTag: vi.fn(async () => [
        {
          count: 10,
          book: {
            id: 1,
            title: 'Example',
            users_read_count: 100,
            image: { url: 'cover.jpg' },
            featured_book_series: {
              series: {
                id: 50,
                name: 'Example Series',
                author: { name: 'Example Author' },
              },
            },
            taggable_counts: [
              {
                count: 10,
                tag: { slug: 'fantasy' },
              },
            ],
          },
        },
      ]),
    };

    const result = await refreshBookCollectionSource({
      collectionId: 'saved-fantasy-book-series',
      source: {
        ...source,
        definition: {
          ...source.definition,
          limit: 1,
        },
      },
      hardcover,
      logger: { log: vi.fn() },
    });

    expect(hardcover.getBooksByTag).toHaveBeenCalledWith({
      tagId: 10,
      categorySlug: 'genre',
      limit: 100,
      offset: 0,
    });
    expect(result.collection.id).toBe('saved-fantasy-book-series');
    expect(result.collection.items[0].source).toEqual({
      provider: 'hardcover',
      id: '50',
      type: 'book-series',
    });
  });
});
