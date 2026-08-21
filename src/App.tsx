import { useState } from 'react';

import './App.css';

import { generateCollection } from './api/generateCollection';
import { searchPeople } from './api/searchpeople';

import CollectionGenerator from './components/CollectionGenerator';
import CollectionPicker from './components/CollectionPicker';
import CollectionReview from './components/CollectionReview';
import DebugPanel from './components/DebugPanel';
import RankingScreen from './components/RankingScreen';
import ResultsScreen from './components/ResultsScreen';

import { collections } from './data/collections';

import type { GenerationRequest, RankCollection, RankItem } from './models';

import { chooseWinner, createInitialRankingState } from './ranking/ranker';

import type { RankingState } from './ranking/state';

type AppScreen = 'collections' | 'create' | 'review' | 'ranking';

type ReviewBackScreen = 'collections' | 'create';

function App() {
  const [collection, setCollection] = useState<RankCollection | null>(null);

  const [rankingState, setRankingState] = useState<RankingState | null>(null);

  const [history, setHistory] = useState<RankingState[]>([]);

  const [screen, setScreen] = useState<AppScreen>('collections');
  const [reviewBackScreen, setReviewBackScreen] = useState<ReviewBackScreen>('collections');

  const [lastGenerationRequest, setLastGenerationRequest] = useState<GenerationRequest | null>(
    null,
  );

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  function selectCollection(
    selectedCollection: RankCollection,
    backScreen: ReviewBackScreen = 'collections',
  ) {
    setCollection(selectedCollection);

    setSelectedItemIds(new Set(selectedCollection.items.map((item) => item.id)));

    setRankingState(null);
    setHistory([]);
    setReviewBackScreen(backScreen);
    setScreen('review');
  }

  function openCollectionGenerator() {
    setLastGenerationRequest(null);

    setScreen('create');
  }

  async function generateRequestedCollection(request: GenerationRequest) {
    const generatedCollection = await generateCollection(request);

    setLastGenerationRequest({
      ...request,
      tmdbId: null,
    });

    selectCollection(generatedCollection, 'create');
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

  function returnFromReview() {
    if (reviewBackScreen === 'create') {
      setCollection(null);
      setRankingState(null);

      setSelectedItemIds(new Set());

      setHistory([]);
      setScreen('create');

      return;
    }

    returnToCollections();
  }

  function returnToCollections() {
    setReviewBackScreen('collections');

    setLastGenerationRequest(null);
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
        <CollectionPicker
          collections={collections}
          onSelect={selectCollection}
          onCreate={openCollectionGenerator}
        />

        <DebugPanel
          collection={collection}
          rankingState={rankingState}
          history={history}
        />
      </main>
    );
  }

  if (screen === 'create') {
    return (
      <main className="app">
        <CollectionGenerator
          initialRequest={lastGenerationRequest}
          onGenerate={generateRequestedCollection}
          onSearchPeople={searchPeople}
          onBack={returnToCollections}
        />

        <DebugPanel
          collection={collection}
          rankingState={rankingState}
          history={history}
        />
      </main>
    );
  }

  if (!collection) {
    return null;
  }

  if (screen === 'review') {
    return (
      <main className="app">
        <CollectionReview
          collection={collection}
          selectedItemIds={selectedItemIds}
          onToggleItem={toggleItem}
          onSelectAll={selectAllItems}
          onClearAll={clearAllItems}
          onBack={returnFromReview}
          onStart={startRanking}
        />

        <DebugPanel
          collection={collection}
          rankingState={rankingState}
          history={history}
        />
      </main>
    );
  }

  if (!rankingState) {
    return null;
  }

  const completed = rankingState.current === null;

  return (
    <main className="app">
      {completed ? (
        <ResultsScreen
          collection={collection}
          rankingState={rankingState}
          historyLength={history.length}
          onUndo={undo}
          onRankAgain={reset}
          onChooseAnotherList={returnToCollections}
        />
      ) : (
        <RankingScreen
          collection={collection}
          rankingState={rankingState}
          selectedCount={selectedItemIds.size}
          historyLength={history.length}
          onChoose={choose}
          onUndo={undo}
          onRestart={reset}
          onCollections={returnToCollections}
        />
      )}

      <DebugPanel
        collection={collection}
        rankingState={rankingState}
        history={history}
      />
    </main>
  );
}

export default App;
