import type { RankItem } from '@/domain/models';

import { fitBradleyTerry, sigmoid } from './model';
import type { ComparisonOutcome } from './types';

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

    const rankBaseline = (itemCount - rankIndex - 0.5) / itemCount;
    const matches = matchCounts.get(item.id) ?? 0;
    const modelWeight = 0.22 * (matches / (matches + 6));
    const blended = rankBaseline * (1 - modelWeight) + expectedWinProbability * modelWeight;

    return Math.min(9.9, Math.max(0.1, blended * 10));
  });

  for (let index = 1; index < rawScores.length; index += 1) {
    rawScores[index] = Math.min(rawScores[index], rawScores[index - 1]);
  }

  return Object.fromEntries(itemIds.map((id, index) => [id, rawScores[index]]));
}
