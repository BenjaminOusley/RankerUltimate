import { useEffect, useRef, useState } from 'react';

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
import { useMyRankings } from '@/features/myRankings/hooks/useMyRankings';
import { makeRecentRanking } from '@/features/myRankings/model/savedRankings';

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
  const [pendingNavigationScreen, setPendingNavigationScreen] = useState<AppScreen | null>(null);

  const collectionLibrary = useCollectionLibrary(collections);
  const ratings = usePersonalRatings(collectionLibrary.itemLibrary);
  const session = useRankingSession();
  const myRankings = useMyRankings();
  const [currentResultId, setCurrentResultId] = useState<string | null>(null);
  const [currentResultSaved, setCurrentResultSaved] = useState(false);
  const [openedRankingId, setOpenedRankingId] = useState<string | null>(null);
  const [recentSaveError, setRecentSaveError] = useState<string | null>(null);
  const pendingRecentWrite = useRef<Promise<void>>(Promise.resolve());

  const activeRecoveryScreen = recoverableScreens.has(screen);

  useEffect(() => {
    if (!activeRecoveryScreen || !session.collection || !session.rankingState) {
      return;
    }

    saveRankingRecovery({
      version: 2,
      collectionId: session.collection.id,
      selectedItemIds: [...session.selectedItemIds],
      rankingOrderIds: session.rankingOrderIds,
      rankingWinnerIds: session.rankingWinnerIds,
      placedItems: session.displayedPlaced,
      comparisons: session.rankingState.comparisons,
      screen: screen as RankingRecoveryPayload['screen'],
      refinementPairs: session.refinementPairs,
      refinementWinnerIds: session.refinementWinnerIds,
      ratingOrderIds: session.ratingOrder.map((item) => item.id),
      ratingBackScreen: session.ratingBackScreen,
    });
  }, [
    activeRecoveryScreen,
    screen,
    session.collection,
    session.rankingState,
    session.rankingOrderIds,
    session.rankingWinnerIds,
    session.selectedItemIds,
    session.displayedPlaced,
    session.refinementPairs,
    session.refinementWinnerIds,
    session.ratingOrder,
    session.ratingBackScreen,
  ]);

  function goHomeNow() {
    clearRankingRecovery();
    session.clearSession();
    setExitConfirm(false);
    setPendingNavigationScreen(null);
    setScreen('home');
  }

  function navigateNow(target: AppScreen) {
    if (screen === 'results' || screen === 'review') {
      clearRankingRecovery();
      session.clearSession();
    }

    setExitConfirm(false);
    setPendingNavigationScreen(null);
    setScreen(target);
  }

  function requestNavigation(target: AppScreen) {
    if (target === 'myRankings') void myRankings.refresh();
    if (target === screen) {
      return;
    }

    if (recoverableScreens.has(screen)) {
      setPendingNavigationScreen(target);
      setExitConfirm(true);
      return;
    }

    navigateNow(target);
  }

  function cancelNavigation() {
    setExitConfirm(false);
    setPendingNavigationScreen(null);
  }

  function confirmNavigation() {
    const target = pendingNavigationScreen ?? 'home';

    clearRankingRecovery();
    session.clearSession();
    setExitConfirm(false);
    setPendingNavigationScreen(null);
    setScreen(target);
  }

  function requestMainMenu() {
    requestNavigation('home');
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
    if (session.collection && session.rankingState && !session.rankingState.current) {
      const record = makeRecentRanking(
        session.collection,
        session.rankingState,
        session.preferenceScores,
        ratings.personalRatings,
      );
      setCurrentResultId(record.id);
      setCurrentResultSaved(false);
      setRecentSaveError(null);
      const pending = myRankings.addRecent(record);
      pendingRecentWrite.current = pending;
      void pending.catch((reason: unknown) => {
        setRecentSaveError(reason instanceof Error ? reason.message : 'Could not keep this result temporarily.');
      });
    }
    setScreen('results');
  }

  async function saveCurrentRanking(overwriteId?: string) {
    if (!currentResultId) throw new Error('No completed ranking is available to save.');
    await pendingRecentWrite.current;
    await myRankings.save(currentResultId, overwriteId);
    setCurrentResultSaved(true);
  }

  function openStoredRanking(id: string) {
    setOpenedRankingId(id);
    setScreen('storedResults');
  }

  async function saveStoredRanking(id: string, overwriteId?: string) {
    await myRankings.save(id, overwriteId);
    setOpenedRankingId(overwriteId ?? id);
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

    if (!session.restoreFromRecovery(resumePrompt, restoredCollection)) {
      clearRankingRecovery();
      setResumePrompt(null);
      setScreen('home');
      return;
    }

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

  function deleteCollections(collectionIds: readonly string[]) {
    collectionLibrary.deleteCollections(collectionIds);

    if (session.collection && collectionIds.includes(session.collection.id)) {
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
    pendingNavigationScreen,
    collectionLibrary,
    ratings,
    session,
    myRankings,
    currentResultId,
    currentResultSaved,
    recentSaveError,
    openedRankingId,
    saveCurrentRanking,
    openStoredRanking,
    saveStoredRanking,
    requestNavigation,
    requestMainMenu,
    cancelNavigation,
    confirmNavigation,
    goHomeNow,
    selectCollection,
    startRanking,
    startRefinement,
    openRatings,
    showResults,
    resumeInterruptedRanking,
    discardInterruptedRanking,
    deleteCollection,
    deleteCollections,
    startNewRanking,
  };
}

