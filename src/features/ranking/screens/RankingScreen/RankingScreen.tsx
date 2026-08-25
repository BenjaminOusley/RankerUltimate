import type { RankItem } from '@/models';

import { ComparisonScene } from '../../components/ComparisonScene/ComparisonScene';

type RankingScreenProps = {
  current: RankItem;
  opponent: RankItem;
  placedCount: number;
  totalItems: number;
  comparisons: number;
  canUndo: boolean;
  onChoose: (winner: RankItem) => void;
  onUndo: () => void;
};

export function RankingScreen({
  current,
  opponent,
  placedCount,
  totalItems,
  comparisons,
  canUndo,
  onChoose,
  onUndo,
}: RankingScreenProps) {
  const progressPercent = (placedCount / Math.max(1, totalItems)) * 100;

  return (
    <ComparisonScene
      first={current}
      second={opponent}
      progressPercent={progressPercent}
      progressText={`${placedCount} of ${totalItems} items placed · ${comparisons} comparisons`}
      canUndo={canUndo}
      onChoose={onChoose}
      onUndo={onUndo}
    />
  );
}
