import { useState } from 'react';
import './App.css';

import { collections } from './data/collections';
import type { RankCollection, RankItem } from './types';

import ItemCard from './components/ItemCard';

type RankingState = {
  ranked: RankItem[];
  remaining: RankItem[];
  current: RankItem | null;
  low: number;
  high: number;
  comparisons: number;
};

type DebugPanelProps = {
  collection: RankCollection | null;
  rankingState: RankingState | null;
  history: RankingState[];
};

function DebugPanel({ collection, rankingState, history }: DebugPanelProps) {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <details className="debug-panel">
      <summary>Developer State</summary>

      <pre>
        {JSON.stringify(
          {
            collection: collection?.id ?? null,

            ranked: rankingState?.ranked.map((item) => item.id) ?? [],

            remaining: rankingState?.remaining.map((item) => item.id) ?? [],

            current: rankingState?.current?.id ?? null,

            low: rankingState?.low ?? null,

            high: rankingState?.high ?? null,

            comparisons: rankingState?.comparisons ?? null,

            historyLength: history.length,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

function createInitialState(items: RankItem[]): RankingState {
  if (items.length === 0) {
    return {
      ranked: [],
      remaining: [],
      current: null,
      low: 0,
      high: 0,
      comparisons: 0,
    };
  }

  if (items.length === 1) {
    return {
      ranked: [items[0]],
      remaining: [],
      current: null,
      low: 0,
      high: 1,
      comparisons: 0,
    };
  }

  return {
    ranked: [items[0]],
    current: items[1],
    remaining: items.slice(2),
    low: 0,
    high: 1,
    comparisons: 0,
  };
}

function App() {
  const [collection, setCollection] = useState<RankCollection | null>(null);

  const [rankingState, setRankingState] = useState<RankingState | null>(null);

  const [history, setHistory] = useState<RankingState[]>([]);

  function startCollection(selectedCollection: RankCollection) {
    setCollection(selectedCollection);
    setRankingState(createInitialState(selectedCollection.items));
    setHistory([]);
  }

  function returnToCollections() {
    setCollection(null);
    setRankingState(null);
    setHistory([]);
  }

  function choose(winner: RankItem) {
    if (!rankingState) {
      return;
    }

    const { ranked, remaining, current, low, high, comparisons } = rankingState;

    if (!current) {
      return;
    }

    const comparisonIndex = Math.floor((low + high) / 2);

    const opponent = ranked[comparisonIndex];

    if (!opponent) {
      return;
    }

    setHistory((previous) => [...previous, rankingState]);

    let nextLow = low;
    let nextHigh = high;

    if (winner.id === current.id) {
      nextHigh = comparisonIndex;
    } else {
      nextLow = comparisonIndex + 1;
    }

    const nextComparisonCount = comparisons + 1;

    if (nextLow >= nextHigh) {
      const newRanked = [...ranked];

      newRanked.splice(nextLow, 0, current);

      const nextCurrent = remaining[0] ?? null;

      const nextRemaining = remaining.slice(1);

      setRankingState({
        ranked: newRanked,
        remaining: nextRemaining,
        current: nextCurrent,
        low: 0,
        high: newRanked.length,
        comparisons: nextComparisonCount,
      });

      return;
    }

    setRankingState({
      ...rankingState,
      low: nextLow,
      high: nextHigh,
      comparisons: nextComparisonCount,
    });
  }

  function undo() {
    if (history.length === 0) {
      return;
    }

    const previousState = history[history.length - 1];

    setRankingState(previousState);

    setHistory((previous) => previous.slice(0, -1));
  }

  function reset() {
    if (!collection) {
      return;
    }

    setRankingState(createInitialState(collection.items));
    setHistory([]);
  }

  if (!collection || !rankingState) {
    return (
      <main className="app">
        <header className="header">
          <h1>RankerUltimate</h1>
          <p>Choose something to rank.</p>
        </header>

        <section className="collection-picker">
          {collections.map((item) => (
            <button
              className="collection-card"
              key={item.id}
              onClick={() => startCollection(item)}
            >
              <span className="collection-name">{item.name}</span>

              <span className="collection-count">{item.items.length} items</span>

              {item.description && (
                <span className="collection-description">{item.description}</span>
              )}
            </button>
          ))}
        </section>
        <DebugPanel
          collection={collection}
          rankingState={rankingState}
          history={history}
        />
      </main>
    );
  }

  const { ranked, current, low, high, comparisons } = rankingState;

  const completed = current === null;

  if (completed) {
    return (
      <main className="app">
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
              onClick={undo}
              disabled={history.length === 0}
            >
              Undo
            </button>

            <button onClick={reset}>Rank Again</button>

            <button onClick={returnToCollections}>Choose Another List</button>
          </div>
        </section>

        <DebugPanel
          collection={collection}
          rankingState={rankingState}
          history={history}
        />
      </main>
    );
  }

  const comparisonIndex = Math.floor((low + high) / 2);

  const opponent = ranked[comparisonIndex];

  if (!opponent) {
    return null;
  }

  return (
    <main className="app">
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
            onClick={() => choose(current)}
          />

          <div className="versus">VS</div>

          <ItemCard
            key={opponent.id}
            item={opponent}
            onClick={() => choose(opponent)}
          />
        </div>
      </section>

      <section className="status">
        <div>
          {ranked.length} of {collection.items.length} items placed
        </div>

        <div>{comparisons} comparisons</div>

        <button
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </button>

        <button onClick={reset}>Restart</button>

        <button onClick={returnToCollections}>Collections</button>
      </section>

      <DebugPanel
        collection={collection}
        rankingState={rankingState}
        history={history}
      />
    </main>
  );
}

export default App;
