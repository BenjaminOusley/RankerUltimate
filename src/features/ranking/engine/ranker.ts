import type { RankItem } from '@/domain/models';

import { buildDirectPairSet, fitBradleyTerry, pairKey, sigmoid } from './model';
import type {
  ComparisonOutcome,
  ComparisonPhase,
  RankingState,
  ValidationPair,
} from './types';

export function shuffleItems<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));

    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function createInitialRankingState(
  items: readonly RankItem[],
  random: () => number = Math.random,
): RankingState {
  const randomized = shuffleItems(items, random);

  if (randomized.length === 0) {
    return {
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
    };
  }

  if (randomized.length === 1) {
    return {
      ranked: [randomized[0]],
      remaining: [],
      current: null,
      low: 0,
      high: 1,
      comparisons: 0,
      outcomes: [],
      mode: 'insert',
      validationPair: null,
      validationChecked: true,
    };
  }

  return {
    ranked: [randomized[0]],
    current: randomized[1],
    remaining: randomized.slice(2),
    low: 0,
    high: 1,
    comparisons: 0,
    outcomes: [],
    mode: 'insert',
    validationPair: null,
    validationChecked: false,
  };
}

export function getCurrentOpponent(state: RankingState): RankItem | null {
  if (!state.current) {
    return null;
  }

  if (state.mode === 'validation') {
    if (!state.validationPair) {
      return null;
    }

    return state.ranked.find((item) => item.id === state.validationPair?.lowerId) ?? null;
  }

  const comparisonIndex = Math.floor((state.low + state.high) / 2);

  return state.ranked[comparisonIndex] ?? null;
}

function calculateObservedStats(outcomes: readonly ComparisonOutcome[]) {
  const stats = new Map<string, { wins: number; total: number }>();

  for (const outcome of outcomes) {
    if (outcome.phase === 'refinement') {
      continue;
    }

    const winner = stats.get(outcome.winnerId) ?? { wins: 0, total: 0 };
    const loser = stats.get(outcome.loserId) ?? { wins: 0, total: 0 };

    winner.wins += 1;
    winner.total += 1;
    loser.total += 1;

    stats.set(outcome.winnerId, winner);
    stats.set(outcome.loserId, loser);
  }

  return stats;
}

function findExtremeValidationPair(state: RankingState): ValidationPair | null {
  const itemCount = state.ranked.length;

  if (itemCount < 8 || state.validationChecked) {
    return null;
  }

  const stats = calculateObservedStats(state.outcomes);
  const directPairs = buildDirectPairSet(state.outcomes);
  const itemIds = state.ranked.map((item) => item.id);
  const abilities = fitBradleyTerry(itemIds, state.outcomes);
  const abilityById = new Map(itemIds.map((id, index) => [id, abilities[index]]));
  const minimumMatches = Math.max(3, Math.ceil(Math.log2(itemCount)) - 1);
  const bracketSize = Math.min(3, Math.max(1, Math.ceil(itemCount * 0.1)));

  const upperCandidates = state.ranked
    .slice(0, bracketSize)
    .map((item, index) => ({ item, index, stat: stats.get(item.id) }))
    .filter(({ stat }) => {
      if (!stat || stat.total < minimumMatches) {
        return false;
      }

      return stat.wins / stat.total >= 0.9;
    });

  const lowerStart = itemCount - bracketSize;
  const lowerCandidates = state.ranked
    .slice(lowerStart)
    .map((item, offset) => ({
      item,
      index: lowerStart + offset,
      stat: stats.get(item.id),
    }))
    .filter(({ stat }) => {
      if (!stat || stat.total < minimumMatches) {
        return false;
      }

      return stat.wins / stat.total <= 0.1;
    });

  let bestPair: ValidationPair | null = null;
  let bestEvidence = Number.NEGATIVE_INFINITY;

  for (const upper of upperCandidates) {
    for (const lower of lowerCandidates) {
      if (directPairs.has(pairKey(upper.item.id, lower.item.id))) {
        continue;
      }

      const upperAbility = abilityById.get(upper.item.id) ?? 0;
      const lowerAbility = abilityById.get(lower.item.id) ?? 0;
      const modelProbability = sigmoid(upperAbility - lowerAbility);

      if (modelProbability < 0.8) {
        continue;
      }

      const evidence =
        (upper.stat?.total ?? 0) +
        (lower.stat?.total ?? 0) +
        modelProbability +
        (lower.index - upper.index) / Math.max(1, itemCount - 1);

      if (evidence > bestEvidence) {
        bestEvidence = evidence;
        bestPair = {
          upperId: upper.item.id,
          lowerId: lower.item.id,
          upperIndex: upper.index,
          lowerIndex: lower.index,
        };
      }
    }
  }

  return bestPair;
}

function scheduleValidationIfUseful(state: RankingState): RankingState {
  if (state.current || state.remaining.length > 0 || state.validationChecked) {
    return state;
  }

  const validationPair = findExtremeValidationPair(state);

  if (!validationPair) {
    return {
      ...state,
      validationChecked: true,
    };
  }

  const upperItem = state.ranked.find((item) => item.id === validationPair.upperId) ?? null;

  if (!upperItem) {
    return {
      ...state,
      validationChecked: true,
    };
  }

  return {
    ...state,
    current: upperItem,
    low: 0,
    high: 0,
    mode: 'validation',
    validationPair,
  };
}

function appendOutcome(
  state: RankingState,
  winnerId: string,
  loserId: string,
  phase: ComparisonPhase,
): ComparisonOutcome[] {
  return [...state.outcomes, { winnerId, loserId, phase }];
}

export function chooseRankingWinner(state: RankingState, winnerId: string): RankingState {
  const current = state.current;
  const opponent = getCurrentOpponent(state);

  if (!current || !opponent) {
    return state;
  }

  if (winnerId !== current.id && winnerId !== opponent.id) {
    return state;
  }

  const loserId = winnerId === current.id ? opponent.id : current.id;
  const phase: ComparisonPhase =
    state.mode === 'validation' ? 'validation' : state.mode === 'repair' ? 'repair' : 'ranking';
  const outcomes = appendOutcome(state, winnerId, loserId, phase);
  const comparisons = state.comparisons + 1;

  if (state.mode === 'validation') {
    const pair = state.validationPair;

    if (!pair) {
      return {
        ...state,
        outcomes,
        comparisons,
        current: null,
        validationChecked: true,
        mode: 'insert',
      };
    }

    if (winnerId === pair.upperId) {
      return {
        ...state,
        outcomes,
        comparisons,
        current: null,
        validationPair: null,
        validationChecked: true,
        mode: 'insert',
      };
    }

    const lowerItem = state.ranked.find((item) => item.id === pair.lowerId) ?? null;

    if (!lowerItem) {
      return {
        ...state,
        outcomes,
        comparisons,
        current: null,
        validationPair: null,
        validationChecked: true,
        mode: 'insert',
      };
    }

    const rankedWithoutLower = state.ranked.filter((item) => item.id !== lowerItem.id);

    return {
      ...state,
      ranked: rankedWithoutLower,
      remaining: [],
      current: lowerItem,
      low: 0,
      high: rankedWithoutLower.length,
      outcomes,
      comparisons,
      mode: 'repair',
      validationPair: null,
      validationChecked: true,
    };
  }

  const comparisonIndex = Math.floor((state.low + state.high) / 2);
  let nextLow = state.low;
  let nextHigh = state.high;

  if (winnerId === current.id) {
    nextHigh = comparisonIndex;
  } else {
    nextLow = comparisonIndex + 1;
  }

  if (nextLow < nextHigh) {
    return {
      ...state,
      low: nextLow,
      high: nextHigh,
      outcomes,
      comparisons,
    };
  }

  const newRanked = [...state.ranked];
  newRanked.splice(nextLow, 0, current);

  if (state.mode === 'repair') {
    return {
      ...state,
      ranked: newRanked,
      current: null,
      low: 0,
      high: newRanked.length,
      outcomes,
      comparisons,
      mode: 'insert',
    };
  }

  const nextCurrent = state.remaining[0] ?? null;
  const nextRemaining = state.remaining.slice(1);

  const nextState: RankingState = {
    ...state,
    ranked: newRanked,
    remaining: nextRemaining,
    current: nextCurrent,
    low: 0,
    high: newRanked.length,
    outcomes,
    comparisons,
    mode: 'insert',
  };

  return nextCurrent ? nextState : scheduleValidationIfUseful(nextState);
}
