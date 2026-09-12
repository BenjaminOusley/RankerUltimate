import { describe, expect, it } from 'vitest';

import { planCollectionRequest } from './collection-request-planner.mjs';
import { resolveCollectionRequestTurn } from './collection-request-resolver.mjs';

function createFakeHardcover() {
  return {
    async findTagsBySlugs(slugs) {
      if (slugs.includes('fantasy')) {
        return [
          {
            id: 10,
            tag: 'Fantasy',
            slug: 'fantasy',
            tag_category: { slug: 'genre' },
          },
        ];
      }

      if (slugs.includes('stephen-king')) {
        return [
          {
            id: 999,
            tag: 'Stephen King',
            slug: 'stephen-king',
            tag_category: { slug: 'tag' },
          },
        ];
      }

      return [];
    },
    async searchSeries(query) {
      return query.toLowerCase() === 'stephen king'
        ? [{ id: 7000, name: 'Stephen King', readers_count: 500 }]
        : [];
    },
    async searchAuthors(query) {
      return query.toLowerCase() === 'stephen king' ? [{ id: 154441, name: 'Stephen King' }] : [];
    },
  };
}

describe('conversational book collection requests', () => {
  it('detects books as their own media domain', () => {
    const result = resolveCollectionRequestTurn({ text: 'Stephen King books' });

    expect(result).toEqual({
      ok: true,
      result: {
        status: 'ready-for-planning',
        requestText: 'Stephen King books',
        subject: 'Stephen King',
        mediaTypes: ['book'],
        context: {
          subject: 'Stephen King',
          mediaTypes: ['book'],
        },
      },
    });
  });

  it('prefers the exact author for "Stephen King books" even when Hardcover has a same-name generic tag', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Stephen King books' });
    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'author',
            resolvedId: 154441,
            resolvedName: 'Stephen King',
          },
        ],
      },
    });
  });

  it('keeps bare subjects cross-media ambiguous and includes books in the clarification', () => {
    const result = resolveCollectionRequestTurn({ text: 'Dune' });

    expect(result.ok).toBe(true);
    expect(result.result.status).toBe('clarification');
    expect(result.result.question).toContain('books');
    expect(result.result.examples).toContain('books');
  });

  it('clarifies whether a broad book genre means individual books or series', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'fantasy books' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'clarification',
      reason: 'ambiguous-entity',
      question: 'Do you want individual Fantasy books, or Fantasy book series?',
      examples: ['Fantasy individual books', 'Fantasy book series'],
      context: {
        subject: 'fantasy',
        mediaTypes: ['book'],
      },
    });
  });

  it('plans an explicit individual-book genre request', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Fantasy individual books' });

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        kind: 'single',
        sources: [
          {
            provider: 'hardcover',
            mediaType: 'book',
            mode: 'tag-books',
            resolvedName: 'Fantasy',
          },
        ],
      },
    });
  });

  it('plans an explicit genre-series request', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Fantasy book series' });

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'tag-series',
            resolvedName: 'Fantasy',
          },
        ],
      },
    });
  });

  it('clarifies what Drama means instead of synthesizing a fake genre', async () => {
    const hardcover = createFakeHardcover();
    hardcover.findTagsBySlugs = async (slugs) => {
      if (slugs.includes('literary-fiction')) {
        return [
          {
            id: 899,
            tag: 'Literary Fiction',
            slug: 'literary-fiction',
            tag_category: { slug: 'genre' },
          },
          {
            id: 7346,
            tag: 'Contemporary Fiction',
            slug: 'contemporary-fiction',
            tag_category: { slug: 'genre' },
          },
          {
            id: 2302,
            tag: 'Plays',
            slug: 'plays',
            tag_category: { slug: 'genre' },
          },
        ];
      }

      return [];
    };

    const resolution = resolveCollectionRequestTurn({ text: 'drama books' });
    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover,
    });

    expect(planned).toMatchObject({
      status: 'clarification',
      question: '"Drama" is not a single standard Hardcover book genre. Which meaning do you want?',
      examples: ['Literary Fiction books', 'Contemporary Fiction books', 'Plays books'],
    });
  });

  it('plans Stephen King author-series directly instead of looping against a same-name Series entity', async () => {
    const resolution = resolveCollectionRequestTurn({
      text: 'Stephen King book series',
    });

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'author-series',
            resolvedId: 154441,
            resolvedName: 'Stephen King',
          },
        ],
      },
    });
  });

  it('plans book series by an author when the user asks for author series', async () => {
    const hardcover = createFakeHardcover();
    hardcover.searchAuthors = async (query) =>
      query.toLowerCase() === 'brandon sanderson'
        ? [{ id: 204214, name: 'Brandon Sanderson', books_count: 268 }]
        : [];

    const resolution = resolveCollectionRequestTurn({
      text: 'Brandon Sanderson book series',
    });

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover,
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'author-series',
            resolvedId: 204214,
            resolvedName: 'Brandon Sanderson',
          },
        ],
      },
    });
  });

  it('plans books by an exact author', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'books by Stephen King' });

    expect(resolution.ok).toBe(true);

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'author',
            resolvedId: 154441,
            resolvedName: 'Stephen King',
          },
        ],
      },
    });
  });

  it('offers a disambiguating author-qualified choice for an ambiguous series', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Dune series books' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const hardcover = {
      async findTagsBySlugs() {
        return [];
      },
      async searchSeries() {
        return [
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
        ];
      },
      async searchAuthors() {
        return [];
      },
    };

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover,
    });

    expect(planned.status).toBe('clarification');
    expect(planned.examples).toContain('Dune main book series');
    expect(planned.examples).toContain('Dune Universe (Chronological) book series');
  });

  it('accepts the main-series clarification chip without looping back into ambiguity', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Dune main book series' });

    const hardcover = {
      async findTagsBySlugs() {
        return [];
      },
      async searchSeries() {
        return [
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
        ];
      },
      async searchAuthors() {
        return [];
      },
    };

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover,
    });

    expect(planned).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'hardcover',
            mode: 'series',
            resolvedId: 1150,
            resolvedName: 'Dune',
          },
        ],
      },
    });
  });
});
