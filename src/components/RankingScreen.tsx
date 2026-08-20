import type { RankCollection, RankItem } from '../models';

import type { RankingState } from '../ranking/state';

import ItemCard from './ItemCard';

type RankingScreenProps = {
  collection: RankCollection;
  rankingState: RankingState;
  selectedCount: number;
  historyLength: number;
  onChoose: (winner: RankItem) => void;
  onUndo: () => void;
  onRestart: () => void;
  onCollections: () => void;
};

function RankingScreen({
  collection,
  rankingState,
  selectedCount,
  historyLength,
  onChoose,
  onUndo,
  onRestart,
  onCollections,
}: RankingScreenProps) {
  const { ranked, current, low, high, comparisons } = rankingState;

  if (!current) {
    return null;
  }

  const comparisonIndex = Math.floor((low + high) / 2);

  const opponent = ranked[comparisonIndex];

  if (!opponent) {
    return null;
  }

  return (
    <>
      <header className="header">
        <h1>RankerUltimate</h1>
        <p>{collection.name}</p>
      </header>

      <section className="comparison">
        <h2>Which do you prefer?</h2>

        <div className="cards">
          <ItemCard
            key={current.id}
            item={current}
            onClick={() => onChoose(current)}
          />

          <div className="versus">VS</div>

          <ItemCard
            key={opponent.id}
            item={opponent}
            onClick={() => onChoose(opponent)}
          />
        </div>
      </section>

      <section className="status">
        <div>
          {ranked.length} of {selectedCount} items placed
        </div>

        <div>{comparisons} comparisons</div>

        <button
          type="button"
          onClick={onUndo}
          disabled={historyLength === 0}
        >
          Undo
        </button>

        <button
          type="button"
          onClick={onRestart}
        >
          Restart
        </button>

        <button
          type="button"
          onClick={onCollections}
        >
          Collections
        </button>
      </section>
    </>
  );
}

export default RankingScreen;
