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
