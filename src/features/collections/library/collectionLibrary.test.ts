import { beforeEach, describe, expect, it } from 'vitest';

import type { RankCollection } from '@/domain/models';
import {
  addGeneratedCollectionToLibrary,
  buildCollectionCandidateItems,
  buildStoredGeneratedCollectionShells,
  deleteCollectionFromLibrary,
  getCollectionLibraryItemKey,
  loadCollectionLibraryState,
  materializeCollections,
  saveCollectionLibraryState,
  updateCollectionInLibrary,
  type CollectionLibraryState,
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

const generatedCollection: RankCollection = {
  id: 'nolan-movies',
  name: 'Christopher Nolan Movies',
  description: 'Movies directed by Christopher Nolan.',
  candidateSource: {
    kind: 'generated',
    provider: 'tmdb',
    originalRequest: 'Christopher Nolan movies',
    definition: {
      schemaVersion: 1,
      collectionId: 'nolan',
      mode: 'director',
      query: 'Christopher Nolan',
      tmdbId: 525,
      mediaTypes: ['movie'],
      limit: 250,
      fromYear: null,
      toYear: null,
      sort: 'release-asc',
      minRuntime: null,
      excludeDocumentaries: false,
      includeAdult: false,
      language: 'en-US',
    },
  },
  items: [
    {
      id: 'inception-27205',
      name: 'Inception',
      source: { provider: 'tmdb', type: 'movie', id: '27205' },
    },
    {
      id: 'interstellar-157336',
      name: 'Interstellar',
      source: { provider: 'tmdb', type: 'movie', id: '157336' },
    },
  ],
};

function emptyState(): CollectionLibraryState {
  return {
    version: 3,
    customCollections: [],
    generatedCollections: [],
    overrides: {},
    deletedBuiltInIds: [],
  };
}

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
  it('restricts source-backed collection candidates to that collection', () => {
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
    const updatedCollection: RankCollection = {
      ...baseCollections[0],
      items: [baseCollections[0].items[0]],
    };

    const nextState = updateCollectionInLibrary(
      emptyState(),
      baseCollections,
      updatedCollection,
      true,
    );

    expect(nextState.overrides['mcu-movies']?.excludedItemKeys).toEqual([
      getCollectionLibraryItemKey(baseCollections[0].items[1]),
    ]);
  });

  it('automatically includes a newly generated candidate while preserving exclusions', () => {
    const state: CollectionLibraryState = {
      ...emptyState(),
      overrides: {
        'mcu-movies': {
          excludedItemKeys: [getCollectionLibraryItemKey(baseCollections[0].items[1])],
        },
      },
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

describe('runtime generated collections', () => {
  it('stores source metadata separately from the candidate item snapshot', () => {
    const state = addGeneratedCollectionToLibrary(
      emptyState(),
      baseCollections,
      generatedCollection,
    );

    expect(state.generatedCollections).toEqual([
      {
        id: 'nolan-movies',
        name: 'Christopher Nolan Movies',
        description: 'Movies directed by Christopher Nolan.',
        candidateSource: generatedCollection.candidateSource,
        excludedItemKeys: [],
      },
    ]);

    const [shell] = buildStoredGeneratedCollectionShells(state);

    expect(shell.items).toEqual([]);
    expect(shell.candidateSource).toEqual(generatedCollection.candidateSource);
  });

  it('materializes a runtime generated collection from its source candidates', () => {
    const state = addGeneratedCollectionToLibrary(
      emptyState(),
      baseCollections,
      generatedCollection,
    );

    const sourceCollections = [...baseCollections, generatedCollection];
    const materialized = materializeCollections(sourceCollections, state);
    const nolan = materialized.find((collection) => collection.id === 'nolan-movies');

    expect(nolan?.items.map((item) => item.name)).toEqual(['Inception', 'Interstellar']);
  });

  it('preserves exclusions when a runtime generated source gains new candidates', () => {
    let state = addGeneratedCollectionToLibrary(
      emptyState(),
      baseCollections,
      generatedCollection,
    );

    state = updateCollectionInLibrary(
      state,
      [...baseCollections, generatedCollection],
      {
        ...generatedCollection,
        items: [generatedCollection.items[0]],
      },
      true,
    );

    const refreshedGeneratedCollection: RankCollection = {
      ...generatedCollection,
      items: [
        ...generatedCollection.items,
        {
          id: 'oppenheimer-872585',
          name: 'Oppenheimer',
          source: { provider: 'tmdb', type: 'movie', id: '872585' },
        },
      ],
    };

    const materialized = materializeCollections(
      [...baseCollections, refreshedGeneratedCollection],
      state,
    );
    const nolan = materialized.find((collection) => collection.id === 'nolan-movies');

    expect(nolan?.items.map((item) => item.name)).toEqual(['Inception', 'Oppenheimer']);
  });

  it('deletes runtime generated metadata instead of treating it as a deleted built-in', () => {
    const state = addGeneratedCollectionToLibrary(
      emptyState(),
      baseCollections,
      generatedCollection,
    );

    const nextState = deleteCollectionFromLibrary(
      state,
      [...baseCollections, generatedCollection],
      generatedCollection.id,
    );

    expect(nextState.generatedCollections).toEqual([]);
    expect(nextState.deletedBuiltInIds).toEqual([]);
  });
});

describe('collection storage migration', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('migrates v1 selected-item overrides into v3 exclusions and canonical keys', () => {
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

    expect(migrated.version).toBe(3);
    expect(migrated.generatedCollections).toEqual([]);
    expect(migrated.overrides['mcu-movies']?.excludedItemKeys).toEqual([
      'tmdb:movie:10195',
    ]);

    saveCollectionLibraryState(migrated);

    expect(localStorage.getItem('rankerultimate:collections:v1')).toBeNull();
    expect(localStorage.getItem('rankerultimate:collections:v2')).toBeNull();
    expect(localStorage.getItem('rankerultimate:collections:v3')).not.toBeNull();
  });

  it('migrates existing v2 collection state into v3 without changing user data', () => {
    localStorage.setItem(
      'rankerultimate:collections:v2',
      JSON.stringify({
        version: 2,
        customCollections: [
          {
            id: 'custom:test',
            name: 'Test',
            itemKeys: ['local:hades'],
          },
        ],
        overrides: {
          'mcu-movies': {
            name: 'Marvel Movies',
          },
        },
        deletedBuiltInIds: ['games'],
      }),
    );

    const migrated = loadCollectionLibraryState(baseCollections);

    expect(migrated).toEqual({
      version: 3,
      customCollections: [
        {
          id: 'custom:test',
          name: 'Test',
          itemKeys: ['local:hades'],
        },
      ],
      generatedCollections: [],
      overrides: {
        'mcu-movies': {
          name: 'Marvel Movies',
        },
      },
      deletedBuiltInIds: ['games'],
    });
  });
});
