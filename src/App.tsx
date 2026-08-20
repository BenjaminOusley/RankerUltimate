import { useState } from 'react';
import './App.css';

import { collections } from './data/collections';
import type { RankCollection, RankItem } from './types';

import { chooseWinner, createInitialRankingState } from './ranking/ranker';
import type { RankingState } from './ranking/types';

import ItemCard from './components/ItemCard';

type DebugPanelProps = {
  collection: RankCollection | null;
  rankingState: RankingState | null;
  history: RankingState[];
};

type AppScreen = 'collections' | 'review' | 'ranking';

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

            currentSource: rankingState?.current?.source ?? null,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

function App() {
  const [collection, setCollection] = useState<RankCollection | null>(null);

  const [rankingState, setRankingState] = useState<RankingState | null>(null);

  const [history, setHistory] = useState<RankingState[]>([]);

  const [screen, setScreen] = useState<AppScreen>('collections');

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  function selectCollection(selectedCollection: RankCollection) {
    setCollection(selectedCollection);

    setSelectedItemIds(new Set(selectedCollection.items.map((item) => item.id)));

    setRankingState(null);
    setHistory([]);
    setScreen('review');
  }

  function startRanking() {
    if (!collection) {
      return;
    }

    const selectedItems = collection.items.filter((item) => selectedItemIds.has(item.id));

    if (selectedItems.length < 2) {
      return;
    }

    setRankingState(createInitialRankingState(selectedItems));

    setHistory([]);
    setScreen('ranking');
  }

  function toggleItem(itemId: string) {
    setSelectedItemIds((previous) => {
      const next = new Set(previous);

      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }

      return next;
    });
  }

  function selectAllItems() {
    if (!collection) {
      return;
    }

    setSelectedItemIds(new Set(collection.items.map((item) => item.id)));
  }

  function clearAllItems() {
    setSelectedItemIds(new Set());
  }

  function returnToCollections() {
    setCollection(null);
    setRankingState(null);
    setSelectedItemIds(new Set());
    setHistory([]);
    setScreen('collections');
  }

  function choose(winner: RankItem) {
    if (!rankingState) {
      return;
    }

    const previousState = rankingState;
    const nextState = chooseWinner(previousState, winner);

    setHistory((previous) => [...previous, previousState]);

    setRankingState(nextState);
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

    const selectedItems = collection.items.filter((item) => selectedItemIds.has(item.id));

    if (selectedItems.length < 2) {
      return;
    }

    setRankingState(createInitialRankingState(selectedItems));
    setHistory([]);
  }

  if (screen === 'collections') {
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
              onClick={() => selectCollection(item)}
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

  if (screen === 'review' && collection) {
    return (
      <main className="app">
        <header className="header">
          <h1>{collection.name}</h1>

          <p>Choose which items you want to rank.</p>
        </header>

        <section className="review">
          <div className="review-toolbar">
            <strong>
              {selectedItemIds.size} of {collection.items.length} selected
            </strong>

            <div className="review-actions">
              <button onClick={selectAllItems}>Select All</button>

              <button onClick={clearAllItems}>Clear All</button>
            </div>
          </div>

          <div className="review-grid">
            {collection.items.map((item) => {
              const selected = selectedItemIds.has(item.id);

              return (
                <label
                  className={`review-item ${selected ? 'review-item-selected' : ''}`}
                  key={item.id}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleItem(item.id)}
                  />

                  <div className="review-image-wrapper">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        className="review-image"
                      />
                    ) : (
                      <div className="review-placeholder">{item.name.charAt(0)}</div>
                    )}
                  </div>

                  <div className="review-item-info">
                    <strong>{item.name}</strong>

                    {item.subtitle && <span>{item.subtitle}</span>}
                  </div>
                </label>
              );
            })}
          </div>

          <div className="actions">
            <button onClick={returnToCollections}>Back</button>

            <button
              onClick={startRanking}
              disabled={selectedItemIds.size < 2}
            >
              Rank {selectedItemIds.size} Items
            </button>
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

  if (!rankingState || !collection) {
    return null;
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
          {ranked.length} of {selectedItemIds.size} items placed
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
