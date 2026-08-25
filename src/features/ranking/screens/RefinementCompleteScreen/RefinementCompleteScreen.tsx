import { Button } from '@/shared/components/Button/Button';

import { CompletionCard } from '../../components/CompletionCard/CompletionCard';
import styles from './RefinementCompleteScreen.module.css';

type RefinementCompleteScreenProps = {
  onRateItems: () => void;
  onSeeResults: () => void;
};

export function RefinementCompleteScreen({
  onRateItems,
  onSeeResults,
}: RefinementCompleteScreenProps) {
  return (
    <CompletionCard
      icon="✦"
      warm
      title="Refinement complete!"
      description="Your additional choices have been applied."
    >
      <Button
        variant="primary"
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
