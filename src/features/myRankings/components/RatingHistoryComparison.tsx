import type { RankItem } from '@/domain/models';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import { formatPreferenceScore } from '@/features/results/model/results';
import { getPersonalRatingChange } from '../model/savedRankings';
import styles from './RatingHistoryComparison.module.css';

type Props = {
  items: readonly RankItem[];
  rankingScores: Readonly<Record<string, number>>;
  ratingsAtCompletion: Readonly<Record<string, number | null | undefined>>;
  personalRatings: PersonalRatingMap;
};

function historicalLabel(value: number | null | undefined) {
  if (value === undefined) return 'Not recorded';
  if (value === null) return 'Unrated';
  return `★ ${formatPersonalRating(value)}`;
}

function currentLabel(value: number | null) {
  return value === null ? 'Unrated' : `★ ${formatPersonalRating(value)}`;
}

function deltaLabel(delta: number | null) {
  if (delta === null) return '—';
  if (delta === 0) return 'No change';
  return `${delta > 0 ? '+' : '−'}${formatPersonalRating(Math.abs(delta))}`;
}

export function RatingHistoryComparison({ items, rankingScores, ratingsAtCompletion, personalRatings }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2>Personal Ratings: Then vs. Now</h2>
        <p>
          At Completion shows your rating when Results first opened; Current Rating
          shows your latest global rating. Ranking Scores never change.
        </p>
      </div>
      <div className={styles.tableScroll}>
        <div className={`${styles.row} ${styles.tableHead}`}>
          <span>Item</span>
          <span>Ranking Score</span>
          <span>At Completion</span>
          <span>Current Rating</span>
          <span>Change</span>
        </div>
        {items.map((item, index) => {
          const historical = ratingsAtCompletion[item.id];
          const current = getPersonalRating(personalRatings, item);
          const delta = getPersonalRatingChange(historical, current);
          return (
            <div className={styles.row} key={item.id}>
              <span className={styles.item} title={item.name}>
                <span className={styles.rank}>{index + 1}.</span> {item.name}
              </span>
              <span className={styles.rankingScore}>
                ◆ {formatPreferenceScore(rankingScores[item.id])}
              </span>
              <span className={historical === undefined ? styles.unavailable : styles.personalRating}>
                {historicalLabel(historical)}
              </span>
              <span className={current === null ? styles.unavailable : styles.personalRating}>
                {currentLabel(current)}
              </span>
              <span className={`${styles.change} ${delta !== null && delta > 0 ? styles.up : ''} ${delta !== null && delta < 0 ? styles.down : ''}`}>
                {deltaLabel(delta)}
              </span>
            </div>
          );
        })}
      </div>
      {items.some((item) => ratingsAtCompletion[item.id] === undefined) && (
        <p className={styles.legacyNote}>
          Not recorded means this ranking was completed before historical ratings were tracked.
        </p>
      )}
    </section>
  );
}
