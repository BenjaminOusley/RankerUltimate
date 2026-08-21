import type { RankCollection } from '../models';
import type { RankingState } from '../ranking/state';

type ResultsScreenProps = {
  collection: RankCollection;
  rankingState: RankingState;
  historyLength: number;
  onUndo: () => void;
  onRankAgain: () => void;
};

function ResultsScreen({
  collection,
  rankingState,
  historyLength,
  onUndo,
  onRankAgain,
}: ResultsScreenProps) {
  const { ranked, comparisons } = rankingState;

  return (
    <section className="results">
      <h1>{collection.name}</h1>

      <p className="subtitle">Ranking complete after {comparisons} comparisons.</p>

      <div className="ranking-list">
        {ranked.map((item, index) => (
          <div
            className="ranking-row"
            key={item.id}
          >
            <span className="rank-number">{index + 1}</span>

            <div>
              <strong>{item.name}</strong>

              {item.subtitle && <div className="item-subtitle">{item.subtitle}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={historyLength === 0}
        >
          Undo
        </button>

        <button
          type="button"
          onClick={onRankAgain}
        >
          Rank Again
        </button>
      </div>
    </section>
  );
}

export default ResultsScreen;
