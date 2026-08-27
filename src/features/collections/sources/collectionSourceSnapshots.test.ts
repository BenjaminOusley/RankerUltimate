import { describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import {
  applyCollectionSourceSnapshots,
  createCollectionSourceSnapshot,
  getCollectionSourceFingerprint,
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


  it('loads single-source snapshots created before composite source support', () => {
    const legacySnapshot = {
      version: 1 as const,
      collectionId: generatedCollection.id,
      sourceFingerprint:
        '{"definition":{"mediaTypes":["movie"],"mode":"company-features","schemaVersion":1,"tmdbId":3},"provider":"tmdb"}',
      refreshedAt: '2026-08-26T08:00:00.000Z',
      items: [
        { id: 'toy-story', name: 'Toy Story' },
        { id: 'legacy-candidate', name: 'Legacy Candidate' },
      ],
    };

    const [resolved] = applyCollectionSourceSnapshots(
      [generatedCollection],
      [legacySnapshot],
    );

    expect(resolved.items.map((item) => item.name)).toEqual([
      'Toy Story',
      'Legacy Candidate',
    ]);
  });

  it('supports composite source snapshots and ignores child source ordering', () => {
    const movieSource = {
      kind: 'generated' as const,
      provider: 'tmdb',
      definition: {
        mediaType: 'movie',
        mode: 'genre',
        tmdbId: 878,
      },
    };
    const gameSource = {
      kind: 'generated' as const,
      provider: 'igdb',
      definition: {
        mediaType: 'game',
        mode: 'genre',
        igdbId: 5,
      },
    };

    const first = {
      kind: 'composite' as const,
      originalRequest: 'science fiction movies and games',
      sources: [movieSource, gameSource],
    };
    const second = {
      kind: 'composite' as const,
      originalRequest: 'sci-fi games plus movies',
      sources: [gameSource, movieSource],
    };

    expect(getCollectionSourceFingerprint(first)).toBe(
      getCollectionSourceFingerprint(second),
    );

    const collection: RankCollection = {
      id: 'science-fiction-media',
      name: 'Science Fiction Movies and Games',
      candidateSource: first,
      items: [],
    };
    const refreshed: RankCollection = {
      ...collection,
      items: [
        {
          id: 'dune',
          name: 'Dune',
          source: { provider: 'tmdb', type: 'movie', id: '438631' },
        },
        {
          id: 'mass-effect',
          name: 'Mass Effect',
          source: { provider: 'igdb', type: 'game', id: '73' },
        },
      ],
    };

    const snapshot = createCollectionSourceSnapshot(collection, refreshed);
    const [resolved] = applyCollectionSourceSnapshots(
      [{ ...collection, candidateSource: second }],
      [snapshot],
    );

    expect(resolved.items.map((item) => item.name)).toEqual(['Dune', 'Mass Effect']);
  });

});
