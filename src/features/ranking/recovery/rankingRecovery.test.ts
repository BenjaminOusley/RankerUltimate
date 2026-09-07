import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RankItem } from '@/domain/models';
import { chooseRankingWinner, createRankingStateFromOrder } from '../engine';
import { loadRankingRecovery, saveRankingRecovery } from './rankingRecovery';

function item(id: string): RankItem {
  return { id, name: id };
}

function createStorage(initialEntries: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
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
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  } satisfies Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ranking recovery', () => {
  it('migrates legacy full-state recovery into compact winner history', () => {
    const orderedItems = [item('a'), item('b'), item('c')];
    const initialState = createRankingStateFromOrder(orderedItems);
    const winnerId = initialState.current?.id;

    if (!winnerId) {
      throw new Error('Expected an initial ranking choice.');
    }

    const rankingState = chooseRankingWinner(initialState, winnerId);
    const legacyPayload = {
      version: 1,
      collectionId: 'collection',
      selectedItemIds: orderedItems.map((entry) => entry.id),
      rankingState,
      rankingHistory: [initialState],
      screen: 'ranking',
      refinementPairs: [],
      refinementIndex: 0,
      refinementHistory: [],
      ratingOrderIds: [],
      ratingBackScreen: 'rankingComplete',
    };
    const storage = createStorage({
      'rankerultimate:recovery:v1': JSON.stringify(legacyPayload),
    });

    vi.stubGlobal('localStorage', storage);

    const migrated = loadRankingRecovery();

    expect(migrated).toMatchObject({
      version: 2,
      collectionId: 'collection',
      rankingOrderIds: ['a', 'b', 'c'],
      rankingWinnerIds: [winnerId],
      comparisons: rankingState.comparisons,
      screen: 'ranking',
    });
    expect(storage.getItem('rankerultimate:recovery:v1')).toBeNull();
    expect(storage.getItem('rankerultimate:recovery:v2')).not.toBeNull();
  });

  it('returns false instead of throwing when browser storage rejects a save', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Quota exceeded');
      }),
      removeItem: vi.fn(),
    });

    expect(
      saveRankingRecovery({
        version: 2,
        collectionId: 'collection',
        selectedItemIds: ['a', 'b'],
        rankingOrderIds: ['a', 'b'],
        rankingWinnerIds: [],
        placedItems: 1,
        comparisons: 0,
        screen: 'ranking',
        refinementPairs: [],
        refinementWinnerIds: [],
        ratingOrderIds: [],
        ratingBackScreen: 'rankingComplete',
      }),
    ).toBe(false);
  });
});
