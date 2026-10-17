import { useMemo, useState } from 'react';
import type { RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import { RatingPicker } from '../../components/RatingPicker/RatingPicker';
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
    () => hideRated ? items.filter((item) => getPersonalRating(personalRatings, item) === null) : items,
    [hideRated, items, personalRatings],
  );
  const manyItems = visibleItems.length > 8;

  return (
    <ScenePanel className={`${styles.scene} ${manyItems ? styles.sceneLarge : ''}`}>
      <SceneHeading className={styles.heading}>
        <div>
          <h1>Rate the items <span className={styles.optionalLabel}>(optional)</span></h1>
          <p>Personal Ratings are separate from your comparison-based Ranking Scores.</p>
        </div>
        <label className={styles.filterToggle}>
          <input type="checkbox" checked={hideRated}
            onChange={(event) => setHideRated(event.target.checked)} />
          Hide rated items
        </label>
      </SceneHeading>

      <ScrollPanel className={styles.content}>
        <div className={styles.intro}>
          <strong>{visibleItems.length === 0
            ? 'All caught up!'
            : `${visibleItems.length} ${visibleItems.length === 1 ? 'item' : 'items'} ready to rate`}</strong>
          <span>{visibleItems.length === 0
            ? 'Everything in this selection already has a Personal Rating.'
            : 'Rate any item, or skip directly to your results.'}</span>
        </div>
        {visibleItems.length > 0 && <div className={styles.grid}>
          {visibleItems.map((item) => {
            const rating = getPersonalRating(personalRatings, item);
            return <article className={styles.card} key={item.id}>
              <Poster item={item} className={styles.poster} />
              <div className={styles.cardCopy}>
                <strong title={item.name}>{item.name}</strong>
                {item.subtitle && <small title={item.subtitle}>{item.subtitle}</small>}
                <RatingPicker value={rating} onChange={(value) => onUpdateRating(item, value)}
                  label={`Personal rating for ${item.name}`} />
              </div>
            </article>;
          })}
        </div>}
        {!manyItems && <div className={styles.footerActions}>
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={onContinue}>Continue to Results →</Button>
        </div>}
        {!manyItems && <p className={styles.hint}>
          You can change these ratings later in Global Ratings. Leave an item unrated to skip it.
        </p>}
      </ScrollPanel>
      {manyItems && <div className={styles.footerActions}>
        <Button onClick={onBack}>Back</Button>
        <span className={styles.footerHint}>Ratings can be changed later in Global Ratings.</span>
        <Button variant="primary" onClick={onContinue}>Continue to Results →</Button>
      </div>}
    </ScenePanel>
  );
}
