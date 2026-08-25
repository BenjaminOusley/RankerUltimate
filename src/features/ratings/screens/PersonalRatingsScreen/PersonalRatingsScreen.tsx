import { useMemo, useState } from 'react';
import type { RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import { formatPersonalRating } from '../../personalRating';
import { getPersonalRating, type PersonalRatingMap } from '../../personalRatings';
import { SceneHeading, ScenePanel, ScrollPanel } from '@/shared/components/Scene/Scene';
import styles from './PersonalRatingsScreen.module.css';

type PersonalRatingsScreenProps = {
  items: RankItem[];
  personalRatings: PersonalRatingMap;
  onUpdateRating: (item: RankItem, value: number | null) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function PersonalRatingsScreen({
  items,
  personalRatings,
  onUpdateRating,
  onBack,
  onContinue,
}: PersonalRatingsScreenProps) {
  const [hideRated, setHideRated] = useState(false);

  const visibleItems = useMemo(
    () =>
      hideRated ? items.filter((item) => getPersonalRating(personalRatings, item) === null) : items,
    [hideRated, items, personalRatings],
  );

  return (
    <ScenePanel className={styles.scene}>
      <SceneHeading className={styles.heading}>
        <div>
          <h1>
            Rate the items <span className={styles.optionalLabel}>(optional)</span>
          </h1>
          <p>
            Rate each item on its own. Leave it as <strong>—</strong> if you don’t want to rate it.
          </p>
        </div>

        <label className={styles.filterToggle}>
          <input
            type="checkbox"
            checked={hideRated}
            onChange={(event) => setHideRated(event.target.checked)}
          />
          Hide rated items
        </label>
      </SceneHeading>

      <ScrollPanel
        className={`${styles.grid} ${visibleItems.length === 0 ? styles.gridEmpty : ''}`}
      >
        {visibleItems.map((item) => {
          const rating = getPersonalRating(personalRatings, item);

          return (
            <article
              className={styles.card}
              key={item.id}
            >
              <Poster
                item={item}
                className={styles.poster}
              />
              <div className={styles.cardCopy}>
                <strong title={item.name}>{item.name}</strong>
                {item.subtitle && <small>{item.subtitle}</small>}
              </div>
              <select
                className={styles.ratingSelect}
                value={rating ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdateRating(item, value === '' ? null : Number(value));
                }}
                aria-label={`Personal rating for ${item.name}`}
              >
                <option value="">—</option>
                {Array.from({ length: 20 }, (_, index) => (index + 1) / 2).map((value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {formatPersonalRating(value)}
                  </option>
                ))}
              </select>
            </article>
          );
        })}

        {visibleItems.length === 0 && (
          <div className={styles.emptyState}>Everything here already has a rating.</div>
        )}
      </ScrollPanel>

      <div className={styles.footerActions}>
        <Button onClick={onBack}>Back</Button>
        <Button
          variant="primary"
          onClick={onContinue}
        >
          Continue to Results
        </Button>
      </div>
    </ScenePanel>
  );
}
