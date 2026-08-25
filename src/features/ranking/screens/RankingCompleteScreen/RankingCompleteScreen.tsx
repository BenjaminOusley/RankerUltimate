import { Button } from '@/shared/components/Button/Button';

import { CompletionCard } from '../../components/CompletionCard/CompletionCard';
import styles from './RankingCompleteScreen.module.css';

type RankingCompleteScreenProps = {
  collectionName: string;
  comparisons: number;
  refinementCount: number;
  onRefine: () => void;
  onRateItems: () => void;
  onSeeResults: () => void;
};

export function RankingCompleteScreen({
  collectionName,
  comparisons,
  refinementCount,
  onRefine,
  onRateItems,
  onSeeResults,
}: RankingCompleteScreenProps) {
  return (
    <CompletionCard
      icon="✓"
      title="Ranking complete!"
      subtitle={collectionName}
      description={`${comparisons} comparisons so far.`}
    >
      <Button
        variant="primary"
        className={styles.action}
        onClick={onRefine}
        disabled={refinementCount === 0}
      >
        <span>
          Refine Results <em>(optional)</em>
        </span>
        <small>
          {refinementCount > 0
            ? 'Answer a few more carefully chosen comparisons'
            : 'No useful extra comparisons found'}
        </small>
      </Button>

      <Button
        className={styles.action}
        onClick={onRateItems}
      >
        <span>
          Rate Items <em>(optional)</em>
        </span>
        <small>Set or update your personal ratings</small>
      </Button>

      <Button
        className={styles.action}
        onClick={onSeeResults}
      >
        <span>See Results</span>
        <small>Reveal your final ranked list</small>
      </Button>
    </CompletionCard>
  );
}
