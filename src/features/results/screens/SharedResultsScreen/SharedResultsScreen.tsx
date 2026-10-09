import { useEffect, useMemo, useState } from 'react';

import { RankedList } from '../../components/RankedList/RankedList';
import { ResultsSummary } from '../../components/ResultsSummary/ResultsSummary';
import {
  fetchSharedResultsSnapshot,
  snapshotToResultsData,
  type SharedResultsSnapshot,
} from '../../share/resultsShare';
import { Button } from '@/shared/components/Button/Button';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import styles from './SharedResultsScreen.module.css';

type ResultsTab = 'ranking' | 'summary';

type SharedResultsScreenProps = {
  shareId: string;
};

export function SharedResultsScreen({ shareId }: SharedResultsScreenProps) {
  const [snapshot, setSnapshot] = useState<SharedResultsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<ResultsTab>('ranking');

  useEffect(() => {
    let canceled = false;

    void fetchSharedResultsSnapshot(shareId)
      .then((result) => {
        if (!canceled) {
          setSnapshot(result);
        }
      })
      .catch((reason: unknown) => {
        if (!canceled) {
          setError(
            reason instanceof Error ? reason.message : 'Could not load these shared results.',
          );
        }
      });

    return () => {
      canceled = true;
    };
  }, [shareId]);

  const resultData = useMemo(() => (snapshot ? snapshotToResultsData(snapshot) : null), [snapshot]);

  if (error) {
    return (
      <ScenePanel className={styles.messagePanel}>
        <div>
          <span className={styles.eyebrow}>Shared Results</span>
          <h1>That ranking could not be loaded.</h1>
          <p>{error}</p>
          <Button
            variant="primary"
            onClick={() => window.location.assign(window.location.origin)}
          >
            Open RankerUltimate
          </Button>
        </div>
      </ScenePanel>
    );
  }

  if (!snapshot || !resultData) {
    return (
      <ScenePanel className={styles.messagePanel}>
        <div>
          <span className={styles.eyebrow}>Shared Results</span>
          <h1>Loading ranking…</h1>
          <p>Fetching the read-only results snapshot.</p>
        </div>
      </ScenePanel>
    );
  }

  return (
    <ScenePanel className={styles.scene}>
      <SceneHeading className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Shared Results</span>
          <h1>{snapshot.collection.name}</h1>
          <p>
            {snapshot.items.length} items · {snapshot.comparisons} comparisons · read-only
          </p>
        </div>

        <Button
          variant="primary"
          size="small"
          onClick={() => window.location.assign(window.location.origin)}
        >
          Open RankerUltimate
        </Button>
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
          items={resultData.items}
          preferenceScores={resultData.preferenceScores}
          personalRatings={resultData.personalRatings}
          ratingLabel="Personal Rating"
        />
      ) : (
        <ResultsSummary
          items={resultData.items}
          comparisons={snapshot.comparisons}
          refinementCount={snapshot.refinementCount}
          preferenceScores={resultData.preferenceScores}
          personalRatings={resultData.personalRatings}
        />
      )}
    </ScenePanel>
  );
}
