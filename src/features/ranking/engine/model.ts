import type { ComparisonOutcome } from './types';

export function pairKey(firstId: string, secondId: string) {
  return firstId < secondId ? `${firstId}\u0000${secondId}` : `${secondId}\u0000${firstId}`;
}

export function buildDirectPairSet(outcomes: readonly ComparisonOutcome[]) {
  return new Set(outcomes.map((outcome) => pairKey(outcome.winnerId, outcome.loserId)));
}

export function sigmoid(value: number) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }

  const exp = Math.exp(value);
  return exp / (1 + exp);
}

export function fitBradleyTerry(
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
