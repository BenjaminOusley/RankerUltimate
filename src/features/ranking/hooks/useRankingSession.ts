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
import type { RankingRecoveryPayload, RefinementSnapshot } from '../recovery/rankingRecovery';

export function useRankingSession() {
  const [collection, setCollection] = useState<RankCollection | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [rankingState, setRankingState] = useState<RankingState | null>(null);
  const [rankingHistory, setRankingHistory] = useState<RankingState[]>([]);
  const [refinementPairs, setRefinementPairs] = useState<RefinementPair[]>([]);
  const [refinementIndex, setRefinementIndex] = useState(0);
  const [refinementHistory, setRefinementHistory] = useState<RefinementSnapshot[]>([]);
  const [ratingOrder, setRatingOrder] = useState<RankItem[]>([]);
  const [ratingBackScreen, setRatingBackScreen] = useState<RatingBackScreen>('rankingComplete');

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

  const currentOpponent = rankingState?.current ? getCurrentOpponent(rankingState) : null;

  const displayedPlaced = rankingState
    ? rankingState.mode === 'validation'
      ? Math.max(0, rankingState.ranked.length - 1)
      : rankingState.ranked.length
    : 0;

  const normalLastChoice = useMemo(() => {
    if (!rankingState || rankingState.current) {
      return null;
    }

    const lastState = rankingHistory[rankingHistory.length - 1] ?? null;
    const lastOpponent = lastState ? getCurrentOpponent(lastState) : null;
    const lastOutcome = rankingState.outcomes[rankingState.outcomes.length - 1] ?? null;

    return {
      first: lastState?.current ?? null,
      second: lastOpponent,
      winnerId: lastOutcome?.winnerId ?? null,
    };
  }, [rankingHistory, rankingState]);

  const refinementLastChoice = useMemo(() => {
    if (!rankingState || refinementIndex < refinementPairs.length) {
      return null;
    }

    const lastSnapshot = refinementHistory[refinementHistory.length - 1] ?? null;
    const lastPair = lastSnapshot ? refinementPairs[lastSnapshot.refinementIndex] : null;
    const first = lastPair
      ? (rankingState.ranked.find((item) => item.id === lastPair.firstId) ?? null)
      : null;
    const second = lastPair
      ? (rankingState.ranked.find((item) => item.id === lastPair.secondId) ?? null)
      : null;
    const lastOutcome =
      [...rankingState.outcomes].reverse().find((outcome) => outcome.phase === 'refinement') ??
      null;

    return {
      first,
      second,
      winnerId: lastOutcome?.winnerId ?? null,
    };
  }, [rankingState, refinementHistory, refinementIndex, refinementPairs]);

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
    setRankingHistory([]);
    setRefinementPairs([]);
    setRefinementIndex(0);
    setRefinementHistory([]);
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

    setRankingState(createInitialRankingState(selectedItems));
    setRankingHistory([]);
    setRefinementPairs([]);
    setRefinementIndex(0);
    setRefinementHistory([]);
    setRatingOrder([]);
    return true;
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
      return false;
    }

    const pairs = buildRefinementPairs(rankingState.ranked, rankingState.outcomes);
    setRefinementPairs(pairs);
    setRefinementIndex(0);
    setRefinementHistory([]);
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

  function openRatings(backScreen: RatingBackScreen) {
    if (!rankingState) {
      return false;
    }

    setRatingBackScreen(backScreen);
    setRatingOrder(shuffleItems(rankingState.ranked));
    return true;
  }

  function restoreFromRecovery(payload: RankingRecoveryPayload, restoredCollection: RankCollection) {
    const itemById = new Map(restoredCollection.items.map((item) => [item.id, item]));
    const restoredRatingOrder = payload.ratingOrderIds
      .map((id) => itemById.get(id))
      .filter((item): item is RankItem => Boolean(item));

    setCollection(restoredCollection);
    setSelectedItemIds(new Set(payload.selectedItemIds));
    setRankingState(payload.rankingState);
    setRankingHistory(payload.rankingHistory);
    setRefinementPairs(payload.refinementPairs);
    setRefinementIndex(payload.refinementIndex);
    setRefinementHistory(payload.refinementHistory);
    setRatingOrder(restoredRatingOrder);
    setRatingBackScreen(payload.ratingBackScreen);
  }

  return {
    collection,
    selectedItemIds,
    setSelectedItemIds,
    rankingState,
    rankingHistory,
    refinementPairs,
    refinementIndex,
    refinementHistory,
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
