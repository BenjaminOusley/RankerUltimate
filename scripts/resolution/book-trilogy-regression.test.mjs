import { describe, expect, it, vi } from 'vitest';

import { findBookPlans } from './providers/book-planner.mjs';

describe('book trilogy natural-language regression', () => {
  it('treats trilogy as explicit book-series language and resolves the exact series', async () => {
    const searchAuthors = vi.fn(async () => []);
    const findTagsBySlugs = vi.fn(async () => []);
    const searchSeries = vi.fn(async (query) => {
      expect(query).toBe('the lord of the rings');

      return [
        {
          id: 1130,
          name: 'The Lord of the Rings',
          author_name: 'J.R.R. Tolkien',
          readers_count: 20000,
          books_count: 5,
          primary_books_count: 3,
        },
      ];
    });

    const result = await findBookPlans({
      hardcover: {
        searchAuthors,
        findTagsBySlugs,
        searchSeries,
      },
      subject: 'the lord of the rings trilogy',
      requestText: 'the lord of the rings trilogy books',
    });

    expect(result).toMatchObject({
      query: 'the lord of the rings',
      relationHint: 'series',
      unsupportedLimit: false,
      plans: [
        {
          provider: 'hardcover',
          mediaType: 'book',
          mode: 'series',
          query: 'the lord of the rings',
          resolvedId: 1130,
          resolvedName: 'The Lord of the Rings',
          resolvedAuthorName: 'J.R.R. Tolkien',
          parameters: {
            sort: 'series-order',
          },
        },
      ],
    });

    expect(searchSeries).toHaveBeenCalledOnce();
  });
});

it('prefers an exact named series over a same-name Hardcover genre tag', async () => {
  const hardcover = {
    searchAuthors: vi.fn(async () => []),
    findTagsBySlugs: vi.fn(async () => [
      {
        id: 9000,
        tag: 'Lord of the Rings',
        slug: 'lord-of-the-rings',
        tag_category: { slug: 'genre' },
      },
    ]),
    searchSeries: vi.fn(async () => [
      {
        id: 1130,
        name: 'The Lord of the Rings',
        author_name: 'J.R.R. Tolkien',
        readers_count: 20000,
        primary_books_count: 3,
      },
    ]),
  };

  const result = await findBookPlans({
    hardcover,
    subject: 'lord of the rings series',
    requestText: 'lord of the rings book series',
  });

  expect(result.plans).toHaveLength(1);
  expect(result.plans[0]).toMatchObject({
    mode: 'series',
    resolvedId: 1130,
    resolvedName: 'The Lord of the Rings',
  });
  expect(result.plans.some((plan) => plan.mode === 'tag-series')).toBe(false);
});

it('treats individual books from an exact named series as that series members', async () => {
  const hardcover = {
    searchAuthors: vi.fn(async () => []),
    findTagsBySlugs: vi.fn(async () => [
      {
        id: 9000,
        tag: 'Lord of the Rings',
        slug: 'lord-of-the-rings',
        tag_category: { slug: 'genre' },
      },
    ]),
    searchSeries: vi.fn(async () => [
      {
        id: 1130,
        name: 'The Lord of the Rings',
        author_name: 'J.R.R. Tolkien',
        readers_count: 20000,
        primary_books_count: 3,
      },
    ]),
  };

  const result = await findBookPlans({
    hardcover,
    subject: 'lord of the rings individual',
    requestText: 'lord of the rings individual books',
  });

  expect(result.plans).toHaveLength(1);
  expect(result.plans[0]).toMatchObject({
    mode: 'series',
    resolvedId: 1130,
    resolvedName: 'The Lord of the Rings',
  });
  expect(result.plans.some((plan) => plan.mode === 'tag-books')).toBe(false);
});
