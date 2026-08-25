import { describe, expect, it } from 'vitest';

import type { RankItem } from '@/models';

import { calculatePreferenceScores } from './preferenceScore';
import { chooseRankingWinner, createInitialRankingState, getCurrentOpponent } from './ranker';

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

    const winner = Number(state.current.id) < Number(opponent.id) ? state.current : opponent;
    state = chooseRankingWinner(state, winner.id);
  }

  if (guard >= 5000) {
    throw new Error('Ranking did not terminate.');
  }

  return state;
}

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
