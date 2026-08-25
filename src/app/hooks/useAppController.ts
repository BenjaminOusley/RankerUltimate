import { useEffect, useState } from 'react';

import type { AppScreen, RatingBackScreen } from '@/app/appTypes';
import { collections } from '@/data/collections';
import type { RankCollection } from '@/domain/models';
import { useCollectionLibrary } from '@/features/collections/hooks/useCollectionLibrary';
import { useRankingSession } from '@/features/ranking/hooks/useRankingSession';
import {
  clearRankingRecovery,
  loadRankingRecovery,
  saveRankingRecovery,
  type RankingRecoveryPayload,
} from '@/features/ranking/recovery/rankingRecovery';
import { usePersonalRatings } from '@/features/ratings/hooks/usePersonalRatings';

const recoverableScreens = new Set<AppScreen>([
  'ranking',
  'rankingComplete',
  'refinement',
  'refinementComplete',
  'ratings',
]);

export function useAppController() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [resumePrompt, setResumePrompt] = useState<RankingRecoveryPayload | null>(() =>
    loadRankingRecovery(),
  );
  const [exitConfirm, setExitConfirm] = useState(false);

  const collectionLibrary = useCollectionLibrary(collections);
  const ratings = usePersonalRatings(collectionLibrary.itemLibrary);
  const session = useRankingSession();

  const activeRecoveryScreen = recoverableScreens.has(screen);

  useEffect(() => {
    if (!activeRecoveryScreen || !session.collection || !session.rankingState) {
      return;
    }

    saveRankingRecovery({
      version: 1,
      collectionId: session.collection.id,
      selectedItemIds: [...session.selectedItemIds],
      rankingState: session.rankingState,
      rankingHistory: session.rankingHistory,
      screen: screen as RankingRecoveryPayload['screen'],
      refinementPairs: session.refinementPairs,
      refinementIndex: session.refinementIndex,
      refinementHistory: session.refinementHistory,
      ratingOrderIds: session.ratingOrder.map((item) => item.id),
      ratingBackScreen: session.ratingBackScreen,
    });
  }, [
    activeRecoveryScreen,
    screen,
    session.collection,
    session.rankingState,
    session.rankingHistory,
    session.selectedItemIds,
    session.refinementPairs,
    session.refinementIndex,
    session.refinementHistory,
    session.ratingOrder,
    session.ratingBackScreen,
  ]);

  function goHomeNow() {
    clearRankingRecovery();
    session.clearSession();
    setExitConfirm(false);
    setScreen('home');
  }

  function requestMainMenu() {
    if (screen === 'results') {
      goHomeNow();
      return;
    }

    if (recoverableScreens.has(screen)) {
      setExitConfirm(true);
      return;
    }

    setScreen('home');
  }

  function selectCollection(selectedCollection: RankCollection) {
    session.selectCollection(selectedCollection);
    setScreen('review');
  }

  function startRanking() {
    if (session.startRanking()) {
      setScreen('ranking');
    }
  }

  function startRefinement() {
    setScreen(session.startRefinement() ? 'refinement' : 'refinementComplete');
  }

  function openRatings(backScreen: RatingBackScreen) {
    if (session.openRatings(backScreen)) {
      setScreen('ratings');
    }
  }

  function showResults() {
    clearRankingRecovery();
    setScreen('results');
  }

  function resumeInterruptedRanking() {
    if (!resumePrompt) {
      return;
    }

    const restoredCollection = collectionLibrary.availableCollections.find(
      (item) => item.id === resumePrompt.collectionId,
    );

    if (!restoredCollection) {
      clearRankingRecovery();
      setResumePrompt(null);
      setScreen('home');
      return;
    }

    session.restoreFromRecovery(resumePrompt, restoredCollection);
    const restoredScreen = resumePrompt.screen;
    setResumePrompt(null);
    setScreen(restoredScreen);
  }

  function discardInterruptedRanking() {
    clearRankingRecovery();
    setResumePrompt(null);
    session.clearSession();
    setScreen('home');
  }

  function deleteCollection(collectionId: string) {
    collectionLibrary.deleteCollection(collectionId);

    if (session.collection?.id === collectionId) {
      session.clearSession();
    }
  }

  function startNewRanking() {
    session.clearSession();
    setScreen('collections');
  }

  return {
    screen,
    setScreen,
    resumePrompt,
    exitConfirm,
    setExitConfirm,
    collectionLibrary,
    ratings,
    session,
    requestMainMenu,
    goHomeNow,
    selectCollection,
    startRanking,
    startRefinement,
    openRatings,
    showResults,
    resumeInterruptedRanking,
    discardInterruptedRanking,
    deleteCollection,
    startNewRanking,
  };
}
