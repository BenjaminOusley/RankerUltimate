import { describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import {
  applyCollectionSourceSnapshots,
  createCollectionSourceSnapshot,
  getGeneratedSourceFingerprint,
} from './collectionSourceSnapshots';

const generatedCollection: RankCollection = {
  id: 'pixar-features-movies',
  name: 'Pixar Feature Films',
  candidateSource: {
    kind: 'generated',
    provider: 'tmdb',
    originalRequest: 'Pixar Animation Studios',
    definition: {
      schemaVersion: 1,
      mode: 'company-features',
      tmdbId: 3,
      mediaTypes: ['movie'],
    },
  },
  items: [{ id: 'toy-story', name: 'Toy Story' }],
};

describe('collection source snapshots', () => {
  it('uses a refreshed candidate pool when the source definition still matches', () => {
    const refreshedCollection: RankCollection = {
      ...generatedCollection,
      items: [
        ...generatedCollection.items,
        { id: 'new-pixar', name: 'New Pixar Movie' },
      ],
    };

    const snapshot = createCollectionSourceSnapshot(
      generatedCollection,
      refreshedCollection,
      '2026-08-25T08:00:00.000Z',
    );

    const [resolved] = applyCollectionSourceSnapshots([generatedCollection], [snapshot]);

    expect(resolved.items.map((item) => item.name)).toEqual([
      'Toy Story',
      'New Pixar Movie',
    ]);
  });

  it('ignores an old snapshot after the normalized source definition changes', () => {
    const snapshot = createCollectionSourceSnapshot(
      generatedCollection,
      {
        ...generatedCollection,
        items: [{ id: 'old-result', name: 'Old Result' }],
      },
      '2026-08-25T08:00:00.000Z',
    );

    const changedCollection: RankCollection = {
      ...generatedCollection,
      candidateSource: {
        kind: 'generated',
        provider: 'tmdb',
        originalRequest: 'Pixar Animation Studios',
        definition: {
          schemaVersion: 1,
          mode: 'company-features',
          tmdbId: 3,
          mediaTypes: ['movie'],
          fromYear: 2000,
        },
      },
    };

    const [resolved] = applyCollectionSourceSnapshots([changedCollection], [snapshot]);

    expect(resolved.items).toEqual(generatedCollection.items);
  });

  it('fingerprints semantic source data independently of object key order or prompt wording', () => {
    const first = {
      kind: 'generated' as const,
      provider: 'tmdb',
      originalRequest: 'Pixar',
      definition: {
        mode: 'company-features',
        tmdbId: 3,
      },
    };

    const second = {
      kind: 'generated' as const,
      provider: 'tmdb',
      originalRequest: 'Pixar Animation Studios',
      definition: {
        tmdbId: 3,
        mode: 'company-features',
      },
    };

    expect(getGeneratedSourceFingerprint(first)).toBe(getGeneratedSourceFingerprint(second));
  });
});
