import type { RankItem } from '@/domain/models';

import { ComparisonScene } from '../../components/ComparisonScene/ComparisonScene';

type RefinementScreenProps = {
  first: RankItem;
  second: RankItem;
  index: number;
  total: number;
  canUndo: boolean;
  onChoose: (winnerId: string) => void;
  onUndo: () => void;
};

export function RefinementScreen({
  first,
  second,
  index,
  total,
  canUndo,
  onChoose,
  onUndo,
}: RefinementScreenProps) {
  return (
    <ComparisonScene
      first={first}
      second={second}
      progressPercent={(index / Math.max(1, total)) * 100}
      progressText={`${index + 1} of ${total} extra comparisons`}
      canUndo={canUndo}
      footerText="A few extra comparisons help fine-tune the outcome."
      onChoose={(winner) => onChoose(winner.id)}
      onUndo={onUndo}
    />
  );
}
