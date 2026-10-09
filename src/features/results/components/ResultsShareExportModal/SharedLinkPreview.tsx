import { useState } from 'react';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { formatPreferenceScore, getRankAdornment, getRankStyle } from '../../model/results';
import { getSnapshotDistributions, type SharedResultsSnapshot } from '../../share/resultsShare';
import styles from './ResultsShareExportModal.module.css';

type PreviewTab = 'ranking' | 'summary';

/** A miniature, read-only representation of the actual ranked-results page. */
export function SharedLinkPreview({ snapshot }: { snapshot: SharedResultsSnapshot }) {
  const [tab, setTab] = useState<PreviewTab>('ranking');
  const ratedCount = snapshot.items.filter((item) => item.personalRating !== null).length;
  const distribution = getSnapshotDistributions(snapshot);
  const chartMaximum = Math.max(0.01, ...distribution.preference, ...distribution.personalRating);
  return (
    <div className={styles.sharedPagePreview}>
      <header className={styles.sharedPageHeading}>
        <div>
          <span className={styles.sharedPageEyebrow}>SHARED RESULTS</span>
          <h4>{snapshot.collection.name}</h4>
          <p>{snapshot.items.length} items · {snapshot.comparisons} comparisons · read-only</p>
        </div>
        <span className={styles.sharedPageBrand}>RankerUltimate</span>
      </header>
      <div className={styles.sharedPageTabs}>
        <button type="button" className={tab === 'ranking' ? styles.sharedTabActive : ''} onClick={() => setTab('ranking')}>Ranked List</button>
        <button type="button" className={tab === 'summary' ? styles.sharedTabActive : ''} onClick={() => setTab('summary')}>Summary</button>
      </div>
      {tab === 'ranking' ? (
        <div className={styles.sharedPreviewRows}>
          <div className={styles.sharedPreviewHead}>
            <span>Rank</span><span>Item</span><span>Ranking Score</span><span>Personal Rating</span>
          </div>
          {snapshot.items.map((item, index) => {
            const rankStyle = getRankStyle(index, snapshot.items.length);
            const rowStyle = rankStyle ? {
              gold: styles.sharedGold, silver: styles.sharedSilver, bronze: styles.sharedBronze,
              thirdLast: styles.sharedThirdLast, secondLast: styles.sharedSecondLast, last: styles.sharedLast,
            }[rankStyle] : '';
            return (
              <div className={`${styles.sharedPreviewRow} ${rowStyle ?? ''}`} key={item.id}>
                <div className={styles.sharedRank}><span>{getRankAdornment(index)}</span><strong>{index + 1}</strong></div>
                <div className={styles.sharedItem}>
                  {item.image ? <img src={item.image} alt="" /> : <span className={styles.sharedPosterFallback}>{item.name.slice(0, 1)}</span>}
                  <div><strong title={item.name}>{item.name}</strong>{item.subtitle && <small>{item.subtitle}</small>}</div>
                </div>
                <div className={styles.sharedScore}><span className={styles.sharedRankingScore}>◆ {formatPreferenceScore(item.preferenceScore)}</span></div>
                <div className={styles.sharedScore}><span className={`${styles.sharedPersonalRating} ${item.personalRating === null ? styles.sharedUnrated : ''}`}>★ {formatPersonalRating(item.personalRating)}</span></div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.sharedSummaryPreview}>
          <h4>Score Distribution</h4>
          <p>Ranking Score and Personal Rating are normalized separately.</p>
          <div className={styles.sharedLegend}><span>◆ Ranking Score</span><span>★ Personal Rating ({ratedCount})</span></div>
          <div className={styles.sharedDistribution}>
            {['0–2', '2–4', '4–6', '6–8', '8–10'].map((label, index) => (
              <div key={label} className={styles.sharedBucket}>
                <div className={styles.sharedBars}>
                  <i className={styles.sharedRankingBar} style={{ height: `${((distribution.preference[index] ?? 0) / chartMaximum) * 100}%` }} />
                  <i className={styles.sharedRatingBar} style={{ height: `${((distribution.personalRating[index] ?? 0) / chartMaximum) * 100}%` }} />
                </div>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <h4>Quick Stats</h4>
          <div className={styles.sharedStats}>
            <div><strong>{snapshot.items.length}</strong><span>Items Ranked</span></div>
            <div><strong>{snapshot.comparisons}</strong><span>Comparisons</span></div>
            <div><strong>{ratedCount}/{snapshot.items.length}</strong><span>Personally Rated</span></div>
            <div><strong>{snapshot.refinementCount}</strong><span>Refine Choices</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
