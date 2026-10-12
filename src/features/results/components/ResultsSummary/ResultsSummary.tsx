import type { RankItem } from '@/domain/models';
import type { ComparisonOutcome } from '@/features/ranking/engine';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { getBiggestSurprises } from '../../model/surprises';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import { Poster } from '@/shared/components/Poster/Poster';
import { formatPreferenceScore, getDistribution } from '../../model/results';
import { ScrollPanel } from '@/shared/components/Scene/Scene';
import { RatingHistoryComparison } from '@/features/myRankings/components/RatingHistoryComparison';
import styles from './ResultsSummary.module.css';

type ResultsSummaryProps = {
  items: RankItem[];
  comparisons: number;
  outcomes?: ComparisonOutcome[];
  refinementCount?: number;
  ratingsAtCompletion?: Readonly<Record<string, number | null | undefined>>;
  preferenceScores: Record<string, number>;
  personalRatings: PersonalRatingMap;
};

export function ResultsSummary({
  items,
  comparisons,
  outcomes,
  refinementCount,
  ratingsAtCompletion,
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
  const resolvedRefinementCount =
    refinementCount ?? outcomes?.filter((outcome) => outcome.phase === 'refinement').length ?? 0;

  // Saved rankings compare original Ranking Scores with the Personal Ratings recorded
  // at completion. Do not reconstruct missing history from current global ratings.
  const surprises = getBiggestSurprises(
    items,
    preferenceScores,
    personalRatings,
    ratingsAtCompletion,
  );

  return (
    <ScrollPanel className={styles.panel}>
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Score Distribution</h2>
            <p>Ranking Score and Personal Rating are normalized separately.</p>
          </div>
          <div className={styles.legend}>
            <span>
              <i className={styles.legendPreference} /> Ranking Score
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
                  title={`Ranking Score: ${(preferenceDistribution[index] * 100).toFixed(0)}%`}
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
            <strong>{resolvedRefinementCount}</strong>
            <span>Refine Choices</span>
          </div>
        </div>
      </section>

      {ratingsAtCompletion && (
        <RatingHistoryComparison
          items={items}
          rankingScores={preferenceScores}
          ratingsAtCompletion={ratingsAtCompletion}
          personalRatings={personalRatings}
        />
      )}

      {surprises.length > 0 && (
        <section className={styles.section}>
          <h2>Biggest Surprises{ratingsAtCompletion ? ' at Completion' : ''}</h2>
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
                    {ratingsAtCompletion ? 'At completion, you rated it ' : 'You rated it '}
                    {formatPersonalRating(rating)}, but it landed #{rank} with a{' '}
                    {formatPreferenceScore(preference)} Ranking Score.
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
