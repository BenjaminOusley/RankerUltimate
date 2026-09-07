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

  it('reconstructs normalized semantic tag bundles from persisted provider IDs', () => {
    const semanticSource = {
      ...source,
      originalRequest: 'drama books',
      definition: {
        ...source.definition,
        query: 'drama',
        hardcoverId: 20,
        resolvedName: 'Drama',
        tagSlug: 'drama',
        tagCategorySlug: 'tag',
        semanticCategory: 'drama',
        tagSources: [
          { id: 20, slug: 'drama', categorySlug: 'tag', weight: 1 },
          { id: 21, slug: 'plays', categorySlug: 'genre', weight: 0.85 },
          {
            id: 22,
            slug: 'literary-fiction',
            categorySlug: 'genre',
            weight: 0.45,
          },
        ],
      },
    };

    expect(
      buildBookGenerationRequestFromSource('saved-drama-book-series', semanticSource),
    ).toMatchObject({
      ok: true,
      request: {
        mode: 'tag-series',
        hardcoverId: 20,
        resolvedName: 'Drama',
        semanticCategory: 'drama',
        tagSources: semanticSource.definition.tagSources,
      },
    });
  });

  it('reconstructs an individual genre-book source from persisted provider IDs', () => {
    const individualSource = {
      ...source,
      definition: {
        ...source.definition,
        mode: 'tag-books',
      },
    };

    expect(
      buildBookGenerationRequestFromSource('saved-fantasy-books', individualSource),
    ).toMatchObject({
      ok: true,
      request: {
        mode: 'tag-books',
        hardcoverId: 10,
        resolvedName: 'Fantasy',
        tagSlug: 'fantasy',
        tagCategorySlug: 'genre',
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

  it('reconstructs persisted author-series sources without re-resolving the author', () => {
    const result = buildBookGenerationRequestFromSource('library-author-series', {
      definition: {
        schemaVersion: 1,
        collectionId: 'generated-author-series',
        mediaType: 'book',
        mode: 'author-series',
        query: 'Brandon Sanderson',
        hardcoverId: 204214,
        resolvedName: 'Brandon Sanderson',
        limit: 50,
        sort: 'popular',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      request: {
        mode: 'author-series',
        hardcoverId: 204214,
        resolvedName: 'Brandon Sanderson',
        limit: 50,
        sort: 'popular',
      },
    });
  });

});
