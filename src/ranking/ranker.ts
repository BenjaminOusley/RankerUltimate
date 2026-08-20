import type { RankItem } from '../models';
import type { RankingState } from './state';

export function createInitialRankingState(items: RankItem[]): RankingState {
  if (items.length === 0) {
    return {
      ranked: [],
      remaining: [],
      current: null,
      low: 0,
      high: 0,
      comparisons: 0,
    };
  }

  if (items.length === 1) {
    return {
      ranked: [items[0]],
      remaining: [],
      current: null,
      low: 0,
      high: 1,
      comparisons: 0,
    };
  }

  return {
    ranked: [items[0]],
    current: items[1],
    remaining: items.slice(2),
    low: 0,
    high: 1,
    comparisons: 0,
  };
}

export function chooseWinner(state: RankingState, winner: RankItem): RankingState {
  const { ranked, remaining, current, low, high, comparisons } = state;

  if (!current) {
    throw new Error('Cannot choose a winner after ranking is complete.');
  }

  const comparisonIndex = Math.floor((low + high) / 2);
  const opponent = ranked[comparisonIndex];

  if (!opponent) {
    throw new Error('Ranking state contains no valid opponent.');
  }

  const validWinner = winner.id === current.id || winner.id === opponent.id;

  if (!validWinner) {
    throw new Error('Winner must be one of the current comparison items.');
  }

  let nextLow = low;
  let nextHigh = high;

  if (winner.id === current.id) {
    nextHigh = comparisonIndex;
  } else {
    nextLow = comparisonIndex + 1;
  }

  const nextComparisonCount = comparisons + 1;

  if (nextLow >= nextHigh) {
    const newRanked = [...ranked];

    newRanked.splice(nextLow, 0, current);

    const nextCurrent = remaining[0] ?? null;
    const nextRemaining = remaining.slice(1);

    return {
      ranked: newRanked,
      remaining: nextRemaining,
      current: nextCurrent,
      low: 0,
      high: newRanked.length,
      comparisons: nextComparisonCount,
    };
  }

  return {
    ...state,
    low: nextLow,
    high: nextHigh,
    comparisons: nextComparisonCount,
  };
}
