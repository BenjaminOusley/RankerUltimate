import type { RankItem } from './models';

export type ComparisonPhase = 'ranking' | 'validation' | 'repair' | 'refinement';

export type ComparisonOutcome = {
  winnerId: string;
  loserId: string;
  phase: ComparisonPhase;
};

export type ValidationPair = {
  upperId: string;
  lowerId: string;
  upperIndex: number;
  lowerIndex: number;
};

export type RankingMode = 'insert' | 'validation' | 'repair';

export type RankingState = {
  ranked: RankItem[];
  remaining: RankItem[];
  current: RankItem | null;
  low: number;
  high: number;
  comparisons: number;
  outcomes: ComparisonOutcome[];
  mode: RankingMode;
  validationPair: ValidationPair | null;
  validationChecked: boolean;
};

export type RefinementPair = {
  firstId: string;
  secondId: string;
};

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

function pairKey(firstId: string, secondId: string) {
  return firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;
}

function buildDirectPairSet(outcomes: readonly ComparisonOutcome[]) {
  return new Set(outcomes.map((outcome) => pairKey(outcome.winnerId, outcome.loserId)));
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

      // Observed extremes alone are not enough. The model must also see a
      // clearly separated matchup before we spend a hidden sanity check on it.
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

    // The extreme result contradicted the provisional ordering. Reinsert the
    // surprising winner across the full field so the follow-up questions test
    // genuinely new opponents instead of immediately repeating the sanity check.
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

function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }

  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function fitBradleyTerry(
  itemIds: readonly string[],
  outcomes: readonly ComparisonOutcome[],
  iterations = 220,
  regularization = 1.25,
) {
  const indexById = new Map(itemIds.map((id, index) => [id, index]));
  const abilities = new Array(itemIds.length).fill(0) as number[];

  if (itemIds.length <= 1 || outcomes.length === 0) {
    return abilities;
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = abilities.map((ability) => -regularization * ability);

    for (const outcome of outcomes) {
      const winnerIndex = indexById.get(outcome.winnerId);
      const loserIndex = indexById.get(outcome.loserId);

      if (winnerIndex === undefined || loserIndex === undefined) {
        continue;
      }

      const probability = sigmoid(abilities[winnerIndex] - abilities[loserIndex]);
      const residual = 1 - probability;

      gradient[winnerIndex] += residual;
      gradient[loserIndex] -= residual;
    }

    const learningRate = 0.12 / Math.sqrt(1 + iteration * 0.06);

    for (let index = 0; index < abilities.length; index += 1) {
      abilities[index] += learningRate * gradient[index];
    }

    const mean = abilities.reduce((sum, value) => sum + value, 0) / abilities.length;

    for (let index = 0; index < abilities.length; index += 1) {
      abilities[index] -= mean;
    }
  }

  return abilities;
}

function buildMatchCounts(itemIds: readonly string[], outcomes: readonly ComparisonOutcome[]) {
  const counts = new Map(itemIds.map((id) => [id, 0]));

  for (const outcome of outcomes) {
    counts.set(outcome.winnerId, (counts.get(outcome.winnerId) ?? 0) + 1);
    counts.set(outcome.loserId, (counts.get(outcome.loserId) ?? 0) + 1);
  }

  return counts;
}

export function calculatePreferenceScores(
  ranked: readonly RankItem[],
  outcomes: readonly ComparisonOutcome[],
): Record<string, number> {
  const itemIds = ranked.map((item) => item.id);
  const itemCount = itemIds.length;

  if (itemCount === 0) {
    return {};
  }

  if (itemCount === 1) {
    return { [itemIds[0]]: 10 };
  }

  const abilities = fitBradleyTerry(itemIds, outcomes);
  const matchCounts = buildMatchCounts(itemIds, outcomes);
  const rawScores = ranked.map((item, rankIndex) => {
    const abilityIndex = itemIds.indexOf(item.id);
    let expectedWinProbability = 0;

    for (let opponentIndex = 0; opponentIndex < itemCount; opponentIndex += 1) {
      if (opponentIndex === abilityIndex) {
        continue;
      }

      expectedWinProbability += sigmoid(abilities[abilityIndex] - abilities[opponentIndex]);
    }

    expectedWinProbability /= itemCount - 1;

    // Smoothed rank percentile: avoids pretending the top item is literally 100%
    // certain or the bottom item literally 0% certain.
    const rankBaseline = (itemCount - rankIndex - 0.5) / itemCount;
    const matches = matchCounts.get(item.id) ?? 0;

    // Bradley-Terry adjusts spacing, but rank remains authoritative. The cap keeps
    // sparse/random comparison paths from moving a score too aggressively.
    const modelWeight = 0.22 * (matches / (matches + 6));
    const blended = rankBaseline * (1 - modelWeight) + expectedWinProbability * modelWeight;

    return Math.min(9.9, Math.max(0.1, blended * 10));
  });

  // Final rank is authoritative. The statistical model can compress/stretch gaps,
  // but it is never allowed to reverse the displayed order.
  for (let index = 1; index < rawScores.length; index += 1) {
    rawScores[index] = Math.min(rawScores[index], rawScores[index - 1]);
  }

  return Object.fromEntries(itemIds.map((id, index) => [id, rawScores[index]]));
}

export function buildRefinementPairs(
  ranked: readonly RankItem[],
  outcomes: readonly ComparisonOutcome[],
): RefinementPair[] {
  const itemCount = ranked.length;

  if (itemCount < 3) {
    return [];
  }

  const itemIds = ranked.map((item) => item.id);
  const abilities = fitBradleyTerry(itemIds, outcomes);
  const directPairs = buildDirectPairSet(outcomes);
  const maximumRankDistance = Math.max(2, Math.ceil(itemCount * 0.15));
  const targetCount = itemCount < 10 ? 3 : itemCount < 30 ? 5 : 7;

  const candidates: Array<RefinementPair & { value: number }> = [];

  for (let firstIndex = 0; firstIndex < itemCount; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < Math.min(itemCount, firstIndex + maximumRankDistance + 1);
      secondIndex += 1
    ) {
      const firstId = itemIds[firstIndex];
      const secondId = itemIds[secondIndex];

      if (directPairs.has(pairKey(firstId, secondId))) {
        continue;
      }

      const probability = sigmoid(abilities[firstIndex] - abilities[secondIndex]);
      const uncertainty = 4 * probability * (1 - probability);
      const distance = secondIndex - firstIndex;
      const rankImpact = 1 / (1 + distance * 0.3);

      candidates.push({
        firstId,
        secondId,
        value: uncertainty * rankImpact,
      });
    }
  }

  candidates.sort((left, right) => right.value - left.value);

  const selected: RefinementPair[] = [];
  const appearances = new Map<string, number>();

  for (const candidate of candidates) {
    const firstAppearances = appearances.get(candidate.firstId) ?? 0;
    const secondAppearances = appearances.get(candidate.secondId) ?? 0;

    if (firstAppearances >= 2 || secondAppearances >= 2) {
      continue;
    }

    selected.push({ firstId: candidate.firstId, secondId: candidate.secondId });
    appearances.set(candidate.firstId, firstAppearances + 1);
    appearances.set(candidate.secondId, secondAppearances + 1);

    if (selected.length >= targetCount) {
      break;
    }
  }

  return selected;
}

export function applyRefinementChoice(
  ranked: readonly RankItem[],
  pair: RefinementPair,
  winnerId: string,
): RankItem[] {
  if (winnerId !== pair.firstId && winnerId !== pair.secondId) {
    return [...ranked];
  }

  const loserId = winnerId === pair.firstId ? pair.secondId : pair.firstId;
  const winnerIndex = ranked.findIndex((item) => item.id === winnerId);
  const loserIndex = ranked.findIndex((item) => item.id === loserId);

  if (winnerIndex < 0 || loserIndex < 0 || winnerIndex < loserIndex) {
    return [...ranked];
  }

  const nextRanked = [...ranked];
  const [winner] = nextRanked.splice(winnerIndex, 1);
  const updatedLoserIndex = nextRanked.findIndex((item) => item.id === loserId);

  nextRanked.splice(updatedLoserIndex, 0, winner);

  return nextRanked;
}

export function formatPersonalRating(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
