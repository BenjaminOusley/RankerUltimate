import type { RankItem } from '@/domain/models';
import type { ComparisonOutcome } from '@/features/ranking/engine';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import { Poster } from '@/shared/components/Poster/Poster';
import { formatPreferenceScore, getDistribution } from '../../model/results';
import { ScrollPanel } from '@/shared/components/Scene/Scene';
import styles from './ResultsSummary.module.css';

type ResultsSummaryProps = {
  items: RankItem[];
  comparisons: number;
  outcomes: ComparisonOutcome[];
  preferenceScores: Record<string, number>;
  personalRatings: PersonalRatingMap;
};

export function ResultsSummary({
  items,
  comparisons,
  outcomes,
  preferenceScores,
  personalRatings,
}: ResultsSummaryProps) {
  const ratedItems = items.filter((item) => getPersonalRating(personalRatings, item) !== null);

  const preferenceDistribution = getDistribution(
    items.map((item) => preferenceScores[item.id] ?? 0),
  );
  const ratingDistribution = getDistribution(
    ratedItems.map((item) => getPersonalRating(personalRatings, item) ?? 0),
  );
  const maxDistribution = Math.max(0.01, ...preferenceDistribution, ...ratingDistribution);

  const surprises = ratedItems
    .map((item) => ({
      item,
      rating: getPersonalRating(personalRatings, item) ?? 0,
      preference: preferenceScores[item.id] ?? 0,
      difference: Math.abs(
        (getPersonalRating(personalRatings, item) ?? 0) - (preferenceScores[item.id] ?? 0),
      ),
      rank: items.findIndex((rankedItem) => rankedItem.id === item.id) + 1,
    }))
    .sort((left, right) => right.difference - left.difference)
    .slice(0, 3);

  return (
    <ScrollPanel className={styles.panel}>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Score Distribution</h2>
            <p>Preference and Personal Rating are normalized separately.</p>
          </div>
          <div className={styles.legend}>
            <span>
              <i className={styles.legendPreference} /> Preference
            </span>
            <span>
              <i className={styles.legendRating} /> Personal Rating ({ratedItems.length})
            </span>
          </div>
        </div>

        <div className={styles.distributionChart}>
          {['0–2', '2–4', '4–6', '6–8', '8–10'].map((label, index) => (
            <div
              className={styles.distributionGroup}
              key={label}
            >
              <div className={styles.distributionBars}>
                <div
                  className={`${styles.distributionBar} ${styles.barPreference}`}
                  style={{
                    height: `${(preferenceDistribution[index] / maxDistribution) * 100}%`,
                  }}
                  title={`Preference: ${(preferenceDistribution[index] * 100).toFixed(0)}%`}
                />
                <div
                  className={`${styles.distributionBar} ${styles.barRating}`}
                  style={{
                    height: `${(ratingDistribution[index] / maxDistribution) * 100}%`,
                  }}
                  title={`Personal Rating: ${(ratingDistribution[index] * 100).toFixed(0)}%`}
                />
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Quick Stats</h2>
        <div className={styles.statGrid}>
          <div className={styles.statCard}>
            <strong>{items.length}</strong>
            <span>Items Ranked</span>
          </div>
          <div className={styles.statCard}>
            <strong>{comparisons}</strong>
            <span>Comparisons</span>
          </div>
          <div className={styles.statCard}>
            <strong>
              {ratedItems.length}/{items.length}
            </strong>
            <span>Personally Rated</span>
          </div>
          <div className={styles.statCard}>
            <strong>{outcomes.filter((outcome) => outcome.phase === 'refinement').length}</strong>
            <span>Refine Choices</span>
          </div>
        </div>
      </section>

      {surprises.length > 0 && (
        <section className={styles.section}>
          <h2>Biggest Surprises</h2>
          <div className={styles.surpriseList}>
            {surprises.map(({ item, rating, preference, rank }) => (
              <div
                className={styles.surpriseRow}
                key={item.id}
              >
                <Poster
                  item={item}
                  className={styles.poster}
                />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    You rated it {formatPersonalRating(rating)}, but it landed #{rank} with a{' '}
                    {formatPreferenceScore(preference)} Preference Score.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </ScrollPanel>
  );
}
