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
