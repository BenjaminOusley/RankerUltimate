import { describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import {
  collectionSupportsDateSort,
  getDefaultCollectionItemDisplaySort,
  sortCollectionItemsForDisplay,
} from './collectionItemDisplaySort';

function collection(
  originalRequest: string | undefined,
  items: RankCollection['items'],
): RankCollection {
  return {
    id: 'test',
    name: 'Test Collection',
    candidateSource: originalRequest
      ? {
          kind: 'generated',
          provider: 'tmdb',
          originalRequest,
          definition: {},
        }
      : { kind: 'embedded' },
    items,
  };
}

describe('collection item display sorting', () => {
  it('defaults ordinary dated collections to newest-first display order', () => {
    expect(
      getDefaultCollectionItemDisplaySort(
        collection('Pixar movies', [
          { id: 'old', name: 'Older Movie', subtitle: '1998' },
          { id: 'new', name: 'Newer Movie', subtitle: '2026' },
        ]),
      ),
    ).toBe('dateDesc');
  });

  it('defaults ordinary collections without dates to alphabetical display order', () => {
    expect(
      getDefaultCollectionItemDisplaySort(
        collection('fruits', [
          { id: 'b', name: 'Banana' },
          { id: 'a', name: 'Apple' },
        ]),
      ),
    ).toBe('nameAsc');
  });

  it('preserves requested source order for explicit ranked collections', () => {
    expect(getDefaultCollectionItemDisplaySort(collection('top 50 games of all time', []))).toBe(
      'source',
    );
  });

  it('sorts names without mutating the source item array', () => {
    const source = [
      { id: '2', name: 'Toy Story 2', subtitle: '1999' },
      { id: '1', name: 'A Bug\'s Life', subtitle: '1998' },
    ];

    const result = sortCollectionItemsForDisplay(source, 'nameAsc');

    expect(result.map((item) => item.name)).toEqual(["A Bug's Life", 'Toy Story 2']);
    expect(source.map((item) => item.name)).toEqual(['Toy Story 2', "A Bug's Life"]);
  });

  it('offers date sorting only when item metadata contains a year', () => {
    expect(
      collectionSupportsDateSort(
        collection(undefined, [
          { id: 'a', name: 'Apple' },
          { id: 'b', name: 'Banana' },
        ]),
      ),
    ).toBe(false);

    expect(
      collectionSupportsDateSort(
        collection(undefined, [
          { id: 'a', name: 'Movie A', subtitle: '2001' },
          { id: 'b', name: 'Movie B', subtitle: '1999' },
        ]),
      ),
    ).toBe(true);
  });
});
