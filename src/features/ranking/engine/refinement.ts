import type { RankItem } from '@/models';

import { buildDirectPairSet, fitBradleyTerry, pairKey, sigmoid } from './model';
import type { ComparisonOutcome, RefinementPair } from './types';

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
