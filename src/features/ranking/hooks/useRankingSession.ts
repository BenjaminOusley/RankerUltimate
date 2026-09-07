import { useMemo, useState } from 'react';

import type { RatingBackScreen } from '@/app/appTypes';
import type { RankCollection, RankItem } from '@/domain/models';
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
} from '../engine';
import type { RankingRecoveryPayload } from '../recovery/rankingRecovery';
import { replayRankingChoices, replayRefinementChoices } from '../recovery/rankingReplay';

function getInitialOrderIds(state: RankingState) {
  return [...state.ranked, ...(state.current ? [state.current] : []), ...state.remaining].map(
    (item) => item.id,
  );
}

function resolveItemsByIds(items: readonly RankItem[], ids: readonly string[]) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const resolved = ids
    .map((id) => itemById.get(id))
    .filter((item): item is RankItem => Boolean(item));

  return resolved.length === ids.length ? resolved : null;
}

export function useRankingSession() {
  const [collection, setCollection] = useState<RankCollection | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [rankingState, setRankingState] = useState<RankingState | null>(null);
  const [rankingOrderIds, setRankingOrderIds] = useState<string[]>([]);
  const [rankingWinnerIds, setRankingWinnerIds] = useState<string[]>([]);
  const [normalLastState, setNormalLastState] = useState<RankingState | null>(null);
  const [refinementPairs, setRefinementPairs] = useState<RefinementPair[]>([]);
  const [refinementWinnerIds, setRefinementWinnerIds] = useState<string[]>([]);
  const [ratingOrder, setRatingOrder] = useState<RankItem[]>([]);
  const [ratingBackScreen, setRatingBackScreen] = useState<RatingBackScreen>('rankingComplete');

  const preferenceScores = useMemo(() => {
    if (!rankingState || rankingState.current) {
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

  const currentOpponent = rankingState?.current ? getCurrentOpponent(rankingState) : null;
  const refinementIndex = refinementWinnerIds.length;

  const displayedPlaced = rankingState
    ? rankingState.mode === 'validation'
      ? Math.max(0, rankingState.ranked.length - 1)
      : rankingState.ranked.length
    : 0;

  const normalLastChoice = (() => {
    if (!rankingState || rankingState.current || !normalLastState) {
      return null;
    }

    const lastOpponent = getCurrentOpponent(normalLastState);
    const lastOutcome =
      [...rankingState.outcomes].reverse().find((outcome) => outcome.phase !== 'refinement') ??
      null;

    return {
      first: normalLastState.current,
      second: lastOpponent,
      winnerId: lastOutcome?.winnerId ?? null,
    };
  })();

  const refinementLastChoice = useMemo(() => {
    if (!rankingState || refinementIndex === 0 || refinementIndex < refinementPairs.length) {
      return null;
    }

    const lastIndex = refinementIndex - 1;
    const lastPair = refinementPairs[lastIndex] ?? null;
    const winnerId = refinementWinnerIds[lastIndex] ?? null;
    const first = lastPair
      ? (rankingState.ranked.find((item) => item.id === lastPair.firstId) ?? null)
      : null;
    const second = lastPair
      ? (rankingState.ranked.find((item) => item.id === lastPair.secondId) ?? null)
      : null;

    return {
      first,
      second,
      winnerId,
    };
  }, [rankingState, refinementIndex, refinementPairs, refinementWinnerIds]);

  const currentRefinementItems = useMemo(() => {
    if (!rankingState || refinementIndex >= refinementPairs.length) {
      return null;
    }

    const pair = refinementPairs[refinementIndex];
    const first = rankingState.ranked.find((item) => item.id === pair.firstId) ?? null;
    const second = rankingState.ranked.find((item) => item.id === pair.secondId) ?? null;

    return first && second ? { first, second } : null;
  }, [rankingState, refinementIndex, refinementPairs]);

  function clearSession() {
    setCollection(null);
    setSelectedItemIds(new Set());
    setRankingState(null);
    setRankingOrderIds([]);
    setRankingWinnerIds([]);
    setNormalLastState(null);
    setRefinementPairs([]);
    setRefinementWinnerIds([]);
    setRatingOrder([]);
  }

  function selectCollection(selectedCollection: RankCollection) {
    setCollection(selectedCollection);
    setSelectedItemIds(new Set(selectedCollection.items.map((item) => item.id)));
  }

  function startRanking() {
    if (!collection) {
      return false;
    }

    const selectedItems = collection.items.filter((item) => selectedItemIds.has(item.id));

    if (selectedItems.length < 2) {
      return false;
    }

    const initialState = createInitialRankingState(selectedItems);

    setRankingState(initialState);
    setRankingOrderIds(getInitialOrderIds(initialState));
    setRankingWinnerIds([]);
    setNormalLastState(null);
    setRefinementPairs([]);
    setRefinementWinnerIds([]);
    setRatingOrder([]);
    return true;
  }

  function chooseNormal(winner: RankItem) {
    if (!rankingState || !rankingState.current) {
      return;
    }

    const nextState = chooseRankingWinner(rankingState, winner.id);

    if (nextState === rankingState) {
      return;
    }

    setNormalLastState(rankingState);
    setRankingWinnerIds((previous) => [...previous, winner.id]);
    setRankingState(nextState);
  }

  function undoNormal() {
    if (!collection || rankingWinnerIds.length === 0) {
      return;
    }

    const orderedItems = resolveItemsByIds(collection.items, rankingOrderIds);

    if (!orderedItems) {
      return;
    }

    const nextWinnerIds = rankingWinnerIds.slice(0, -1);

    try {
      const replay = replayRankingChoices(orderedItems, nextWinnerIds);

      setRankingState(replay.state);
      setRankingWinnerIds(nextWinnerIds);
      setNormalLastState(replay.lastState);
    } catch {
      return;
    }
  }

  function startRefinement() {
    if (!rankingState) {
      return false;
    }

    const pairs = buildRefinementPairs(rankingState.ranked, rankingState.outcomes);
    setRefinementPairs(pairs);
    setRefinementWinnerIds([]);
    return pairs.length > 0;
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

    setRankingState({
      ...rankingState,
      ranked: applyRefinementChoice(rankingState.ranked, pair, winnerId),
      outcomes: [...rankingState.outcomes, outcome],
      comparisons: rankingState.comparisons + 1,
    });
    setRefinementWinnerIds((previous) => [...previous, winnerId]);
  }

  function undoRefinement() {
    if (!collection || refinementWinnerIds.length === 0) {
      return;
    }

    const orderedItems = resolveItemsByIds(collection.items, rankingOrderIds);

    if (!orderedItems) {
      return;
    }

    const nextRefinementWinnerIds = refinementWinnerIds.slice(0, -1);

    try {
      const normalReplay = replayRankingChoices(orderedItems, rankingWinnerIds);
      const restoredState = replayRefinementChoices(
        normalReplay.state,
        refinementPairs,
        nextRefinementWinnerIds,
      );

      setRankingState(restoredState);
      setNormalLastState(normalReplay.lastState);
      setRefinementWinnerIds(nextRefinementWinnerIds);
    } catch {
      return;
    }
  }

  function openRatings(backScreen: RatingBackScreen) {
    if (!rankingState) {
      return false;
    }

    setRatingBackScreen(backScreen);
    setRatingOrder(shuffleItems(rankingState.ranked));
    return true;
  }

  function restoreFromRecovery(
    payload: RankingRecoveryPayload,
    restoredCollection: RankCollection,
  ) {
    const orderedItems = resolveItemsByIds(restoredCollection.items, payload.rankingOrderIds);
    const restoredRatingOrder = resolveItemsByIds(restoredCollection.items, payload.ratingOrderIds);

    if (!orderedItems || orderedItems.length < 2 || !restoredRatingOrder) {
      return false;
    }

    try {
      const normalReplay = replayRankingChoices(orderedItems, payload.rankingWinnerIds);
      const restoredState = replayRefinementChoices(
        normalReplay.state,
        payload.refinementPairs,
        payload.refinementWinnerIds,
      );

      setCollection(restoredCollection);
      setSelectedItemIds(new Set(payload.selectedItemIds));
      setRankingState(restoredState);
      setRankingOrderIds([...payload.rankingOrderIds]);
      setRankingWinnerIds([...payload.rankingWinnerIds]);
      setNormalLastState(normalReplay.lastState);
      setRefinementPairs([...payload.refinementPairs]);
      setRefinementWinnerIds([...payload.refinementWinnerIds]);
      setRatingOrder(restoredRatingOrder);
      setRatingBackScreen(payload.ratingBackScreen);
      return true;
    } catch {
      return false;
    }
  }

  return {
    collection,
    selectedItemIds,
    setSelectedItemIds,
    rankingState,
    rankingOrderIds,
    rankingWinnerIds,
    refinementPairs,
    refinementWinnerIds,
    refinementIndex,
    ratingOrder,
    ratingBackScreen,
    preferenceScores,
    refinementOptions,
    currentOpponent,
    displayedPlaced,
    normalLastChoice,
    refinementLastChoice,
    currentRefinementItems,
    clearSession,
    selectCollection,
    startRanking,
    chooseNormal,
    undoNormal,
    startRefinement,
    chooseRefinement,
    undoRefinement,
    openRatings,
    restoreFromRecovery,
  };
}
