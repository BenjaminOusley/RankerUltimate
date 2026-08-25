import type { RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';

import styles from './FinalChoiceCheckpoint.module.css';

type StaticChoiceCardProps = {
  item: RankItem;
  chosen: boolean;
};

function StaticChoiceCard({ item, chosen }: StaticChoiceCardProps) {
  return (
    <div className={`${styles.choiceCard} ${chosen ? styles.chosenCard : ''}`}>
      <Poster
        item={item}
        className={styles.poster}
      />

      <div className={styles.copy}>
        <strong title={item.name}>{item.name}</strong>
        {item.subtitle && <span>{item.subtitle}</span>}
      </div>

      {chosen && <span className={styles.chosenBadge}>✓ Chosen</span>}
    </div>
  );
}

type FinalChoiceCheckpointProps = {
  title: string;
  first: RankItem | null;
  second: RankItem | null;
  winnerId: string | null;
  onUndo: () => void;
  onContinue: () => void;
};

export function FinalChoiceCheckpoint({
  title,
  first,
  second,
  winnerId,
  onUndo,
  onContinue,
}: FinalChoiceCheckpointProps) {
  return (
    <section className={styles.card}>
      <div className={styles.icon}>✓</div>
      <h1>{title}</h1>
      <p>That was the last choice for this phase. Make sure you’re happy with it.</p>

      {first && second && (
        <div
          className={styles.preview}
          aria-label="Your last choice"
        >
          <StaticChoiceCard
            item={first}
            chosen={winnerId === first.id}
          />
          <span className={styles.vs}>VS</span>
          <StaticChoiceCard
            item={second}
            chosen={winnerId === second.id}
          />
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={onUndo}>↶ Undo Last Choice</Button>
        <Button
          variant="primary"
          onClick={onContinue}
        >
          Continue →
        </Button>
      </div>
    </section>
  );
}
