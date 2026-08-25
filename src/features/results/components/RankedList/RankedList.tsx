import type { RankItem } from '@/models';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { Poster } from '@/shared/components/Poster/Poster';
import { formatPreferenceScore, getRankAdornment, getRankStyle } from '../../model/results';
import styles from './RankedList.module.css';

type RankedListProps = {
  items: RankItem[];
  preferenceScores: Record<string, number>;
  personalRatings: PersonalRatingMap;
};

function getRowClass(rankStyle: ReturnType<typeof getRankStyle>) {
  if (!rankStyle) return '';

  return styles[rankStyle];
}

export function RankedList({ items, preferenceScores, personalRatings }: RankedListProps) {
  return (
    <div className={`scroll-panel ${styles.tableWrap}`}>
      <div className={`${styles.table} ${styles.tableHeader}`}>
        <span>Rank</span>
        <span>Item</span>
        <span className={styles.numericHeader}>
          Preference
          <button
            className={styles.infoTooltip}
            title="Calculated from how this item performed against others in this ranking. Rank sets the order; comparison evidence adjusts the spacing."
            aria-label="About Preference Score"
          >
            ?
          </button>
        </span>
        <span className={styles.numericHeader}>Your Rating</span>
      </div>

      {items.map((item, index) => {
        const rankStyle = getRankStyle(index, items.length);
        const adornment = getRankAdornment(index);
        const rating = getPersonalRating(personalRatings, item);

        return (
          <div
            className={`${styles.table} ${styles.resultRow} ${getRowClass(rankStyle)}`}
            key={item.id}
          >
            <span className={styles.rankCell}>
              <span className={styles.rankAdornment}>{adornment}</span>
              <strong>{index + 1}</strong>
            </span>

            <span className={styles.itemCell}>
              <Poster
                item={item}
                className={styles.poster}
              />
              <span className={styles.itemCopy}>
                <strong
                  className={styles.truncateName}
                  title={item.name}
                  tabIndex={0}
                >
                  {item.name}
                </strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </span>
            </span>

            <span className={styles.scoreCell}>
              <span className={`${styles.scorePill} ${styles.preferenceScore}`}>
                ◆ {formatPreferenceScore(preferenceScores[item.id])}
              </span>
            </span>

            <span className={styles.scoreCell}>
              <span
                className={`${styles.scorePill} ${styles.ratingScore} ${
                  rating === null ? styles.emptyScore : ''
                }`}
              >
                ★ {formatPersonalRating(rating)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
