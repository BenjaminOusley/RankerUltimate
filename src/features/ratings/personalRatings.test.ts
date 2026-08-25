import { beforeEach, describe, expect, it } from 'vitest';

import type { RankItem } from '@/domain/models';
import {
  getItemStorageKey,
  getPersonalRating,
  loadPersonalRatings,
  migratePersonalRatings,
  updatePersonalRatingMap,
} from './personalRatings';

const localItem: RankItem = {
  id: 'example',
  name: 'Example',
};

const sourcedItem: RankItem = {
  id: 'toy-story-862',
  name: 'Toy Story',
  source: {
    provider: 'tmdb',
    type: 'movie',
    id: '862',
  },
};

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

describe('personal rating storage model', () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it('adds, reads, changes, and removes a Personal Rating', () => {
    const added = updatePersonalRatingMap({}, localItem, 9.5);
    expect(getPersonalRating(added, localItem)).toBe(9.5);

    const changed = updatePersonalRatingMap(added, localItem, 10);
    expect(getPersonalRating(changed, localItem)).toBe(10);

    const removed = updatePersonalRatingMap(changed, localItem, null);
    expect(getPersonalRating(removed, localItem)).toBeNull();
  });

  it('does not mutate the previous map', () => {
    const previous = {};
    const next = updatePersonalRatingMap(previous, localItem, 8);

    expect(previous).toEqual({});
    expect(next).not.toBe(previous);
  });

  it('uses canonical provider identity for sourced items', () => {
    expect(getItemStorageKey(sourcedItem)).toBe('tmdb:movie:862');
  });

  it('migrates the old object-string storage key without losing the rating', () => {
    const migrated = migratePersonalRatings(
      {
        '[object Object]:toy-story-862': {
          value: 9.5,
          updatedAt: '2026-08-20T12:00:00.000Z',
        },
      },
      [sourcedItem],
    );

    expect(migrated).toEqual({
      'tmdb:movie:862': {
        value: 9.5,
        updatedAt: '2026-08-20T12:00:00.000Z',
      },
    });
  });

  it('migrates v1 localStorage to v2 on load', () => {
    localStorage.setItem(
      'rankerultimate:personal-ratings:v1',
      JSON.stringify({
        '[object Object]:toy-story-862': {
          value: 10,
          updatedAt: '2026-08-20T12:00:00.000Z',
        },
      }),
    );

    const loaded = loadPersonalRatings([sourcedItem]);

    expect(getPersonalRating(loaded, sourcedItem)).toBe(10);
    expect(localStorage.getItem('rankerultimate:personal-ratings:v1')).toBeNull();
    expect(localStorage.getItem('rankerultimate:personal-ratings:v2')).not.toBeNull();
  });
});
