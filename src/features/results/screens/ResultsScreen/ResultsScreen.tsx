import { useState } from 'react';
import type { RankCollection } from '@/domain/models';
import type { RankingState } from '@/features/ranking/engine';
import type { PersonalRatingMap } from '@/features/ratings/personalRatings';
import { Button } from '@/shared/components/Button/Button';
import { RankedList } from '../../components/RankedList/RankedList';
import { ResultsSummary } from '../../components/ResultsSummary/ResultsSummary';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import styles from './ResultsScreen.module.css';

type ResultsTab = 'ranking' | 'summary';

type ResultsScreenProps = {
  collection: RankCollection;
  rankingState: RankingState;
  preferenceScores: Record<string, number>;
  personalRatings: PersonalRatingMap;
  onNewRanking: () => void;
};

export function ResultsScreen({
  collection,
  rankingState,
  preferenceScores,
  personalRatings,
  onNewRanking,
}: ResultsScreenProps) {
  const [tab, setTab] = useState<ResultsTab>('ranking');

  return (
    <ScenePanel className={styles.scene}>
      <SceneHeading className={styles.heading}>
        <div>
          <h1>{collection.name}</h1>
          <p>
            {rankingState.ranked.length} items · {rankingState.comparisons} comparisons
          </p>
        </div>

        <div className={styles.actions}>
          <Button
            variant="primary"
            size="small"
            onClick={onNewRanking}
          >
            ＋ New Ranking
          </Button>
          <Button
            size="small"
            disabled
          >
            Share
          </Button>
          <Button
            size="small"
            disabled
          >
            Export
          </Button>
        </div>
      </SceneHeading>

      <div className={styles.tabs}>
        <button
          className={tab === 'ranking' ? styles.activeTab : ''}
          onClick={() => setTab('ranking')}
        >
          Ranked List
        </button>
        <button
          className={tab === 'summary' ? styles.activeTab : ''}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
      </div>

      {tab === 'ranking' ? (
        <RankedList
          items={rankingState.ranked}
          preferenceScores={preferenceScores}
          personalRatings={personalRatings}
        />
      ) : (
        <ResultsSummary
          items={rankingState.ranked}
          comparisons={rankingState.comparisons}
          outcomes={rankingState.outcomes}
          preferenceScores={preferenceScores}
          personalRatings={personalRatings}
        />
      )}
    </ScenePanel>
  );
}
