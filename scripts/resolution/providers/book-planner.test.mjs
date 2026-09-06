import { describe, expect, it, vi } from 'vitest';

import { findBookPlans } from './book-planner.mjs';

function createHardcover({ tags = [], series = [], authors = [] } = {}) {
  return {
    findTagsBySlugs: vi.fn(async () => tags),
    searchSeries: vi.fn(async () => series),
    searchAuthors: vi.fn(async () => authors),
  };
}

describe('book collection planner', () => {
  it('defaults a book genre to popular series and keeps the default limit setting-ready', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 10,
          tag: 'Fantasy',
          slug: 'fantasy',
          tag_category: { slug: 'genre' },
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'fantasy',
      requestText: 'fantasy books',
    });

    expect(result.plans).toEqual([
      {
        provider: 'hardcover',
        mediaType: 'book',
        mode: 'tag-series',
        query: 'fantasy',
        resolvedId: 10,
        resolvedName: 'Fantasy',
        parameters: {
          limit: 50,
          sort: 'popular',
          tagSlug: 'fantasy',
          tagCategorySlug: 'genre',
          candidateLimit: 150,
        },
      },
    ]);
    expect(hardcover.searchSeries).not.toHaveBeenCalled();
    expect(hardcover.searchAuthors).not.toHaveBeenCalled();
  });

  it('treats the normalized Drama category as tag-series instead of literal series-name ambiguity', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 20,
          tag: 'drama',
          slug: 'drama',
          tag_category: { slug: 'tag' },
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'drama',
      requestText: 'drama books',
    });

    expect(result.plans[0]).toMatchObject({
      mode: 'tag-series',
      resolvedName: 'Drama',
      parameters: {
        tagCategorySlug: 'tag',
      },
    });
    expect(hardcover.searchSeries).not.toHaveBeenCalled();
    expect(hardcover.searchAuthors).not.toHaveBeenCalled();
  });

  it('keeps multiple genuinely plausible Dune series choices instead of silently merging them', async () => {
    const hardcover = createHardcover({
      series: [
        {
          id: 1150,
          name: 'Dune',
          author_name: 'Frank Herbert',
          readers_count: 18214,
        },
        {
          id: 167619,
          name: 'Dune Universe (Chronological)',
          readers_count: 19534,
        },
        {
          id: 168882,
          name: 'Dune Universe (Publication Order)',
          readers_count: 19528,
        },
        {
          id: 1856,
          name: 'Legends of Dune',
          readers_count: 501,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Dune series',
      requestText: 'Dune series books',
    });

    expect(result.plans.map((plan) => plan.resolvedName)).toEqual([
      'Dune',
      'Dune Universe (Chronological)',
      'Dune Universe (Publication Order)',
    ]);
    expect(result.plans.every((plan) => plan.mode === 'series')).toBe(true);
  });

  it('uses an author-qualified series query to select the intended series directly', async () => {
    const hardcover = createHardcover({
      series: [
        {
          id: 1150,
          name: 'Dune',
          author_name: 'Frank Herbert',
          readers_count: 18214,
        },
        {
          id: 167619,
          name: 'Dune Universe (Chronological)',
          readers_count: 19534,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Frank Herbert Dune',
      requestText: 'Frank Herbert Dune books',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'series',
      resolvedId: 1150,
      resolvedName: 'Dune',
    });
  });

  it('lets an explicit main-series clarification choose only the exact base series', async () => {
    const hardcover = createHardcover({
      series: [
        {
          id: 1150,
          name: 'Dune',
          author_name: 'Frank Herbert',
          readers_count: 18214,
        },
        {
          id: 167619,
          name: 'Dune Universe (Chronological)',
          readers_count: 19534,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Dune main series',
      requestText: 'Dune main book series',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'series',
      resolvedId: 1150,
      resolvedName: 'Dune',
    });
  });

  it('drops obviously duplicate exact author records while preserving the dominant entity', async () => {
    const hardcover = createHardcover({
      authors: [
        { id: 154441, name: 'Stephen King', books_count: 606 },
        { id: 1126820, name: 'Stephen King', books_count: 11 },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Stephen King',
      requestText: 'books by Stephen King',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author',
      resolvedId: 154441,
    });
  });

  it('resolves exact authors and preserves explicit popularity counts', async () => {
    const hardcover = createHardcover({
      authors: [
        {
          id: 154441,
          name: 'Stephen King',
          books_count: 606,
          users_count: 17765,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'top 100 Stephen King',
      requestText: 'top 100 Stephen King books',
    });

    expect(result.plans).toEqual([
      expect.objectContaining({
        mode: 'author',
        resolvedId: 154441,
        resolvedName: 'Stephen King',
        parameters: {
          limit: 100,
          sort: 'popular',
        },
      }),
    ]);
  });
});
