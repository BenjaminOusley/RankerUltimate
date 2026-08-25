import type { RankItem } from '@/models';
import { Poster } from '@/shared/components/Poster/Poster';

import styles from './ComparisonCard.module.css';

type ComparisonCardProps = {
  item: RankItem;
  onChoose: () => void;
};

export function ComparisonCard({ item, onChoose }: ComparisonCardProps) {
  return (
    <button
      className={styles.card}
      onClick={onChoose}
    >
      <Poster
        item={item}
        className={styles.poster}
      />

      <span
        className={styles.name}
        title={item.name}
      >
        {item.name}
      </span>

      {item.subtitle && <span className={styles.subtitle}>{item.subtitle}</span>}
    </button>
  );
}
