import { describe, expect, it, vi } from 'vitest';

import { generateBookCollection } from './book-generator.mjs';

function book({
  id,
  title,
  readers,
  canonical = null,
  compilation = false,
  partial = false,
}) {
  return {
    id,
    canonical_id: canonical?.id ?? null,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, ''),
    compilation,
    is_partial_book: partial,
    users_read_count: readers,
    ratings_count: Math.max(0, readers - 100),
    rating: 4,
    canonical,
  };
}

describe('Hardcover primary-series selection regressions', () => {
  it('prefers root books at their real positions over aliases canonicalized to another work', async () => {
    const hobbit = book({
      id: 10,
      title: 'The Hobbit, or There and Back Again',
      readers: 10000,
    });
    const fellowship = book({
      id: 11,
      title: 'The Fellowship of the Ring',
      readers: 8000,
    });
    const twoTowers = book({
      id: 12,
      title: 'The Two Towers',
      readers: 5500,
    });
    const returnOfTheKing = book({
      id: 13,
      title: 'The Return of the King',
      readers: 3700,
    });

    const hardcover = {
      async getSeriesById() {
        return {
          id: 1130,
          name: 'The Lord of the Rings',
          primary_books_count: 3,
          book_series: [
            {
              position: 1,
              book: book({
                id: 101,
                title: 'Misplaced Hobbit edition',
                readers: 1,
                canonical: hobbit,
              }),
            },
            {
              position: 1,
              book: fellowship,
            },
            {
              position: 2,
              book: book({
                id: 102,
                title: 'Misplaced Fellowship edition',
                readers: 1,
                canonical: fellowship,
              }),
            },
            {
              position: 2,
              book: twoTowers,
            },
            {
              position: 3,
              book: returnOfTheKing,
            },
          ],
        };
      },
    };

    const result = await generateBookCollection({
      request: {
        mediaType: 'book',
        mode: 'series',
        query: 'The Lord of the Rings',
        collectionId: 'generated-lord-of-the-rings',
        hardcoverId: 1130,
        resolvedName: 'The Lord of the Rings',
        limit: 50,
        sort: 'series-order',
      },
      hardcover,
      logger: { log: vi.fn() },
    });

    expect(result.collection.items.map((item) => item.name)).toEqual([
      'The Fellowship of the Ring',
      'The Two Towers',
      'The Return of the King',
    ]);
  });
});

it('reloads canonical series memberships when search resolves a series alias', async () => {
  const fellowship = book({
    id: 11,
    title: 'The Fellowship of the Ring',
    readers: 8000,
  });
  const twoTowers = book({
    id: 12,
    title: 'The Two Towers',
    readers: 5500,
  });
  const returnOfTheKing = book({
    id: 13,
    title: 'The Return of the King',
    readers: 3700,
  });

  const getSeriesById = vi.fn(async (id) => {
    if (Number(id) === 9999) {
      return {
        id: 9999,
        canonical_id: 1130,
        name: 'The Lord of the Rings',
        canonical: {
          id: 1130,
          name: 'The Lord of the Rings',
          primary_books_count: 3,
        },
        primary_books_count: 3,
        book_series: [
          {
            position: 1,
            book: fellowship,
          },
          {
            position: 2,
            book: book({
              id: 200,
              title: 'Lord of the Rings Boxed Set',
              readers: 100,
              compilation: true,
            }),
          },
          {
            position: 3,
            book: book({
              id: 201,
              title: 'Le Seigneur des Anneaux 02',
              readers: 10,
            }),
          },
        ],
      };
    }

    if (Number(id) === 1130) {
      return {
        id: 1130,
        name: 'The Lord of the Rings',
        primary_books_count: 3,
        book_series: [
          { position: 1, book: fellowship },
          { position: 2, book: twoTowers },
          { position: 3, book: returnOfTheKing },
        ],
      };
    }

    return null;
  });

  const result = await generateBookCollection({
    request: {
      mediaType: 'book',
      mode: 'series',
      query: 'The Lord of the Rings',
      collectionId: 'generated-lord-of-the-rings-alias',
      hardcoverId: 9999,
      resolvedName: 'The Lord of the Rings',
      limit: 50,
      sort: 'series-order',
    },
    hardcover: { getSeriesById },
    logger: { log: vi.fn() },
  });

  expect(getSeriesById).toHaveBeenNthCalledWith(1, 9999);
  expect(getSeriesById).toHaveBeenNthCalledWith(2, 1130);
  expect(result.collection.items.map((item) => item.name)).toEqual([
    'The Fellowship of the Ring',
    'The Two Towers',
    'The Return of the King',
  ]);
});

it('selects exact primary LOTR works when detailed memberships and search metadata disagree', async () => {
  const fellowship = book({
    id: 139773,
    title: 'The Fellowship of the Ring',
    readers: 7065,
  });
  const twoTowers = book({
    id: 379631,
    title: 'The Two Towers',
    readers: 4920,
  });
  const returnOfTheKing = book({
    id: 374541,
    title: 'The Return of the King',
    readers: 3333,
  });

  const hardcover = {
    async searchSeries() {
      return [
        {
          id: 1130,
          name: 'The Lord of the Rings',
          primary_books_count: 3,
        },
      ];
    },
    async getSeriesById() {
      return {
        id: 1130,
        name: 'The Lord of the Rings',
        // Hardcover's detailed relationship data can temporarily disagree with
        // search metadata. The exact Series search is the conservative cap.
        primary_books_count: 4,
        book_series: [
          {
            position: 1,
            featured: true,
            compilation: false,
            details: '1',
            book: fellowship,
          },
          {
            position: 1,
            featured: true,
            compilation: false,
            details: '1',
            book: book({
              id: 2774445,
              title: 'Der Hobbit: Der Herr der Ringe 0.5',
              readers: 5,
              canonical: book({
                id: 2459845,
                title: 'The Hobbit, or There and Back Again',
                readers: 9256,
              }),
            }),
          },
          {
            position: 2,
            featured: true,
            compilation: false,
            details: '2',
            book: twoTowers,
          },
          {
            position: 2,
            featured: false,
            compilation: false,
            details: '2',
            book: book({
              id: 2388918,
              title: 'The Two Towers edition',
              readers: 0,
              canonical: twoTowers,
            }),
          },
          {
            position: 2,
            featured: true,
            compilation: false,
            details: '2-4',
            book: book({
              id: 2648241,
              title: 'Lord of the Rings Boxed Set',
              readers: 0,
            }),
          },
          {
            position: 2,
            featured: true,
            compilation: false,
            details: '2',
            book: book({
              id: 2865588,
              title: 'Die Kameraadskap Van Die Ring',
              readers: 0,
            }),
          },
          {
            position: 3,
            featured: true,
            compilation: false,
            details: '3',
            book: returnOfTheKing,
          },
          {
            position: 3,
            featured: true,
            compilation: false,
            details: '3',
            book: book({
              id: 2197369,
              title: 'The Return of the King edition',
              readers: 0,
              canonical: returnOfTheKing,
            }),
          },
          {
            position: 3,
            featured: true,
            compilation: false,
            details: '3',
            book: book({
              id: 2663360,
              title: 'Le Seigneur des Anneaux 02. Les deux tours',
              readers: 2,
            }),
          },
          {
            position: 4,
            featured: true,
            compilation: false,
            details: '4',
            book: book({
              id: 2953485,
              title: 'Appendices And In',
              readers: 1,
            }),
          },
        ],
      };
    },
  };

  const result = await generateBookCollection({
    request: {
      mediaType: 'book',
      mode: 'series',
      query: 'The Lord of the Rings',
      collectionId: 'generated-lord-of-the-rings-realistic-noise',
      hardcoverId: 1130,
      resolvedName: 'The Lord of the Rings',
      limit: 50,
      sort: 'series-order',
    },
    hardcover,
    logger: { log: vi.fn() },
  });

  expect(result.collection.items.map((item) => item.name)).toEqual([
    'The Fellowship of the Ring',
    'The Two Towers',
    'The Return of the King',
  ]);
});
