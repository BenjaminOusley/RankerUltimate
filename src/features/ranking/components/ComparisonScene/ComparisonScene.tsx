import type { RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';

import { ComparisonCard } from '../ComparisonCard/ComparisonCard';
import { ScenePanel } from '@/shared/components/Scene/Scene';
import styles from './ComparisonScene.module.css';

type ComparisonSceneProps = {
  first: RankItem;
  second: RankItem;
  progressPercent: number;
  progressText: string;
  canUndo: boolean;
  footerText?: string;
  onChoose: (winner: RankItem) => void;
  onUndo: () => void;
};

export function ComparisonScene({
  first,
  second,
  progressPercent,
  progressText,
  canUndo,
  footerText,
  onChoose,
  onUndo,
}: ComparisonSceneProps) {
  return (
    <ScenePanel className={styles.scene}>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
        <span>{progressText}</span>
      </div>

      <h1 className={styles.title}>Which do you prefer?</h1>

      <div className={styles.layout}>
        <ComparisonCard
          item={first}
          onChoose={() => onChoose(first)}
        />
        <div className={styles.versus}>VS</div>
        <ComparisonCard
          item={second}
          onChoose={() => onChoose(second)}
        />
      </div>

      <div className={styles.footer}>
        <Button
          onClick={onUndo}
          disabled={!canUndo}
        >
          ↶ Undo Last Choice
        </Button>

        {footerText && <span className={styles.footerText}>{footerText}</span>}
      </div>
    </ScenePanel>
  );
}
