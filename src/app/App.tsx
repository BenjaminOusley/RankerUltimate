import { useEffect, useMemo, useState } from 'react';
import './legacy.css';

import { AppShell } from './AppShell';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Logo } from '@/shared/components/Logo/Logo';
import { Poster } from '@/shared/components/Poster/Poster';
import { collections } from '@/data/collections';
import { useCollectionLibrary } from '@/features/collections/hooks/useCollectionLibrary';
import { CollectionPickerScreen } from '@/features/collections/screens/CollectionPickerScreen/CollectionPickerScreen';
import { CollectionReviewScreen } from '@/features/collections/screens/CollectionReviewScreen/CollectionReviewScreen';
import { CollectionsScreen } from '@/features/collections/screens/CollectionsScreen/CollectionsScreen';
import type { RankCollection, RankItem } from '@/models';
import {
  applyRefinementChoice,
  buildRefinementPairs,
  calculatePreferenceScores,
  chooseRankingWinner,
  createInitialRankingState,
  formatPersonalRating,
  getCurrentOpponent,
  shuffleItems,
  type ComparisonOutcome,
  type RankingState,
  type RefinementPair,
} from '@/ranking';

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

type ResultsTab = 'ranking' | 'summary';


type PersonalRatingRecord = {
  value: number;
  updatedAt: string;
};

type PersonalRatingMap = Record<string, PersonalRatingRecord>;

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
const PERSONAL_RATINGS_KEY = 'rankerultimate:personal-ratings:v1';

const menuQuotes = [
  'Your tier list called. It wants receipts.',
  'Objectivity is just confidence with better branding.',
  'Pick favorites. Start arguments. Repeat.',
  'Because “they’re all good” is cowardice.',
  'Turning opinions into unnecessarily precise numbers.',
];

function loadPersonalRatings(): PersonalRatingMap {
  try {
    const raw = localStorage.getItem(PERSONAL_RATINGS_KEY);

    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as PersonalRatingMap;
  } catch {
    return {};
  }
}

function savePersonalRatings(ratings: PersonalRatingMap) {
  localStorage.setItem(PERSONAL_RATINGS_KEY, JSON.stringify(ratings));
}

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

function getItemStorageKey(item: RankItem) {
  const source = (item as RankItem & { source?: unknown }).source;

  return source ? `${String(source)}:${item.id}` : item.id;
}

function getPersonalRating(ratings: PersonalRatingMap, item: RankItem) {
  return ratings[getItemStorageKey(item)]?.value ?? null;
}

function formatPreferenceScore(value: number | undefined) {
  return (value ?? 0).toFixed(1);
}

function getRankClass(index: number, total: number) {
  if (index === 0) return 'rank-gold';
  if (index === 1) return 'rank-silver';
  if (index === 2) return 'rank-bronze';
  if (index === total - 1) return 'rank-last';
  if (index === total - 2) return 'rank-second-last';
  if (index === total - 3) return 'rank-third-last';

  return '';
}

function getRankAdornment(index: number) {
  if (index === 0) return '♛';
  if (index === 1) return '◆';
  if (index === 2) return '●';
  return '';
}

function getDistribution(values: readonly number[]) {
  const buckets = [0, 0, 0, 0, 0];

  for (const value of values) {
    if (value < 2) buckets[0] += 1;
    else if (value < 4) buckets[1] += 1;
    else if (value < 6) buckets[2] += 1;
    else if (value < 8) buckets[3] += 1;
    else buckets[4] += 1;
  }

  const total = values.length;

  return buckets.map((count) => (total === 0 ? 0 : count / total));
}

function ComparisonCard({ item, onChoose }: { item: RankItem; onChoose: () => void }) {
  return (
    <button
      className="comparison-card"
      onClick={onChoose}
    >
      <Poster item={item} />

      <span className="comparison-card-name">{item.name}</span>

      {item.subtitle && <span className="comparison-card-subtitle">{item.subtitle}</span>}
    </button>
  );
}

function StaticChoiceCard({ item, chosen }: { item: RankItem; chosen: boolean }) {
  return (
    <div className={`last-choice-card ${chosen ? 'last-choice-card-chosen' : ''}`}>
      <Poster item={item} />
      <div className="last-choice-copy">
        <strong title={item.name}>{item.name}</strong>
        {item.subtitle && <span>{item.subtitle}</span>}
      </div>
      {chosen && <span className="chosen-badge">✓ Chosen</span>}
    </div>
  );
}

function FinalChoiceCheckpoint({
  title,
  first,
  second,
  winnerId,
  onUndo,
  onContinue,
}: {
  title: string;
  first: RankItem | null;
  second: RankItem | null;
  winnerId: string | null;
  onUndo: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="center-card final-checkpoint">
      <div className="completion-icon">✓</div>
      <h1>{title}</h1>
      <p>That was the last choice for this phase. Make sure you’re happy with it.</p>

      {first && second && (
        <div
          className="last-choice-preview"
          aria-label="Your last choice"
        >
          <StaticChoiceCard
            item={first}
            chosen={winnerId === first.id}
          />
          <span className="last-choice-vs">VS</span>
          <StaticChoiceCard
            item={second}
            chosen={winnerId === second.id}
          />
        </div>
      )}

      <div className="stacked-actions">
        <button
          className="button"
          onClick={onUndo}
        >
          ↶ Undo Last Choice
        </button>
        <button
          className="button button-primary"
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </section>
  );
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
  const [hideRated, setHideRated] = useState(false);
  const [personalRatings, setPersonalRatings] = useState<PersonalRatingMap>(() =>
    loadPersonalRatings(),
  );
  const [resumePrompt, setResumePrompt] = useState<RecoveryPayload | null>(() => loadRecovery());
  const [exitConfirm, setExitConfirm] = useState(false);
  const [resultsTab, setResultsTab] = useState<ResultsTab>('ranking');
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
    setHideRated(false);
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
    setHideRated(false);
    setScreen('ratings');
  }

  function updatePersonalRating(item: RankItem, value: number | null) {
    const key = getItemStorageKey(item);

    setPersonalRatings((previous) => {
      const next = { ...previous };

      if (value === null) {
        delete next[key];
      } else {
        next[key] = {
          value,
          updatedAt: new Date().toISOString(),
        };
      }

      savePersonalRatings(next);

      return next;
    });
  }

  function showResults() {
    setResultsTab('ranking');
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

        <section className="scene-panel comparison-scene">
          <div className="comparison-progress-row">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(
                    100,
                    (displayedPlaced / Math.max(1, selectedItemIds.size)) * 100,
                  )}%`,
                }}
              />
            </div>
            <span>
              {displayedPlaced} of {selectedItemIds.size} items placed · {rankingState.comparisons}{' '}
              comparisons
            </span>
          </div>

          <h1>Which do you prefer?</h1>

          <div className="comparison-layout">
            <ComparisonCard
              item={rankingState.current}
              onChoose={() => chooseNormal(rankingState.current!)}
            />
            <div className="versus">VS</div>
            <ComparisonCard
              item={opponent}
              onChoose={() => chooseNormal(opponent)}
            />
          </div>

          <div className="comparison-footer">
            <button
              className="button"
              onClick={undoNormal}
              disabled={rankingHistory.length === 0}
            >
              ↶ Undo Last Choice
            </button>
          </div>
        </section>
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

        <section className="center-card completion-card">
          <div className="completion-icon">✓</div>
          <h1>Ranking complete!</h1>
          <h2>{collection.name}</h2>
          <p>{rankingState.comparisons} comparisons so far.</p>

          <div className="stacked-actions">
            <button
              className="button button-primary action-with-copy"
              onClick={startRefinement}
              disabled={refinementOptions.length === 0}
            >
              <span>
                Refine Results <em>(optional)</em>
              </span>
              <small>
                {refinementOptions.length > 0
                  ? 'Answer a few more carefully chosen comparisons'
                  : 'No useful extra comparisons found'}
              </small>
            </button>
            <button
              className="button action-with-copy"
              onClick={() => openRatings('rankingComplete')}
            >
              <span>
                Rate Items <em>(optional)</em>
              </span>
              <small>Set or update your personal ratings</small>
            </button>
            <button
              className="button action-with-copy"
              onClick={showResults}
            >
              <span>See Results</span>
              <small>Reveal your final ranked list</small>
            </button>
          </div>
        </section>
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

        <section className="scene-panel comparison-scene">
          <div className="comparison-progress-row">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${(refinementIndex / Math.max(1, refinementPairs.length)) * 100}%`,
                }}
              />
            </div>
            <span>
              {refinementIndex + 1} of {refinementPairs.length} extra comparisons
            </span>
          </div>

          <h1>Which do you prefer?</h1>

          <div className="comparison-layout">
            <ComparisonCard
              item={first}
              onChoose={() => chooseRefinement(first.id)}
            />
            <div className="versus">VS</div>
            <ComparisonCard
              item={second}
              onChoose={() => chooseRefinement(second.id)}
            />
          </div>

          <div className="comparison-footer">
            <button
              className="button"
              onClick={undoRefinement}
              disabled={refinementHistory.length === 0}
            >
              ↶ Undo Last Choice
            </button>
            <span className="quiet-copy">A few extra comparisons help fine-tune the outcome.</span>
          </div>
        </section>
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

        <section className="center-card completion-card">
          <div className="completion-icon completion-icon-warm">✦</div>
          <h1>Refinement complete!</h1>
          <p>Your additional choices have been applied.</p>

          <div className="stacked-actions">
            <button
              className="button button-primary action-with-copy"
              onClick={() => openRatings('refinementComplete')}
            >
              <span>
                Rate Items <em>(optional)</em>
              </span>
              <small>Set or update your personal ratings</small>
            </button>
            <button
              className="button action-with-copy"
              onClick={showResults}
            >
              <span>See Results</span>
              <small>Reveal your final ranked list</small>
            </button>
          </div>
        </section>
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  if (screen === 'ratings') {
    const visibleRatingItems = hideRated
      ? ratingOrder.filter((item) => getPersonalRating(personalRatings, item) === null)
      : ratingOrder;

    return (
      <AppShell>
        <AppHeader onMainMenu={requestMainMenu} />

        <section className="scene-panel ratings-scene">
          <div className="scene-heading ratings-heading">
            <div>
              <h1>
                Rate the items <span className="optional-label">(optional)</span>
              </h1>
              <p>
                Rate each item on its own. Leave it as <strong>—</strong> if you don’t want to rate
                it.
              </p>
            </div>

            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={hideRated}
                onChange={(event) => setHideRated(event.target.checked)}
              />
              Hide rated items
            </label>
          </div>

          <div className="scroll-panel ratings-grid">
            {visibleRatingItems.map((item) => {
              const rating = getPersonalRating(personalRatings, item);

              return (
                <article
                  className="rating-card"
                  key={item.id}
                >
                  <Poster item={item} />
                  <div className="rating-card-copy">
                    <strong title={item.name}>{item.name}</strong>
                    {item.subtitle && <small>{item.subtitle}</small>}
                  </div>
                  <select
                    className="rating-select"
                    value={rating ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      updatePersonalRating(item, value === '' ? null : Number(value));
                    }}
                    aria-label={`Personal rating for ${item.name}`}
                  >
                    <option value="">—</option>
                    {Array.from({ length: 20 }, (_, index) => (index + 1) / 2).map((value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {formatPersonalRating(value)}
                      </option>
                    ))}
                  </select>
                </article>
              );
            })}

            {visibleRatingItems.length === 0 && (
              <div className="empty-state">Everything here already has a rating.</div>
            )}
          </div>

          <div className="footer-actions">
            <button
              className="button"
              onClick={() => setScreen(ratingBackScreen)}
            >
              Back
            </button>
            <button
              className="button button-primary"
              onClick={showResults}
            >
              Continue to Results
            </button>
          </div>
        </section>
        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  const ratedItems = rankingState.ranked.filter(
    (item) => getPersonalRating(personalRatings, item) !== null,
  );

  if (screen === 'results') {
    const preferenceDistribution = getDistribution(
      rankingState.ranked.map((item) => preferenceScores[item.id] ?? 0),
    );
    const ratingDistribution = getDistribution(
      ratedItems.map((item) => getPersonalRating(personalRatings, item) ?? 0),
    );
    const maxDistribution = Math.max(0.01, ...preferenceDistribution, ...ratingDistribution);

    const surprises = ratedItems
      .map((item) => ({
        item,
        rating: getPersonalRating(personalRatings, item) ?? 0,
        preference: preferenceScores[item.id] ?? 0,
        difference: Math.abs(
          (getPersonalRating(personalRatings, item) ?? 0) - (preferenceScores[item.id] ?? 0),
        ),
        rank: rankingState.ranked.findIndex((rankedItem) => rankedItem.id === item.id) + 1,
      }))
      .sort((left, right) => right.difference - left.difference)
      .slice(0, 3);

    return (
      <AppShell className="results-shell">
        <AppHeader onMainMenu={requestMainMenu} />

        <section className="scene-panel results-scene">
          <div className="results-heading">
            <div>
              <h1>{collection.name}</h1>
              <p>
                {rankingState.ranked.length} items · {rankingState.comparisons} comparisons
              </p>
            </div>

            <div className="results-actions">
              <button
                className="button button-small button-primary"
                onClick={() => {
                  clearSession();
                  setResultsTab('ranking');
                  setScreen('collections');
                }}
              >
                ＋ New Ranking
              </button>
              <button
                className="button button-small"
                disabled
              >
                Share
              </button>
              <button
                className="button button-small"
                disabled
              >
                Export
              </button>
            </div>
          </div>

          <div className="tab-row">
            <button
              className={resultsTab === 'ranking' ? 'tab-active' : ''}
              onClick={() => setResultsTab('ranking')}
            >
              Ranked List
            </button>
            <button
              className={resultsTab === 'summary' ? 'tab-active' : ''}
              onClick={() => setResultsTab('summary')}
            >
              Summary
            </button>
          </div>

          {resultsTab === 'ranking' ? (
            <div className="scroll-panel ranking-table-wrap">
              <div className="ranking-table ranking-table-header">
                <span>Rank</span>
                <span>Item</span>
                <span className="numeric-header">
                  Preference
                  <button
                    className="info-tooltip"
                    title="Calculated from how this item performed against others in this ranking. Rank sets the order; comparison evidence adjusts the spacing."
                    aria-label="About Preference Score"
                  >
                    ?
                  </button>
                </span>
                <span className="numeric-header">Your Rating</span>
              </div>

              {rankingState.ranked.map((item, index) => {
                const rankClass = getRankClass(index, rankingState.ranked.length);
                const adornment = getRankAdornment(index);
                const rating = getPersonalRating(personalRatings, item);

                return (
                  <div
                    className={`ranking-table ranking-result-row ${rankClass}`}
                    key={item.id}
                  >
                    <span className="rank-cell">
                      <span className="rank-adornment">{adornment}</span>
                      <strong>{index + 1}</strong>
                    </span>

                    <span className="result-item-cell">
                      <Poster item={item} />
                      <span className="result-item-copy">
                        <strong
                          className="truncate-name"
                          title={item.name}
                          tabIndex={0}
                        >
                          {item.name}
                        </strong>
                        {item.subtitle && <small>{item.subtitle}</small>}
                      </span>
                    </span>

                    <span className="score-cell">
                      <span className="score-pill score-preference">
                        ◆ {formatPreferenceScore(preferenceScores[item.id])}
                      </span>
                    </span>

                    <span className="score-cell">
                      <span
                        className={`score-pill score-rating ${rating === null ? 'score-empty' : ''}`}
                      >
                        ★ {formatPersonalRating(rating)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="scroll-panel summary-panel">
              <section className="summary-section">
                <div className="summary-section-heading">
                  <div>
                    <h2>Score Distribution</h2>
                    <p>Preference and Personal Rating are normalized separately.</p>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-preference" /> Preference
                    </span>
                    <span>
                      <i className="legend-rating" /> Personal Rating ({ratedItems.length})
                    </span>
                  </div>
                </div>

                <div className="distribution-chart">
                  {['0–2', '2–4', '4–6', '6–8', '8–10'].map((label, index) => (
                    <div
                      className="distribution-group"
                      key={label}
                    >
                      <div className="distribution-bars">
                        <div
                          className="distribution-bar bar-preference"
                          style={{
                            height: `${(preferenceDistribution[index] / maxDistribution) * 100}%`,
                          }}
                          title={`Preference: ${(preferenceDistribution[index] * 100).toFixed(0)}%`}
                        />
                        <div
                          className="distribution-bar bar-rating"
                          style={{
                            height: `${(ratingDistribution[index] / maxDistribution) * 100}%`,
                          }}
                          title={`Personal Rating: ${(ratingDistribution[index] * 100).toFixed(0)}%`}
                        />
                      </div>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="summary-section">
                <h2>Quick Stats</h2>
                <div className="stat-grid">
                  <div className="stat-card">
                    <strong>{rankingState.ranked.length}</strong>
                    <span>Items Ranked</span>
                  </div>
                  <div className="stat-card">
                    <strong>{rankingState.comparisons}</strong>
                    <span>Comparisons</span>
                  </div>
                  <div className="stat-card">
                    <strong>
                      {ratedItems.length}/{rankingState.ranked.length}
                    </strong>
                    <span>Personally Rated</span>
                  </div>
                  <div className="stat-card">
                    <strong>
                      {
                        rankingState.outcomes.filter((outcome) => outcome.phase === 'refinement')
                          .length
                      }
                    </strong>
                    <span>Refine Choices</span>
                  </div>
                </div>
              </section>

              {surprises.length > 0 && (
                <section className="summary-section">
                  <h2>Biggest Surprises</h2>
                  <div className="surprise-list">
                    {surprises.map(({ item, rating, preference, rank }) => (
                      <div
                        className="surprise-row"
                        key={item.id}
                      >
                        <Poster item={item} />
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            You rated it {formatPersonalRating(rating)}, but it landed #{rank} with
                            a {formatPreferenceScore(preference)} Preference Score.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>

        <ExitConfirmModal
          open={exitConfirm}
          onStay={() => setExitConfirm(false)}
          onExit={goHomeNow}
        />
      </AppShell>
    );
  }

  return null;
}

export default App;
