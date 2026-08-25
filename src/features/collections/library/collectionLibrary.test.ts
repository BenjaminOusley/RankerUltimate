import { beforeEach, describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import {
  buildCollectionCandidateItems,
  getCollectionLibraryItemKey,
  loadCollectionLibraryState,
  materializeCollections,
  saveCollectionLibraryState,
  updateCollectionInLibrary,
} from './collectionLibrary';

const baseCollections: RankCollection[] = [
  {
    id: 'mcu-movies',
    name: 'MCU Movies',
    candidateSource: {
      kind: 'embedded',
      provider: 'tmdb',
    },
    items: [
      {
        id: 'iron-man-1726',
        name: 'Iron Man',
        source: { provider: 'tmdb', type: 'movie', id: '1726' },
      },
      {
        id: 'thor-10195',
        name: 'Thor',
        source: { provider: 'tmdb', type: 'movie', id: '10195' },
      },
    ],
  },
  {
    id: 'games',
    name: 'Games',
    items: [{ id: 'hades', name: 'Hades' }],
  },
];

function installLocalStorage() {
  const values = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
    },
  });

  return values;
}

describe('collection candidate pools', () => {
  it('restricts built-in collection candidates to that collection', () => {
    const candidates = buildCollectionCandidateItems(baseCollections, 'mcu-movies');

    expect(candidates.map((item) => item.name)).toEqual(['Iron Man', 'Thor']);
    expect(candidates.some((item) => item.name === 'Hades')).toBe(false);
  });

  it('uses the global catalog for custom collections', () => {
    const candidates = buildCollectionCandidateItems(baseCollections, 'custom:anything');

    expect(candidates.map((item) => item.name)).toEqual(['Hades', 'Iron Man', 'Thor']);
  });
});

describe('built-in collection exclusions', () => {
  it('stores removals as exclusions instead of freezing the entire item list', () => {
    const emptyState = {
      version: 2 as const,
      customCollections: [],
      overrides: {},
      deletedBuiltInIds: [],
    };

    const updatedCollection: RankCollection = {
      ...baseCollections[0],
      items: [baseCollections[0].items[0]],
    };

    const nextState = updateCollectionInLibrary(
      emptyState,
      baseCollections,
      updatedCollection,
      true,
    );

    expect(nextState.overrides['mcu-movies']?.excludedItemKeys).toEqual([
      getCollectionLibraryItemKey(baseCollections[0].items[1]),
    ]);
  });

  it('automatically includes a newly generated candidate while preserving exclusions', () => {
    const state = {
      version: 2 as const,
      customCollections: [],
      overrides: {
        'mcu-movies': {
          excludedItemKeys: [getCollectionLibraryItemKey(baseCollections[0].items[1])],
        },
      },
      deletedBuiltInIds: [],
    };

    const refreshedCollections: RankCollection[] = [
      {
        ...baseCollections[0],
        items: [
          ...baseCollections[0].items,
          {
            id: 'new-mcu-999',
            name: 'New MCU Movie',
            source: { provider: 'tmdb', type: 'movie', id: '999' },
          },
        ],
      },
      baseCollections[1],
    ];

    const materialized = materializeCollections(refreshedCollections, state);
    const mcu = materialized.find((collection) => collection.id === 'mcu-movies');

    expect(mcu?.items.map((item) => item.name)).toEqual(['Iron Man', 'New MCU Movie']);
  });
});

describe('collection storage migration', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('migrates v1 selected-item overrides into v2 exclusions and canonical keys', () => {
    localStorage.setItem(
      'rankerultimate:collections:v1',
      JSON.stringify({
        version: 1,
        customCollections: [],
        overrides: {
          'mcu-movies': {
            itemKeys: ['[object Object]:iron-man-1726'],
          },
        },
        deletedBuiltInIds: [],
      }),
    );

    const migrated = loadCollectionLibraryState(baseCollections);

    expect(migrated.version).toBe(2);
    expect(migrated.overrides['mcu-movies']?.excludedItemKeys).toEqual([
      'tmdb:movie:10195',
    ]);

    saveCollectionLibraryState(migrated);

    expect(localStorage.getItem('rankerultimate:collections:v1')).toBeNull();
    expect(localStorage.getItem('rankerultimate:collections:v2')).not.toBeNull();
  });
});
