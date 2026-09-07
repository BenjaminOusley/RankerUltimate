import { describe, expect, it, vi } from 'vitest';

import {
  buildGenerationRequestFromPlannedSource,
  executeCollectionPlan,
} from './collection-plan-executor.mjs';

const collectionId = 'generated-11111111-2222-4333-8444-555555555555';

function bookSource(overrides = {}) {
  return {
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
    ...overrides,
  };
}

describe('book collection plan execution', () => {
  it('maps a planned Hardcover source into the book generator contract', () => {
    expect(
      buildGenerationRequestFromPlannedSource(bookSource(), collectionId),
    ).toEqual({
      mediaType: 'book',
      mode: 'tag-series',
      query: 'fantasy',
      collectionId,
      hardcoverId: 10,
      resolvedName: 'Fantasy',
      limit: 50,
      sort: 'popular',
      tagSlug: 'fantasy',
      tagCategorySlug: 'genre',
      candidateLimit: 150,
    });
  });

  it('maps an individual genre-book plan into the book generator contract', () => {
    const source = bookSource({ mode: 'tag-books' });

    expect(
      buildGenerationRequestFromPlannedSource(source, collectionId),
    ).toMatchObject({
      mediaType: 'book',
      mode: 'tag-books',
      hardcoverId: 10,
      resolvedName: 'Fantasy',
      tagSlug: 'fantasy',
      tagCategorySlug: 'genre',
    });
  });

  it('maps an author-series plan into the book generator contract', () => {
    const source = bookSource({
      mode: 'author-series',
      query: 'Brandon Sanderson',
      resolvedId: 204214,
      resolvedName: 'Brandon Sanderson',
      parameters: {
        limit: 50,
        sort: 'popular',
      },
    });

    expect(
      buildGenerationRequestFromPlannedSource(source, collectionId),
    ).toMatchObject({
      mediaType: 'book',
      mode: 'author-series',
      hardcoverId: 204214,
      resolvedName: 'Brandon Sanderson',
      limit: 50,
      sort: 'popular',
    });
  });

  it('preserves normalized semantic tag sources in the generation contract', () => {
    const source = bookSource({
      query: 'drama',
      resolvedId: 20,
      resolvedName: 'Drama',
      parameters: {
        limit: 50,
        sort: 'popular',
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
        candidateLimit: 150,
      },
    });

    expect(buildGenerationRequestFromPlannedSource(source, collectionId)).toMatchObject({
      mode: 'tag-series',
      hardcoverId: 20,
      resolvedName: 'Drama',
      semanticCategory: 'drama',
      tagSources: source.parameters.tagSources,
    });
  });

  it('executes a single book plan and preserves the conversational request', async () => {
    const generateBook = vi.fn(async ({ request }) => ({
      collection: {
        id: `${collectionId}-book-series`,
        name: 'Fantasy Book Series',
        candidateSource: {
          kind: 'generated',
          provider: 'hardcover',
          originalRequest: request.query,
          definition: {
            schemaVersion: 1,
            mediaType: 'book',
            mode: request.mode,
          },
        },
        items: [
          {
            id: 'dune-1150',
            name: 'Dune',
            source: {
              provider: 'hardcover',
              type: 'book-series',
              id: '1150',
            },
          },
        ],
      },
      candidateCount: 1,
      validatedCount: 1,
      missingPosterCount: 1,
    }));

    const result = await executeCollectionPlan({
      plannedRequest: {
        status: 'planned',
        requestText: 'fantasy books',
        subject: 'fantasy',
        mediaTypes: ['book'],
        plan: {
          kind: 'single',
          originalRequest: 'fantasy books',
          sources: [bookSource()],
        },
      },
      collectionId,
      hardcover: {},
      generateBook,
    });

    expect(generateBook).toHaveBeenCalledOnce();
    expect(result.collection.name).toBe('Fantasy Book Series');
    expect(result.collection.candidateSource.originalRequest).toBe('fantasy books');
  });
});
