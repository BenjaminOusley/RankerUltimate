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
  it('offers individual books and book series for a broad book genre', async () => {
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
      expect.objectContaining({
        mode: 'tag-books',
        resolvedId: 10,
        resolvedName: 'Fantasy',
        parameters: expect.objectContaining({ limit: 50, sort: 'popular' }),
      }),
      expect.objectContaining({
        mode: 'tag-series',
        resolvedId: 10,
        resolvedName: 'Fantasy',
        parameters: expect.objectContaining({ limit: 50, sort: 'popular' }),
      }),
    ]);
    /*
     * Named Series are checked as a collision guard before trusting an inferred
     * Hardcover tag. "Fantasy" still resolves to the genre because no matching
     * first-class Series outranks it.
     */
    expect(hardcover.searchSeries).toHaveBeenCalledWith('fantasy', 15);
    expect(hardcover.searchAuthors).not.toHaveBeenCalled();
  });

  it('lets an explicit individual-book clarification choose genre Works directly', async () => {
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
      subject: 'Fantasy individual',
      requestText: 'Fantasy individual books',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'tag-books',
      resolvedId: 10,
      resolvedName: 'Fantasy',
    });
  });

  it('lets an explicit book-series clarification choose genre series directly', async () => {
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
      subject: 'Fantasy series',
      requestText: 'Fantasy book series',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'tag-series',
      resolvedId: 10,
      resolvedName: 'Fantasy',
    });
  });

  it('clarifies Drama instead of inventing a synthetic book genre', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 22,
          tag: 'Literary Fiction',
          slug: 'literary-fiction',
          tag_category: { slug: 'genre' },
        },
        {
          id: 23,
          tag: 'Contemporary Fiction',
          slug: 'contemporary-fiction',
          tag_category: { slug: 'genre' },
        },
        {
          id: 21,
          tag: 'Plays',
          slug: 'plays',
          tag_category: { slug: 'genre' },
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'drama',
      requestText: 'drama books',
    });

    expect(result.plans).toEqual([]);
    expect(result.clarification).toEqual({
      status: 'clarification',
      reason: 'ambiguous-entity',
      question: '"Drama" is not a single standard Hardcover book genre. Which meaning do you want?',
      examples: ['Literary Fiction books', 'Contemporary Fiction books', 'Plays books'],
      matches: [],
    });
    expect(hardcover.findTagsBySlugs).toHaveBeenCalledWith([
      'literary-fiction',
      'contemporary-fiction',
      'plays',
    ]);
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

  it('plans book series by an exact author when series intent is explicit', async () => {
    const hardcover = createHardcover({
      authors: [
        {
          id: 204214,
          name: 'Brandon Sanderson',
          books_count: 268,
          users_count: 10000,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Brandon Sanderson series',
      requestText: 'Brandon Sanderson book series',
    });

    expect(result.plans).toEqual([
      expect.objectContaining({
        mode: 'author-series',
        resolvedId: 204214,
        resolvedName: 'Brandon Sanderson',
        parameters: {
          limit: 50,
          sort: 'popular',
        },
      }),
    ]);
  });

  it('understands "book series by" author phrasing', async () => {
    const hardcover = createHardcover({
      authors: [{ id: 154441, name: 'Stephen King', books_count: 606 }],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'series by Stephen King',
      requestText: 'book series by Stephen King',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author-series',
      resolvedId: 154441,
      resolvedName: 'Stephen King',
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
  it('prefers an exact author over a same-name Series entity for a plain books request', async () => {
    const hardcover = createHardcover({
      series: [{ id: 7000, name: 'Stephen King', readers_count: 500 }],
      authors: [{ id: 154441, name: 'Stephen King', books_count: 606 }],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Stephen King',
      requestText: 'Stephen King books',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author',
      resolvedId: 154441,
      resolvedName: 'Stephen King',
    });
    /*
     * The Series lookup is intentional here: the planner sees the competing
     * first-class Series entity but still gives the exact Author the correct
     * precedence for a plain books request.
     */
    expect(hardcover.searchSeries).toHaveBeenCalledWith('Stephen King', 15);
  });

  it('prefers author-series intent over a same-name Series entity when the phrase names an author', async () => {
    const hardcover = createHardcover({
      series: [{ id: 7000, name: 'Stephen King', readers_count: 500 }],
      authors: [{ id: 154441, name: 'Stephen King', books_count: 606 }],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Stephen King series',
      requestText: 'Stephen King book series',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author-series',
      resolvedId: 154441,
      resolvedName: 'Stephen King',
    });
    expect(hardcover.searchSeries).not.toHaveBeenCalled();
  });

  it('prefers an exact author over a same-name generic Hardcover tag', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 999,
          tag: 'Stephen King',
          slug: 'stephen-king',
          tag_category: { slug: 'tag' },
        },
      ],
      authors: [{ id: 154441, name: 'Stephen King', books_count: 606 }],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Stephen King',
      requestText: 'Stephen King books',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author',
      resolvedId: 154441,
      resolvedName: 'Stephen King',
    });
  });

  it('prefers author-series intent over a same-name generic Hardcover tag', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 998,
          tag: 'Brandon Sanderson',
          slug: 'brandon-sanderson',
          tag_category: { slug: 'tag' },
        },
      ],
      authors: [{ id: 204214, name: 'Brandon Sanderson', books_count: 268 }],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Brandon Sanderson series',
      requestText: 'Brandon Sanderson book series',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author-series',
      resolvedId: 204214,
      resolvedName: 'Brandon Sanderson',
    });
  });

  it('prefers an exact author over a same-name genre tag after an individual-book clarification', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 44245,
          tag: 'Brandon Sanderson',
          slug: 'brandon-sanderson',
          tag_category: { slug: 'genre' },
        },
      ],
      authors: [
        {
          id: 204214,
          name: 'Brandon Sanderson',
          books_count: 254,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'top 20 Brandon Sanderson individual',
      requestText: 'top 20 Brandon Sanderson individual books',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author',
      resolvedId: 204214,
      resolvedName: 'Brandon Sanderson',
      parameters: {
        limit: 20,
        sort: 'popular',
      },
    });

    expect(hardcover.searchAuthors).toHaveBeenCalledWith('Brandon Sanderson', 15);
    expect(hardcover.findTagsBySlugs).not.toHaveBeenCalled();
  });

  it('prefers author-series intent over a same-name genre tag', async () => {
    const hardcover = createHardcover({
      tags: [
        {
          id: 44245,
          tag: 'Brandon Sanderson',
          slug: 'brandon-sanderson',
          tag_category: { slug: 'genre' },
        },
      ],
      authors: [
        {
          id: 204214,
          name: 'Brandon Sanderson',
          books_count: 254,
        },
      ],
    });

    const result = await findBookPlans({
      hardcover,
      subject: 'Brandon Sanderson series',
      requestText: 'Brandon Sanderson book series',
    });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]).toMatchObject({
      mode: 'author-series',
      resolvedId: 204214,
      resolvedName: 'Brandon Sanderson',
      parameters: {
        limit: 50,
        sort: 'popular',
      },
    });

    expect(hardcover.searchAuthors).toHaveBeenCalledWith('Brandon Sanderson', 15);
    expect(hardcover.findTagsBySlugs).not.toHaveBeenCalled();
  });
});
