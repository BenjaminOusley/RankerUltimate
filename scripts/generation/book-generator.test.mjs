import { describe, expect, it, vi } from 'vitest';

import {
  generateBookCollection,
  validateBookGenerationRequest,
} from './book-generator.mjs';

const baseRequest = {
  mediaType: 'book',
  query: 'Dune',
  collectionId: 'generated-books-test',
  hardcoverId: 1150,
  resolvedName: 'Dune',
  limit: 50,
};

function book({
  id,
  title,
  readers = 0,
  ratings = 0,
  compilation = false,
  partial = false,
  releaseYear = 2000,
  image = null,
  canonical = null,
}) {
  return {
    id,
    canonical_id: canonical?.id ?? null,
    title,
    release_year: releaseYear,
    compilation,
    is_partial_book: partial,
    users_read_count: readers,
    ratings_count: ratings,
    rating: 4,
    image: image ? { url: image } : null,
    canonical,
  };
}

describe('book generator', () => {
  it('validates persisted Hardcover generation requests', () => {
    expect(
      validateBookGenerationRequest({
        ...baseRequest,
        mode: 'series',
        sort: 'series-order',
      }),
    ).toMatchObject({
      ok: true,
      request: {
        mediaType: 'book',
        mode: 'series',
        hardcoverId: 1150,
        sort: 'series-order',
      },
    });
  });

  it('takes the first N usable integer series positions and prefers real conceptual books over compilations', async () => {
    const sandworms = book({
      id: 800,
      title: 'Sandworms of Dune',
      readers: 900,
      ratings: 500,
      releaseYear: 2007,
      image: 'sandworms.jpg',
    });

    const hardcover = {
      async getSeriesById() {
        return {
          id: 1150,
          name: 'Dune',
          primary_books_count: 2,
          book_series: [
            {
              position: 1,
              compilation: false,
              book: book({
                id: 100,
                title: 'Dune',
                readers: 5000,
                ratings: 4000,
                releaseYear: 1965,
                image: 'dune.jpg',
              }),
            },
            {
              position: 3,
              compilation: true,
              book: book({
                id: 900,
                title: 'The Dune Audio Collection',
                readers: 1200,
                ratings: 700,
                compilation: true,
              }),
            },
            {
              position: 3,
              compilation: false,
              book: book({
                id: 901,
                title: 'Piaskowe robaki Diuny',
                readers: 20,
                ratings: 10,
                canonical: sandworms,
              }),
            },
            {
              position: 4,
              compilation: false,
              book: book({
                id: 999,
                title: 'Later noisy position',
                readers: 500,
              }),
            },
          ],
        };
      },
    };

    const result = await generateBookCollection({
      request: {
        ...baseRequest,
        mode: 'series',
        limit: 50,
        sort: 'series-order',
      },
      hardcover,
      logger: { log: vi.fn() },
    });

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Dune',
      'Sandworms of Dune',
    ]);
    expect(result.collection.items[1].source).toEqual({
      provider: 'hardcover',
      id: '800',
      type: 'book',
    });
  });

  it('paginates author contributions, keeps Authorship / Literary roles, and canonicalizes Works', async () => {
    const canonicalBook = book({
      id: 20,
      title: 'Canonical Book',
      readers: 500,
      ratings: 300,
      image: 'canonical.jpg',
    });
    const getAuthorContributionsPage = vi.fn(async () => ({
      author: {
        id: 1,
        name: 'Example Author',
      },
      contributions: [
        {
          id: 1,
          contributor_role: { contributor_role_category_id: 1 },
          book: book({
            id: 10,
            title: 'First Book',
            readers: 1000,
            ratings: 700,
            image: 'first.jpg',
          }),
        },
        {
          id: 2,
          contributor_role: null,
          contribution: 'Introduction',
          book: book({
            id: 11,
            title: 'Someone Else’s Book',
            readers: 2000,
          }),
        },
        {
          id: 3,
          contributor_role: { contributor_role_category_id: 1 },
          book: book({
            id: 21,
            title: 'Translated Alias',
            readers: 50,
            ratings: 20,
            canonical: canonicalBook,
          }),
        },
      ],
    }));

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'author',
        query: 'Example Author',
        collectionId: 'generated-author-test',
        hardcoverId: 1,
        resolvedName: 'Example Author',
        limit: 2,
        sort: 'popular',
      },
      hardcover: { getAuthorContributionsPage },
      logger: { log: vi.fn() },
    });

    expect(getAuthorContributionsPage).toHaveBeenCalledOnce();
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'First Book',
      'Canonical Book',
    ]);
    expect(result.collection.items.some((item) => item.name.includes('Someone'))).toBe(false);
  });

  it('ranks genre/subject results by relevance-weighted popularity instead of raw readership', async () => {
    const getBooksByTag = vi.fn(async ({ limit, offset }) => {
      expect(limit).toBe(100);
      expect(offset).toBe(0);

      return [
      {
        count: 1,
        book: {
          id: 1,
          title: 'Very popular weak match',
          users_read_count: 10000,
          image: { url: 'weak.jpg' },
          featured_book_series: {
            series: {
              id: 1185,
              name: 'Weak Match Series',
              author: { name: 'Popular Author' },
            },
          },
          taggable_counts: [
            { count: 20, tag: { slug: 'fantasy' } },
            { count: 1, tag: { slug: 'science-fiction' } },
          ],
        },
      },
      {
        count: 20,
        book: {
          id: 2,
          title: 'Strong genre match',
          users_read_count: 3000,
          image: { url: 'strong.jpg' },
          featured_book_series: {
            series: {
              id: 1150,
              name: 'Strong Match Series',
              author: { name: 'Genre Author' },
            },
          },
          taggable_counts: [
            { count: 20, tag: { slug: 'science-fiction' } },
            { count: 3, tag: { slug: 'fantasy' } },
          ],
        },
      },
    ];
    });

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'Science Fiction',
        collectionId: 'generated-scifi-test',
        hardcoverId: 55,
        resolvedName: 'Science Fiction',
        limit: 2,
        sort: 'popular',
        tagSlug: 'science-fiction',
        tagCategorySlug: 'genre',
        candidateLimit: 150,
      },
      hardcover: { getBooksByTag },
      logger: { log: vi.fn() },
    });

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Strong Match Series',
      'Weak Match Series',
    ]);
    expect(result.collection.items[0].source.type).toBe('book-series');
    expect(result.collection.candidateSource.definition).toMatchObject({
      mode: 'tag-series',
      hardcoverId: 55,
      tagSlug: 'science-fiction',
      tagCategorySlug: 'genre',
      candidateLimit: 150,
    });
  });

  it('backs tag queries down to smaller pages after a Hardcover 408 timeout', async () => {
    const timeout = new Error('Hardcover HTTP 408: {\"error\":\"Request timeout\"}');
    timeout.status = 408;
    const getBooksByTag = vi.fn(async ({ limit, offset }) => {
      if (getBooksByTag.mock.calls.length === 1) {
        expect(limit).toBe(100);
        expect(offset).toBe(0);
        throw timeout;
      }

      expect(limit).toBe(50);
      expect(offset).toBe(0);

      return [
        {
          count: 10,
          book: {
            id: 1,
            title: 'Reliable fantasy match',
            users_read_count: 1000,
            image: { url: 'reliable.jpg' },
            featured_book_series: {
              series: {
                id: 100,
                name: 'Reliable Series',
                author: { name: 'Example Author' },
              },
            },
            taggable_counts: [{ count: 10, tag: { slug: 'fantasy' } }],
          },
        },
      ];
    });

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'Fantasy',
        collectionId: 'generated-timeout-test',
        hardcoverId: 2,
        resolvedName: 'Fantasy',
        limit: 1,
        sort: 'popular',
        tagSlug: 'fantasy',
        tagCategorySlug: 'genre',
        candidateLimit: 150,
      },
      hardcover: { getBooksByTag },
      logger: { log: vi.fn() },
    });

    expect(getBooksByTag).toHaveBeenCalledTimes(2);
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Reliable Series',
    ]);
  });

  it('loads the full available author pool before applying non-popularity sorts', async () => {
    const getAuthorContributionsPage = vi.fn(async ({ offset }) => ({
      author: {
        id: 1,
        name: 'Example Author',
      },
      contributions:
        offset === 0
          ? Array.from({ length: 100 }, (_, index) => ({
              id: index + 1,
              contributor_role: { contributor_role_category_id: 1 },
              book: book({
                id: index + 1,
                title: `Popular Book ${index + 1}`,
                readers: 1000 - index,
                releaseYear: 2000 + (index % 20),
              }),
            }))
          : [
              {
                id: 101,
                contributor_role: { contributor_role_category_id: 1 },
                book: book({
                  id: 101,
                  title: 'Aardvark Book',
                  readers: 1,
                  releaseYear: 1900,
                }),
              },
            ],
    }));

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'author',
        query: 'Example Author',
        collectionId: 'generated-author-name-test',
        hardcoverId: 1,
        resolvedName: 'Example Author',
        limit: 1,
        sort: 'name',
      },
      hardcover: { getAuthorContributionsPage },
      logger: { log: vi.fn() },
    });

    expect(getAuthorContributionsPage).toHaveBeenCalledTimes(2);
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Aardvark Book',
    ]);
  });

});
