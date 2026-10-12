import { useMemo, useState } from 'react';
import { Button } from '@/shared/components/Button/Button';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import type { PersonalRatingMap } from '@/features/ratings/personalRatings';
import { RankedList } from '@/features/results/components/RankedList/RankedList';
import { ResultsSummary } from '@/features/results/components/ResultsSummary/ResultsSummary';
import { ResultsShareExportModal } from '@/features/results/components/ResultsShareExportModal/ResultsShareExportModal';
import { SaveRankingModal } from '../../components/SaveRankingModal';
import { rankingToLiveSnapshot, rankingToResultsData, type StoredRanking } from '../../model/savedRankings';
import styles from '@/features/results/screens/ResultsScreen/ResultsScreen.module.css';

type Props = {
  ranking: StoredRanking;
  rankings: readonly StoredRanking[];
  personalRatings: PersonalRatingMap;
  onBack: () => void;
  onSave: (overwriteId?: string) => Promise<void>;
};

export function StoredRankingResultsScreen({ ranking, rankings, personalRatings, onBack, onSave }: Props) {
  const [tab, setTab] = useState<'ranking' | 'summary'>('ranking');
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);
  const data = useMemo(() => rankingToResultsData(ranking), [ranking]);
  const snapshot = useMemo(() => rankingToLiveSnapshot(ranking, personalRatings), [ranking, personalRatings]);
  const ratingsAtCompletion = useMemo(
    () => Object.fromEntries(ranking.items.map((item) => [item.id, item.personalRatingAtCompletion])),
    [ranking],
  );
  return (
    <>
      <ScenePanel className={styles.scene}>
        <SceneHeading className={styles.heading}>
          <div><h1>{ranking.name}</h1><p>{ranking.items.length} items · {ranking.comparisons} comparisons</p></div>
          <div className={styles.actions}>
            <Button size="small" onClick={onBack}>← My Rankings</Button>
            {!ranking.savedAt && <Button variant="primary" size="small" onClick={() => setSaving(true)}>Save Ranking</Button>}
            <Button size="small" onClick={() => setSharing(true)}>Share / Export</Button>
          </div>
        </SceneHeading>
        <div className={styles.tabs}>
          <button className={tab === 'ranking' ? styles.activeTab : ''} onClick={() => setTab('ranking')}>Ranked List</button>
          <button className={tab === 'summary' ? styles.activeTab : ''} onClick={() => setTab('summary')}>Summary</button>
        </div>
        {tab === 'ranking' ? (
          <RankedList items={data.items} preferenceScores={data.rankingScores} personalRatings={personalRatings} />
        ) : (
          <ResultsSummary items={data.items} comparisons={ranking.comparisons} refinementCount={ranking.refinementCount}
            preferenceScores={data.rankingScores} personalRatings={personalRatings}
            ratingsAtCompletion={ratingsAtCompletion} />
        )}
      </ScenePanel>
      <ResultsShareExportModal open={sharing} snapshot={snapshot} onClose={() => setSharing(false)} />
      {saving && <SaveRankingModal collectionId={ranking.collectionId} savedRankings={rankings}
        onSave={onSave} onClose={() => setSaving(false)} />}
    </>
  );
}
