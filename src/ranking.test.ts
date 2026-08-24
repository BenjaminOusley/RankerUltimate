import { describe, expect, it } from 'vitest';

import type { RankItem } from './models';
import {
  applyRefinementChoice,
  calculatePreferenceScores,
  chooseRankingWinner,
  createInitialRankingState,
  formatPersonalRating,
  getCurrentOpponent,
} from './ranking';

const itemA: RankItem = { id: 'a', name: 'Item A' };
const itemB: RankItem = { id: 'b', name: 'Item B' };
const itemC: RankItem = { id: 'c', name: 'Item C' };

// Fisher-Yates picks the current index each time, preserving input order.
const noShuffle = () => 0.999999;

function makeItems(count: number): RankItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Item ${index}`,
  }));
}

function seededRandom(seed: number) {
  let value = seed >>> 0;

  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function runConsistentRanking(count: number, seed: number) {
  let state = createInitialRankingState(makeItems(count), seededRandom(seed));
  let guard = 0;

  while (state.current && guard < 5000) {
    guard += 1;

    const opponent = getCurrentOpponent(state);

    if (!opponent) {
      throw new Error('Ranking state had a current item without an opponent.');
    }

    // Lower numeric ID is the hidden true preference.
    const winner = Number(state.current.id) < Number(opponent.id) ? state.current : opponent;

    state = chooseRankingWinner(state, winner.id);
  }

  if (guard >= 5000) {
    throw new Error('Ranking did not terminate.');
  }

  return state;
}

describe('ranking state basics', () => {
  it('creates an empty completed state for zero items', () => {
    const state = createInitialRankingState([], noShuffle);

    expect(state).toEqual({
      ranked: [],
      remaining: [],
      current: null,
      low: 0,
      high: 0,
      comparisons: 0,
      outcomes: [],
      mode: 'insert',
      validationPair: null,
      validationChecked: true,
    });
  });

  it('immediately completes a one-item ranking', () => {
    const state = createInitialRankingState([itemA], noShuffle);

    expect(state).toEqual({
      ranked: [itemA],
      remaining: [],
      current: null,
      low: 0,
      high: 1,
      comparisons: 0,
      outcomes: [],
      mode: 'insert',
      validationPair: null,
      validationChecked: true,
    });
  });

  it('initializes a multi-item ranking from the randomized order', () => {
    const state = createInitialRankingState([itemA, itemB, itemC], noShuffle);

    expect(state.ranked).toEqual([itemA]);
    expect(state.current).toBe(itemB);
    expect(state.remaining).toEqual([itemC]);
    expect(state.low).toBe(0);
    expect(state.high).toBe(1);
    expect(state.comparisons).toBe(0);
  });

  it('inserts the current item before the opponent when the current item wins', () => {
    const state = createInitialRankingState([itemA, itemB, itemC], noShuffle);
    const nextState = chooseRankingWinner(state, itemB.id);

    expect(nextState.ranked).toEqual([itemB, itemA]);
    expect(nextState.current).toBe(itemC);
    expect(nextState.remaining).toEqual([]);
    expect(nextState.comparisons).toBe(1);
  });

  it('inserts the current item after the opponent when the opponent wins', () => {
    const state = createInitialRankingState([itemA, itemB, itemC], noShuffle);
    const nextState = chooseRankingWinner(state, itemA.id);

    expect(nextState.ranked).toEqual([itemA, itemB]);
    expect(nextState.current).toBe(itemC);
    expect(nextState.remaining).toEqual([]);
    expect(nextState.comparisons).toBe(1);
  });

  it('does not mutate the previous ranking state', () => {
    const state = createInitialRankingState([itemA, itemB, itemC], noShuffle);
    const originalRanked = [...state.ranked];
    const originalRemaining = [...state.remaining];
    const originalOutcomes = [...state.outcomes];

    const nextState = chooseRankingWinner(state, itemB.id);

    expect(state.ranked).toEqual(originalRanked);
    expect(state.remaining).toEqual(originalRemaining);
    expect(state.outcomes).toEqual(originalOutcomes);
    expect(state.current).toBe(itemB);
    expect(state.comparisons).toBe(0);
    expect(nextState).not.toBe(state);
  });

  it('ignores a winner that is not part of the current comparison', () => {
    const state = createInitialRankingState([itemA, itemB], noShuffle);

    expect(chooseRankingWinner(state, itemC.id)).toBe(state);
  });

  it('ignores choices after a ranking is complete', () => {
    const state = createInitialRankingState([itemA], noShuffle);

    expect(chooseRankingWinner(state, itemA.id)).toBe(state);
  });
});

describe('randomized ranking', () => {
  it('produces the same final order for consistent preferences across randomized runs', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = runConsistentRanking(30, seed);

      expect(state.ranked.map((item) => Number(item.id))).toEqual(
        Array.from({ length: 30 }, (_, index) => index),
      );
    }
  });

  it('can insert a hidden extreme validation comparison without changing a consistent result', () => {
    const state = runConsistentRanking(35, 3);

    expect(state.outcomes.some((outcome) => outcome.phase === 'validation')).toBe(true);
    expect(state.ranked.map((item) => Number(item.id))).toEqual(
      Array.from({ length: 35 }, (_, index) => index),
    );
  });
});

describe('preference score', () => {
  it('always respects final rank order', () => {
    const state = runConsistentRanking(30, 7);
    const scores = calculatePreferenceScores(state.ranked, state.outcomes);

    for (let index = 1; index < state.ranked.length; index += 1) {
      const previous = scores[state.ranked[index - 1].id];
      const current = scores[state.ranked[index].id];

      expect(previous).toBeGreaterThanOrEqual(current);
    }
  });

  it('stays reasonably stable across random comparison paths', () => {
    const firstPlaceScores: number[] = [];
    const fifthPlaceScores: number[] = [];

    for (let seed = 1; seed <= 80; seed += 1) {
      const state = runConsistentRanking(30, seed);
      const scores = calculatePreferenceScores(state.ranked, state.outcomes);

      firstPlaceScores.push(scores['0']);
      fifthPlaceScores.push(scores['4']);
    }

    expect(Math.max(...firstPlaceScores) - Math.min(...firstPlaceScores)).toBeLessThan(0.2);
    expect(Math.max(...fifthPlaceScores) - Math.min(...fifthPlaceScores)).toBeLessThan(0.4);
  });
});

describe('refinement', () => {
  it('moves a lower-ranked winner directly above the item it beat', () => {
    const ranked = makeItems(5);

    const next = applyRefinementChoice(ranked, { firstId: '1', secondId: '3' }, '3');

    expect(next.map((item) => item.id)).toEqual(['0', '3', '1', '2', '4']);
  });
});

describe('personal rating display', () => {
  it('omits .0 for whole-number ratings', () => {
    expect(formatPersonalRating(9)).toBe('9');
    expect(formatPersonalRating(9.5)).toBe('9.5');
    expect(formatPersonalRating(10)).toBe('10');
    expect(formatPersonalRating(null)).toBe('—');
  });
});
