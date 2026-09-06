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

  it('generates popular individual conceptual books for a genre tag', async () => {
    const getBooksByTag = vi.fn(async () => [
      {
        count: 20,
        book: book({
          id: 1,
          title: 'Popular Fantasy Book',
          readers: 5000,
          ratings: 3000,
          releaseYear: 2001,
          image: 'popular.jpg',
        }),
      },
      {
        count: 2,
        book: book({
          id: 2,
          title: 'Weak Fantasy Match',
          readers: 10000,
          ratings: 5000,
          releaseYear: 2002,
          image: 'weak.jpg',
        }),
      },
    ].map((row, index) => ({
      ...row,
      book: {
        ...row.book,
        taggable_counts: [{ count: index === 0 ? 20 : 20 }],
      },
    })));

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-books',
        query: 'Fantasy',
        collectionId: 'generated-fantasy-books-test',
        hardcoverId: 2,
        resolvedName: 'Fantasy',
        limit: 2,
        sort: 'popular',
        tagSlug: 'fantasy',
        tagCategorySlug: 'genre',
        candidateLimit: 150,
      },
      hardcover: { getBooksByTag },
      logger: { log: vi.fn() },
    });

    expect(result.collection.name).toBe('Fantasy Books');
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Popular Fantasy Book',
      'Weak Fantasy Match',
    ]);
    expect(result.collection.items.every((item) => item.source.type === 'book')).toBe(true);
    expect(result.collection.candidateSource.definition).toMatchObject({
      mode: 'tag-books',
      hardcoverId: 2,
      tagSlug: 'fantasy',
      tagCategorySlug: 'genre',
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

  it('combines normalized semantic category signals without double-counting conceptual books', async () => {
    const getBooksByTag = vi.fn(async ({ tagId, limit, offset }) => {
      expect(limit).toBe(100);
      expect(offset).toBe(0);

      if (tagId === 20) {
        return [
          {
            count: 10,
            book: {
              id: 1,
              title: 'Direct drama match',
              users_read_count: 1000,
              image: { url: 'drama.jpg' },
              featured_book_series: {
                series: {
                  id: 200,
                  name: 'Drama Series',
                  author: { name: 'Drama Author' },
                },
              },
              taggable_counts: [{ count: 10, tag: { slug: 'drama' } }],
            },
          },
        ];
      }

      if (tagId === 21) {
        return [
          {
            count: 10,
            book: {
              id: 2,
              title: 'Stage drama match',
              users_read_count: 600,
              image: { url: 'plays.jpg' },
              featured_book_series: {
                series: {
                  id: 201,
                  name: 'Play Series',
                  author: { name: 'Play Author' },
                },
              },
              taggable_counts: [{ count: 10, tag: { slug: 'plays' } }],
            },
          },
        ];
      }

      return [
        {
          count: 10,
          book: {
            id: 1,
            title: 'Direct drama match',
            users_read_count: 1000,
            image: { url: 'drama.jpg' },
            featured_book_series: {
              series: {
                id: 200,
                name: 'Drama Series',
                author: { name: 'Drama Author' },
              },
            },
            taggable_counts: [{ count: 10, tag: { slug: 'literary-fiction' } }],
          },
        },
        {
          count: 10,
          book: {
            id: 3,
            title: 'Broad literary match',
            users_read_count: 1100,
            image: { url: 'literary.jpg' },
            featured_book_series: {
              series: {
                id: 202,
                name: 'Literary Series',
                author: { name: 'Literary Author' },
              },
            },
            taggable_counts: [{ count: 10, tag: { slug: 'literary-fiction' } }],
          },
        },
      ];
    });

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'drama',
        collectionId: 'generated-drama-test',
        hardcoverId: 20,
        resolvedName: 'Drama',
        limit: 3,
        sort: 'popular',
        tagSlug: 'drama',
        tagCategorySlug: 'tag',
        semanticCategory: 'drama',
        tagSources: [
          {
            id: 20,
            slug: 'drama',
            categorySlug: 'tag',
            weight: 1,
            qualifies: true,
          },
          {
            id: 21,
            slug: 'plays',
            categorySlug: 'genre',
            weight: 0.85,
            qualifies: true,
          },
          {
            id: 22,
            slug: 'literary-fiction',
            categorySlug: 'genre',
            weight: 0.25,
            qualifies: false,
          },
        ],
        candidateLimit: 150,
      },
      hardcover: { getBooksByTag },
      logger: { log: vi.fn() },
    });

    expect(getBooksByTag).toHaveBeenCalledTimes(3);
    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Drama Series',
      'Play Series',
    ]);
    expect(result.collection.description).toBe(
      'Popular book series associated with Drama.',
    );
    expect(result.collection.candidateSource.definition).toMatchObject({
      semanticCategory: 'drama',
      tagSources: [
        {
          id: 20,
          slug: 'drama',
          categorySlug: 'tag',
          weight: 1,
          qualifies: true,
        },
        {
          id: 21,
          slug: 'plays',
          categorySlug: 'genre',
          weight: 0.85,
          qualifies: true,
        },
        {
          id: 22,
          slug: 'literary-fiction',
          categorySlug: 'genre',
          weight: 0.25,
          qualifies: false,
        },
      ],
    });
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

  it('suppresses broader umbrella series when specific child series contain the same sampled books', async () => {
    const author = { id: 1, name: 'Example Author' };
    const umbrella = {
      id: 100,
      name: 'Example Universe',
      primary_books_count: 20,
      books_count: 20,
      author,
    };
    const childA = {
      id: 101,
      name: 'Example Saga',
      primary_books_count: 3,
      books_count: 3,
      author,
    };
    const childB = {
      id: 102,
      name: 'Example Chronicles',
      primary_books_count: 4,
      books_count: 4,
      author,
    };
    const memberships = (series) => [
      { series: umbrella },
      { series },
    ];
    const getBooksByTag = vi.fn(async () => [
      {
        count: 10,
        book: {
          id: 1,
          title: 'Universe Lead',
          users_read_count: 10000,
          featured_book_series: { series: umbrella },
          book_series: memberships(childA),
          taggable_counts: [{ count: 10 }],
        },
      },
      {
        count: 10,
        book: {
          id: 2,
          title: 'Saga Two',
          users_read_count: 6000,
          featured_book_series: { series: childA },
          book_series: memberships(childA),
          taggable_counts: [{ count: 10 }],
        },
      },
      {
        count: 10,
        book: {
          id: 3,
          title: 'Chronicles One',
          users_read_count: 5500,
          featured_book_series: { series: childB },
          book_series: memberships(childB),
          taggable_counts: [{ count: 10 }],
        },
      },
      {
        count: 10,
        book: {
          id: 4,
          title: 'Chronicles Two',
          users_read_count: 5000,
          featured_book_series: { series: childB },
          book_series: memberships(childB),
          taggable_counts: [{ count: 10 }],
        },
      },
    ]);

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'Fantasy',
        collectionId: 'generated-overlap-test',
        hardcoverId: 2,
        resolvedName: 'Fantasy',
        limit: 2,
        sort: 'popular',
        tagSlug: 'fantasy',
        tagCategorySlug: 'genre',
        candidateLimit: 150,
      },
      hardcover: { getBooksByTag },
      logger: { log: vi.fn() },
    });

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Example Saga',
      'Example Chronicles',
    ]);
    expect(result.collection.items.some((item) => item.name === 'Example Universe')).toBe(false);
  });

  it('does not rank explicit one-book groupings as book series when a real multi-book series is available', async () => {
    const getBooksByTag = vi.fn(async () => [
      {
        count: 10,
        book: {
          id: 1,
          title: 'Standalone grouping',
          users_read_count: 10000,
          featured_book_series: {
            series: {
              id: 200,
              name: 'Standalone Group',
              primary_books_count: 1,
              books_count: 1,
              author: { id: 2, name: 'Standalone Author' },
            },
          },
          taggable_counts: [{ count: 10 }],
        },
      },
      {
        count: 10,
        book: {
          id: 2,
          title: 'Actual series book',
          users_read_count: 5000,
          featured_book_series: {
            series: {
              id: 201,
              name: 'Actual Series',
              primary_books_count: 2,
              books_count: 2,
              author: { id: 3, name: 'Series Author' },
            },
          },
          taggable_counts: [{ count: 10 }],
        },
      },
    ]);

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'Fantasy',
        collectionId: 'generated-series-quality-test',
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

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Actual Series',
    ]);
  });


  it('drops large series that have only one matching candidate book', async () => {
    const getBooksByTag = vi.fn(async () => [
      {
        count: 10,
        book: {
          id: 1,
          title: 'One matching book',
          users_read_count: 9000,
          featured_book_series: {
            series: {
              id: 300,
              name: 'Loose Large Grouping',
              primary_books_count: 12,
              books_count: 12,
              author: { id: 4, name: 'Example Author' },
            },
          },
          taggable_counts: [{ count: 10 }],
        },
      },
      {
        count: 10,
        book: {
          id: 2,
          title: 'Trilogy opener',
          users_read_count: 4000,
          featured_book_series: {
            series: {
              id: 301,
              name: 'Focused Trilogy',
              primary_books_count: 3,
              books_count: 3,
              author: { id: 5, name: 'Focused Author' },
            },
          },
          taggable_counts: [{ count: 10 }],
        },
      },
    ]);

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'tag-series',
        query: 'Fantasy',
        collectionId: 'generated-weak-series-test',
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

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'Focused Trilogy',
    ]);
  });

});
