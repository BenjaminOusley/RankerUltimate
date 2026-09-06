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

      return [];
    },
    async searchSeries() {
      return [];
    },
    async searchAuthors(query) {
      return query.toLowerCase() === 'stephen king'
        ? [{ id: 154441, name: 'Stephen King' }]
        : [];
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

  it('keeps bare subjects cross-media ambiguous and includes books in the clarification', () => {
    const result = resolveCollectionRequestTurn({ text: 'Dune' });

    expect(result.ok).toBe(true);
    expect(result.result.status).toBe('clarification');
    expect(result.result.question).toContain('books');
    expect(result.result.examples).toContain('books');
  });

  it('plans fantasy books as popular Fantasy series', async () => {
    const resolution = resolveCollectionRequestTurn({ text: 'fantasy books' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('ready-for-planning');

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover: createFakeHardcover(),
    });

    expect(planned).toMatchObject({
      status: 'planned',
      mediaTypes: ['book'],
      plan: {
        kind: 'single',
        sources: [
          {
            provider: 'hardcover',
            mediaType: 'book',
            mode: 'tag-series',
            resolvedName: 'Fantasy',
            parameters: {
              limit: 50,
              sort: 'popular',
              tagCategorySlug: 'genre',
            },
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
