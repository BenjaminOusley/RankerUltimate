import { AppShell } from '@/app/AppShell';
import { Button } from '@/shared/components/Button/Button';
import styles from './ResumeRankingScreen.module.css';

type ResumeRankingScreenProps = {
  collectionName: string;
  placedItems: number;
  comparisons: number;
  onResume: () => void;
  onDiscard: () => void;
};

export function ResumeRankingScreen({
  collectionName,
  placedItems,
  comparisons,
  onResume,
  onDiscard,
}: ResumeRankingScreenProps) {
  return (
    <AppShell centered>
      <section className={styles.card}>
        <div className={styles.icon}>↻</div>
        <h1>You have an unfinished ranking</h1>
        <h2>{collectionName}</h2>
        <p>
          {placedItems} items placed · {comparisons} comparisons
        </p>

        <div className={styles.actions}>
          <Button variant="primary" onClick={onResume}>
            Resume Ranking
          </Button>
          <Button onClick={onDiscard}>Discard &amp; Go to Main Menu</Button>
        </div>
      </section>
    </AppShell>
  );
}
