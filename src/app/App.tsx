import { useEffect, useMemo, useState } from 'react';
import './legacy.css';

import { AppShell } from './AppShell';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Logo } from '@/shared/components/Logo/Logo';
import { collections } from '@/data/collections';
import { useCollectionLibrary } from '@/features/collections/hooks/useCollectionLibrary';
import { CollectionPickerScreen } from '@/features/collections/screens/CollectionPickerScreen/CollectionPickerScreen';
import { CollectionReviewScreen } from '@/features/collections/screens/CollectionReviewScreen/CollectionReviewScreen';
import { CollectionsScreen } from '@/features/collections/screens/CollectionsScreen/CollectionsScreen';
import type { RankCollection, RankItem } from '@/models';
import { FinalChoiceCheckpoint } from '@/features/ranking/components/FinalChoiceCheckpoint/FinalChoiceCheckpoint';
import {
  applyRefinementChoice,
  buildRefinementPairs,
  calculatePreferenceScores,
  chooseRankingWinner,
  createInitialRankingState,
  getCurrentOpponent,
  shuffleItems,
  type ComparisonOutcome,
  type RankingState,
  type RefinementPair,
} from '@/features/ranking/engine';
import { RankingCompleteScreen } from '@/features/ranking/screens/RankingCompleteScreen/RankingCompleteScreen';
import { RankingScreen } from '@/features/ranking/screens/RankingScreen/RankingScreen';
import { RefinementCompleteScreen } from '@/features/ranking/screens/RefinementCompleteScreen/RefinementCompleteScreen';
import { RefinementScreen } from '@/features/ranking/screens/RefinementScreen/RefinementScreen';
import { usePersonalRatings } from '@/features/ratings/hooks/usePersonalRatings';
import { PersonalRatingsScreen } from '@/features/ratings/screens/PersonalRatingsScreen/PersonalRatingsScreen';
import { ResultsScreen } from '@/features/results/screens/ResultsScreen/ResultsScreen';

type AppScreen =
  | 'home'
  | 'collections'
  | 'manageCollections'
  | 'review'
  | 'ranking'
  | 'rankingComplete'
  | 'refinement'
  | 'refinementComplete'
  | 'ratings'
  | 'results';


type RefinementSnapshot = {
  rankingState: RankingState;
  refinementIndex: number;
};

type RecoveryPayload = {
  version: 1;
  collectionId: string;
  selectedItemIds: string[];
  rankingState: RankingState;
  rankingHistory: RankingState[];
  screen: Extract<
    AppScreen,
    'ranking' | 'rankingComplete' | 'refinement' | 'refinementComplete' | 'ratings'
  >;
  refinementPairs: RefinementPair[];
  refinementIndex: number;
  refinementHistory: RefinementSnapshot[];
  ratingOrderIds: string[];
  ratingBackScreen: 'rankingComplete' | 'refinementComplete';
};

const RECOVERY_KEY = 'rankerultimate:recovery:v1';

const menuQuotes = [
  'Your tier list called. It wants receipts.',
  'Objectivity is just confidence with better branding.',
  'Pick favorites. Start arguments. Repeat.',
  'Because “they’re all good” is cowardice.',
  'Turning opinions into unnecessarily precise numbers.',
];

function loadRecovery(): RecoveryPayload | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as RecoveryPayload;

    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function saveRecovery(payload: RecoveryPayload) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
}

function clearRecovery() {
  localStorage.removeItem(RECOVERY_KEY);
}

function ExitConfirmModal({
  open,
  onStay,
  onExit,
}: {
  open: boolean;
  onStay: () => void;
  onExit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-title"
      >
        <h2 id="exit-title">Return to Main Menu?</h2>
        <p>This ranking isn’t being saved as a completed ranking yet. Leaving will discard it.</p>
        <div className="modal-actions">
          <button
            className="button"
            onClick={onStay}
          >
            Stay Here
          </button>
          <button
            className="button button-danger"
            onClick={onExit}
          >
            Discard &amp; Exit
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [collection, setCollection] = useState<RankCollection | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [rankingState, setRankingState] = useState<RankingState | null>(null);
  const [rankingHistory, setRankingHistory] = useState<RankingState[]>([]);
  const [refinementPairs, setRefinementPairs] = useState<RefinementPair[]>([]);
  const [refinementIndex, setRefinementIndex] = useState(0);
  const [refinementHistory, setRefinementHistory] = useState<RefinementSnapshot[]>([]);
  const [ratingOrder, setRatingOrder] = useState<RankItem[]>([]);
  const [ratingBackScreen, setRatingBackScreen] = useState<
    'rankingComplete' | 'refinementComplete'
  >('rankingComplete');
  const { personalRatings, updatePersonalRating } = usePersonalRatings();
  const [resumePrompt, setResumePrompt] = useState<RecoveryPayload | null>(() => loadRecovery());
  const [exitConfirm, setExitConfirm] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * menuQuotes.length));

  const {
    availableCollections,
    itemLibrary: collectionItemLibrary,
    createCollection,
    updateCollection,
    deleteCollection,
  } = useCollectionLibrary(collections);

  const activeRecoveryScreen =
    screen === 'ranking' ||
    screen === 'rankingComplete' ||
    screen === 'refinement' ||
    screen === 'refinementComplete' ||
    screen === 'ratings';

  useEffect(() => {
    if (!activeRecoveryScreen || !collection || !rankingState) {
      return;
    }

    const payload: RecoveryPayload = {
      version: 1,
      collectionId: collection.id,
      selectedItemIds: [...selectedItemIds],
      rankingState,
      rankingHistory,
      screen: screen as RecoveryPayload['screen'],
      refinementPairs,
      refinementIndex,
      refinementHistory,
      ratingOrderIds: ratingOrder.map((item) => item.id),
      ratingBackScreen,
    };

    saveRecovery(payload);
  }, [
    activeRecoveryScreen,
    collection,
    rankingState,
    rankingHistory,
    screen,
    selectedItemIds,
    refinementPairs,
    refinementIndex,
    refinementHistory,
    ratingOrder,
    ratingBackScreen,
  ]);


  const preferenceScores = useMemo(() => {
    if (!rankingState) {
      return {};
    }

    return calculatePreferenceScores(rankingState.ranked, rankingState.outcomes);
  }, [rankingState]);

  const refinementOptions = useMemo(() => {
    if (!rankingState || rankingState.current) {
      return [];
    }

    return buildRefinementPairs(rankingState.ranked, rankingState.outcomes);
  }, [rankingState]);

  function clearSession() {
    setCollection(null);
    setSelectedItemIds(new Set());
    setRankingState(null);
    setRankingHistory([]);
    setRefinementPairs([]);
    setRefinementIndex(0);
    setRefinementHistory([]);
    setRatingOrder([]);
  }

  function goHomeNow() {
    clearRecovery();
    clearSession();
    setExitConfirm(false);
    setScreen('home');
  }

  function requestMainMenu() {
    if (screen === 'results') {
      goHomeNow();
      return;
    }

    if (
      screen === 'ranking' ||
      screen === 'rankingComplete' ||
      screen === 'refinement' ||
      screen === 'refinementComplete' ||
      screen === 'ratings'
    ) {
      setExitConfirm(true);
      return;
    }

    setScreen('home');
  }

  function selectCollection(selectedCollection: RankCollection) {
    setCollection(selectedCollection);
    setSelectedItemIds(new Set(selectedCollection.items.map((item) => item.id)));
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
    setRankingHistory([]);
    setRefinementPairs([]);
    setRefinementIndex(0);
    setRefinementHistory([]);
    setRatingOrder([]);
    setScreen('ranking');
  }

  function chooseNormal(winner: RankItem) {
    if (!rankingState || !rankingState.current) {
      return;
    }

    setRankingHistory((previous) => [...previous, rankingState]);
    setRankingState(chooseRankingWinner(rankingState, winner.id));
  }

  function undoNormal() {
    if (rankingHistory.length === 0) {
      return;
    }

    const previousState = rankingHistory[rankingHistory.length - 1];

    setRankingState(previousState);
    setRankingHistory((previous) => previous.slice(0, -1));
  }

  function startRefinement() {
    if (!rankingState) {
      return;
    }

    const pairs = buildRefinementPairs(rankingState.ranked, rankingState.outcomes);

    if (pairs.length === 0) {
      setRefinementPairs([]);
      setRefinementIndex(0);
      setRefinementHistory([]);
      setScreen('refinementComplete');
      return;
    }

    setRefinementPairs(pairs);
    setRefinementIndex(0);
    setRefinementHistory([]);
    setScreen('refinement');
  }

  function chooseRefinement(winnerId: string) {
    if (!rankingState) {
      return;
    }

    const pair = refinementPairs[refinementIndex];

    if (!pair || (winnerId !== pair.firstId && winnerId !== pair.secondId)) {
      return;
    }

    const loserId = winnerId === pair.firstId ? pair.secondId : pair.firstId;
    const outcome: ComparisonOutcome = {
      winnerId,
      loserId,
      phase: 'refinement',
    };

    setRefinementHistory((previous) => [...previous, { rankingState, refinementIndex }]);

    setRankingState({
      ...rankingState,
      ranked: applyRefinementChoice(rankingState.ranked, pair, winnerId),
      outcomes: [...rankingState.outcomes, outcome],
      comparisons: rankingState.comparisons + 1,
    });
    setRefinementIndex((previous) => previous + 1);
  }

  function undoRefinement() {
    if (refinementHistory.length === 0) {
      return;
    }

    const snapshot = refinementHistory[refinementHistory.length - 1];

    setRankingState(snapshot.rankingState);
    setRefinementIndex(snapshot.refinementIndex);
    setRefinementHistory((previous) => previous.slice(0, -1));
  }

  function openRatings(backScreen: 'rankingComplete' | 'refinementComplete') {
    if (!rankingState) {
      return;
    }

    setRatingBackScreen(backScreen);
    setRatingOrder(shuffleItems(rankingState.ranked));
    setScreen('ratings');
  }

  function showResults() {
    clearRecovery();
    setScreen('results');
  }

  function resumeInterruptedRanking() {
    if (!resumePrompt) {
      return;
    }

    const restoredCollection = availableCollections.find(
      (item) => item.id === resumePrompt.collectionId,
    );

    if (!restoredCollection) {
      clearRecovery();
      setResumePrompt(null);
      setScreen('home');
      return;
    }

    const itemById = new Map(restoredCollection.items.map((item) => [item.id, item]));
    const restoredRatingOrder = resumePrompt.ratingOrderIds
      .map((id) => itemById.get(id))
      .filter((item): item is RankItem => Boolean(item));

    setCollection(restoredCollection);
    setSelectedItemIds(new Set(resumePrompt.selectedItemIds));
    setRankingState(resumePrompt.rankingState);
    setRankingHistory(resumePrompt.rankingHistory);
    setRefinementPairs(resumePrompt.refinementPairs);
    setRefinementIndex(resumePrompt.refinementIndex);
    setRefinementHistory(resumePrompt.refinementHistory);
    setRatingOrder(restoredRatingOrder);
    setRatingBackScreen(resumePrompt.ratingBackScreen);
    setResumePrompt(null);
    setScreen(resumePrompt.screen);
  }

  function discardInterruptedRanking() {
    clearRecovery();
    setResumePrompt(null);
    clearSession();
    setScreen('home');
  }

  if (resumePrompt) {
    const resumeCollection = availableCollections.find(
      (item) => item.id === resumePrompt.collectionId,
    );

    return (
      <AppShell centered>
        <section className="center-card resume-card">
          <div className="resume-icon">↻</div>
          <h1>You have an unfinished ranking</h1>
          <h2>{resumeCollection?.name ?? 'Previous ranking'}</h2>
          <p>
            {resumePrompt.rankingState.ranked.length} items placed ·{' '}
            {resumePrompt.rankingState.comparisons} comparisons
          </p>

          <div className="stacked-actions">
            <button
              className="button button-primary"
              onClick={resumeInterruptedRanking}
            >
              Resume Ranking
            </button>
            <button
              className="button"
              onClick={discardInterruptedRanking}
            >
              Discard &amp; Go to Main Menu
            </button>
          </div>
        </section>
      </AppShell>
    );
  }

  if (screen === 'home') {
    return (
      <AppShell>
        <section className="main-menu-card">
          <div className="main-menu-topline">
            <Logo />
            <span className="ghost-icon">⚙</span>
          </div>

          <div className="main-menu-copy">
            <h1>Rank anything.</h1>
            <p>Discover what you actually prefer when you have to pick.</p>
          </div>

          <div className="main-menu-actions">
            <button
              className="menu-button menu-button-primary"
              onClick={() => setScreen('collections')}
            >
              <span>＋</span>
              <strong>New Ranking</strong>
            </button>
            <button
              className="menu-button"
              disabled
            >
              <span>▤</span>
              <strong>My Rankings</strong>
              <small>Later</small>
            </button>
            <button
              className="menu-button"
              onClick={() => setScreen('manageCollections')}
            >
              <span>▣</span>
              <strong>Collections</strong>
            </button>
            <button
              className="menu-button"
              disabled
            >
              <span>★</span>
              <strong>Global Ratings</strong>
              <small>Later</small>
            </button>
            <button
              className="menu-button"
              disabled
            >
              <span>⚙</span>
              <strong>Settings</strong>
              <small>Later</small>
            </button>
          </div>

          <button
            className="menu-quote"
            onClick={() => setQuoteIndex((previous) => (previous + 1) % menuQuotes.length)}
            title="Yes, it changes if you poke it."
          >
            “{menuQuotes[quoteIndex]}”
          </button>
        </section>
      </AppShell>
    );
  }

  if (screen === 'manageCollections') {
    return (
      <CollectionsScreen
        collections={availableCollections}
        itemLibrary={collectionItemLibrary}
        onCreate={createCollection}
        onUpdate={updateCollection}
        onDelete={(collectionId) => {
          deleteCollection(collectionId);

          if (collection?.id === collectionId) {
            clearSession();
          }
        }}
        onMainMenu={requestMainMenu}
      />
    );
  }

  if (screen === 'collections') {
    return (
      <CollectionPickerScreen
        collections={availableCollections}
        onSelect={selectCollection}
        onMainMenu={requestMainMenu}
      />
    );
  }

  if (screen === 'review' && collection) {
    return (
      <CollectionReviewScreen
        collection={collection}
        selectedItemIds={selectedItemIds}
        onSelectedItemIdsChange={setSelectedItemIds}
        onBack={() => setScreen('collections')}
        onStartRanking={startRanking}
        onMainMenu={requestMainMenu}
      />
    );
  }

  if (!collection || !rankingState) {
    return null;
  }

  if (screen === 'ranking') {
    if (!rankingState.current) {
      const lastState = rankingHistory[rankingHistory.length - 1] ?? null;
      const lastOpponent = lastState ? getCurrentOpponent(lastState) : null;
      const lastOutcome = rankingState.outcomes[rankingState.outcomes.length - 1] ?? null;

      return (
        <AppShell>
          <AppHeader onMainMenu={requestMainMenu} />
          <FinalChoiceCheckpoint
            title="Normal ranking complete"
            first={lastState?.current ?? null}
            second={lastOpponent}
            winnerId={lastOutcome?.winnerId ?? null}
            onUndo={undoNormal}
            onContinue={() => setScreen('rankingComplete')}
          />
          <ExitConfirmModal
            open={exitConfirm}
            onStay={() => setExitConfirm(false)}
            onExit={goHomeNow}
          />
        </AppShell>
      );
    }

    const opponent = getCurrentOpponent(rankingState);

    if (!opponent) {
      return null;
    }

    const displayedPlaced =
      rankingState.mode === 'validation'
        ? Math.max(0, rankingState.ranked.length - 1)
        : rankingState.ranked.length;

    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />
        <RankingScreen
          current={rankingState.current}
          opponent={opponent}
          placedCount={displayedPlaced}
          totalItems={selectedItemIds.size}
          comparisons={rankingState.comparisons}
          canUndo={rankingHistory.length > 0}
          onChoose={chooseNormal}
          onUndo={undoNormal}
        />
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'rankingComplete') {
    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />
        <RankingCompleteScreen
          collectionName={collection.name}
          comparisons={rankingState.comparisons}
          refinementCount={refinementOptions.length}
          onRefine={startRefinement}
          onRateItems={() => openRatings('rankingComplete')}
          onSeeResults={showResults}
        />
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'refinement') {
    if (refinementIndex >= refinementPairs.length) {
      const lastSnapshot = refinementHistory[refinementHistory.length - 1] ?? null;
      const lastPair = lastSnapshot ? refinementPairs[lastSnapshot.refinementIndex] : null;
      const lastFirst = lastPair
        ? (rankingState.ranked.find((item) => item.id === lastPair.firstId) ?? null)
        : null;
      const lastSecond = lastPair
        ? (rankingState.ranked.find((item) => item.id === lastPair.secondId) ?? null)
        : null;
      const lastOutcome =
        [...rankingState.outcomes].reverse().find((outcome) => outcome.phase === 'refinement') ??
        null;

      return (
        <AppShell>
          <AppHeader onMainMenu={requestMainMenu} />
          <FinalChoiceCheckpoint
            title="Refinement choices complete"
            first={lastFirst}
            second={lastSecond}
            winnerId={lastOutcome?.winnerId ?? null}
            onUndo={undoRefinement}
            onContinue={() => setScreen('refinementComplete')}
          />
          <ExitConfirmModal
            open={exitConfirm}
            onStay={() => setExitConfirm(false)}
            onExit={goHomeNow}
          />
        </AppShell>
      );
    }

    const pair = refinementPairs[refinementIndex];
    const first = rankingState.ranked.find((item) => item.id === pair.firstId);
    const second = rankingState.ranked.find((item) => item.id === pair.secondId);

    if (!first || !second) {
      return null;
    }

    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />
        <RefinementScreen
          first={first}
          second={second}
          index={refinementIndex}
          total={refinementPairs.length}
          canUndo={refinementHistory.length > 0}
          onChoose={chooseRefinement}
          onUndo={undoRefinement}
        />
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'refinementComplete') {
    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />
        <RefinementCompleteScreen
          onRateItems={() => openRatings('refinementComplete')}
          onSeeResults={showResults}
        />
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'ratings') {
    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />
        <PersonalRatingsScreen
          items={ratingOrder}
          personalRatings={personalRatings}
          onUpdateRating={updatePersonalRating}
          onBack={() => setScreen(ratingBackScreen)}
          onContinue={showResults}
        />
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'results') {
    return (
      <AppShell className="results-shell">
        <AppHeader onMainMenu={requestMainMenu} />
        <ResultsScreen
          collection={collection}
          rankingState={rankingState}
          preferenceScores={preferenceScores}
          personalRatings={personalRatings}
          onNewRanking={() => {
            clearSession();
            setScreen('collections');
          }}
        />
      </AppShell>
    );
  }

  return null;
}

export default App;
