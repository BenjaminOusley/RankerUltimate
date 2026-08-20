import { useState } from 'react';
import './App.css';

import { mcuMovies } from './data/mcu';
import type { RankItem } from './types';

type RankingState = {
  ranked: RankItem[];
  remaining: RankItem[];
  current: RankItem | null;
  low: number;
  high: number;
  comparisons: number;
};

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
  const collection = mcuMovies;

  const [rankingState, setRankingState] = useState<RankingState>(() =>
    createInitialState(collection.items),
  );

  const [history, setHistory] = useState<RankingState[]>([]);

  const {
    ranked,
    remaining,
    current,
    low,
    high,
    comparisons,
  } = rankingState;

  const comparisonIndex = current
    ? Math.floor((low + high) / 2)
    : null;

  const opponent =
    comparisonIndex !== null ? ranked[comparisonIndex] : null;

  function choose(winner: RankItem) {
    if (!current || !opponent || comparisonIndex === null) {
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
    setRankingState(createInitialState(collection.items));
    setHistory([]);
  }

  const completed = current === null;

  if (completed) {
    return (
      <main className="app">
        <section className="results">
          <h1>{collection.name}</h1>

          <p className="subtitle">
            Ranking complete after {comparisons} comparisons.
          </p>

          <div className="ranking-list">
            {ranked.map((item, index) => (
              <div className="ranking-row" key={item.id}>
                <span className="rank-number">
                  {index + 1}
                </span>

                <div>
                  <strong>{item.name}</strong>

                  {item.subtitle && (
                    <div className="item-subtitle">
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="actions">
            <button onClick={undo} disabled={history.length === 0}>
              Undo
            </button>

            <button onClick={reset}>
              Rank Again
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!current || !opponent) {
    return null;
  }

  const itemsPlaced = ranked.length;

  return (
    <main className="app">
      <header className="header">
        <h1>RankerUltimate</h1>

        <p>{collection.name}</p>
      </header>

      <section className="comparison">
        <h2>Which do you prefer?</h2>

        <div className="cards">
          <button
            className="item-card"
            onClick={() => choose(current)}
          >
            <div className="poster-placeholder">
              {current.name.charAt(0)}
            </div>

            <span className="item-name">
              {current.name}
            </span>

            {current.subtitle && (
              <span className="item-subtitle">
                {current.subtitle}
              </span>
            )}
          </button>

          <div className="versus">
            VS
          </div>

          <button
            className="item-card"
            onClick={() => choose(opponent)}
          >
            <div className="poster-placeholder">
              {opponent.name.charAt(0)}
            </div>

            <span className="item-name">
              {opponent.name}
            </span>

            {opponent.subtitle && (
              <span className="item-subtitle">
                {opponent.subtitle}
              </span>
            )}
          </button>
        </div>
      </section>

      <section className="status">
        <div>
          {itemsPlaced} of {collection.items.length} items placed
        </div>

        <div>
          {comparisons} comparisons
        </div>

        <button
          className="undo-button"
          onClick={undo}
          disabled={history.length === 0}
        >
          Undo
        </button>

        <button
          className="reset-button"
          onClick={reset}
        >
          Restart
        </button>
      </section>
    </main>
  );
}

export default App;