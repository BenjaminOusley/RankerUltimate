import { describe, expect, it } from 'vitest';

import type { RankItem } from '../models';
import { chooseWinner, createInitialRankingState } from './ranker';

const itemA: RankItem = {
  id: 'a',
  name: 'Item A',
};

const itemB: RankItem = {
  id: 'b',
  name: 'Item B',
};

const itemC: RankItem = {
  id: 'c',
  name: 'Item C',
};

const itemD: RankItem = {
  id: 'd',
  name: 'Item D',
};

const itemE: RankItem = {
  id: 'e',
  name: 'Item E',
};

describe('createInitialRankingState', () => {
  it('creates an empty completed state for zero items', () => {
    const state = createInitialRankingState([]);

    expect(state).toEqual({
      ranked: [],
      remaining: [],
      current: null,
      low: 0,
      high: 0,
      comparisons: 0,
    });
  });

  it('immediately completes a one-item ranking', () => {
    const state = createInitialRankingState([itemA]);

    expect(state).toEqual({
      ranked: [itemA],
      remaining: [],
      current: null,
      low: 0,
      high: 1,
      comparisons: 0,
    });
  });

  it('initializes a multi-item ranking correctly', () => {
    const state = createInitialRankingState([itemA, itemB, itemC, itemD]);

    expect(state.ranked).toEqual([itemA]);
    expect(state.current).toBe(itemB);
    expect(state.remaining).toEqual([itemC, itemD]);
    expect(state.low).toBe(0);
    expect(state.high).toBe(1);
    expect(state.comparisons).toBe(0);
  });
});

describe('chooseWinner', () => {
  it('inserts the current item before the opponent when the current item wins', () => {
    const state = createInitialRankingState([itemA, itemB, itemC]);

    const nextState = chooseWinner(state, itemB);

    expect(nextState.ranked).toEqual([itemB, itemA]);

    expect(nextState.current).toBe(itemC);
    expect(nextState.remaining).toEqual([]);
    expect(nextState.comparisons).toBe(1);
  });

  it('inserts the current item after the opponent when the opponent wins', () => {
    const state = createInitialRankingState([itemA, itemB, itemC]);

    const nextState = chooseWinner(state, itemA);

    expect(nextState.ranked).toEqual([itemA, itemB]);

    expect(nextState.current).toBe(itemC);
    expect(nextState.remaining).toEqual([]);
    expect(nextState.comparisons).toBe(1);
  });

  it('can place an item in the middle of an existing ranking', () => {
    const state = {
      ranked: [itemA, itemC, itemE],
      remaining: [],
      current: itemD,
      low: 0,
      high: 3,
      comparisons: 0,
    };

    const afterFirstComparison = chooseWinner(state, itemC);

    expect(afterFirstComparison.low).toBe(2);
    expect(afterFirstComparison.high).toBe(3);
    expect(afterFirstComparison.comparisons).toBe(1);

    const finishedState = chooseWinner(afterFirstComparison, itemD);

    expect(finishedState.ranked).toEqual([itemA, itemC, itemD, itemE]);

    expect(finishedState.current).toBeNull();
    expect(finishedState.comparisons).toBe(2);
  });

  it('marks the ranking complete after the final item is inserted', () => {
    const state = createInitialRankingState([itemA, itemB]);

    const completedState = chooseWinner(state, itemA);

    expect(completedState.ranked).toEqual([itemA, itemB]);

    expect(completedState.current).toBeNull();
    expect(completedState.remaining).toEqual([]);
    expect(completedState.comparisons).toBe(1);
  });

  it('rejects a winner that is not part of the current comparison', () => {
    const state = createInitialRankingState([itemA, itemB]);

    expect(() => chooseWinner(state, itemC)).toThrow(
      'Winner must be one of the current comparison items.',
    );
  });

  it('rejects choices after a ranking is complete', () => {
    const state = createInitialRankingState([itemA]);

    expect(() => chooseWinner(state, itemA)).toThrow(
      'Cannot choose a winner after ranking is complete.',
    );
  });

  it('does not mutate the previous ranking state', () => {
    const state = createInitialRankingState([itemA, itemB, itemC]);

    const originalRanked = [...state.ranked];
    const originalRemaining = [...state.remaining];

    const nextState = chooseWinner(state, itemB);

    expect(state.ranked).toEqual(originalRanked);

    expect(state.remaining).toEqual(originalRemaining);

    expect(state.current).toBe(itemB);
    expect(state.comparisons).toBe(0);

    expect(nextState).not.toBe(state);
  });

  it('can correctly rank a complete list from best to worst', () => {
    const items = [itemC, itemA, itemE, itemB, itemD];

    const expectedOrder = [itemA, itemB, itemC, itemD, itemE];

    const preferenceOrder = new Map(expectedOrder.map((item, index) => [item.id, index]));

    let state = createInitialRankingState(items);

    while (state.current) {
      const comparisonIndex = Math.floor((state.low + state.high) / 2);

      const opponent = state.ranked[comparisonIndex];

      if (!opponent) {
        throw new Error('Test encountered an invalid opponent.');
      }

      const currentRank = preferenceOrder.get(state.current.id);

      const opponentRank = preferenceOrder.get(opponent.id);

      if (currentRank === undefined || opponentRank === undefined) {
        throw new Error('Test item is missing a preference rank.');
      }

      const winner = currentRank < opponentRank ? state.current : opponent;

      state = chooseWinner(state, winner);
    }

    expect(state.ranked).toEqual(expectedOrder);
  });
});
