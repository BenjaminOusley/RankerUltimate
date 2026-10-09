import type { ReactNode } from 'react';

import { CollectionPickerScreen } from '@/features/collections/screens/CollectionPickerScreen/CollectionPickerScreen';
import { CollectionReviewScreen } from '@/features/collections/screens/CollectionReviewScreen/CollectionReviewScreen';
import { CollectionsScreen } from '@/features/collections/screens/CollectionsScreen/CollectionsScreen';
import { CollectionGeneratorScreen } from '@/features/generation/screens/CollectionGeneratorScreen/CollectionGeneratorScreen';
import { MainMenuScreen } from '@/features/home/screens/MainMenuScreen/MainMenuScreen';
import { FinalChoiceCheckpoint } from '@/features/ranking/components/FinalChoiceCheckpoint/FinalChoiceCheckpoint';
import { RankingCompleteScreen } from '@/features/ranking/screens/RankingCompleteScreen/RankingCompleteScreen';
import { RankingScreen } from '@/features/ranking/screens/RankingScreen/RankingScreen';
import { RefinementCompleteScreen } from '@/features/ranking/screens/RefinementCompleteScreen/RefinementCompleteScreen';
import { RefinementScreen } from '@/features/ranking/screens/RefinementScreen/RefinementScreen';
import { ResumeRankingScreen } from '@/features/ranking/screens/ResumeRankingScreen/ResumeRankingScreen';
import { PersonalRatingsScreen } from '@/features/ratings/screens/PersonalRatingsScreen/PersonalRatingsScreen';
import { ResultsScreen } from '@/features/results/screens/ResultsScreen/ResultsScreen';
import { SharedResultsScreen } from '@/features/results/screens/SharedResultsScreen/SharedResultsScreen';
import { ExitConfirmModal } from './components/ExitConfirmModal/ExitConfirmModal';
import { useAppController } from './hooks/useAppController';
import { AppNavigationProvider } from './navigation/AppNavigation';
import { AppShell } from './AppShell';

function RankerApp() {
  const app = useAppController();
  const { session } = app;
  let content: ReactNode = null;

  if (app.resumePrompt) {
    const resumeCollection = app.collectionLibrary.availableCollections.find(
      (item) => item.id === app.resumePrompt?.collectionId,
    );

    content = (
      <ResumeRankingScreen
        collectionName={resumeCollection?.name ?? 'Previous ranking'}
        placedItems={app.resumePrompt.placedItems}
        comparisons={app.resumePrompt.comparisons}
        onResume={app.resumeInterruptedRanking}
        onDiscard={app.discardInterruptedRanking}
      />
    );
  } else if (app.screen === 'home') {
    content = (
      <MainMenuScreen
        onStartRanking={() => app.setScreen('collections')}
        onCollections={() => app.setScreen('manageCollections')}
      />
    );
  } else if (app.screen === 'manageCollections') {
    content = (
      <CollectionsScreen
        collections={app.collectionLibrary.availableCollections}
        itemLibrary={app.collectionLibrary.itemLibrary}
        onGenerate={() => app.setScreen('generateCollection')}
        getCandidateItems={app.collectionLibrary.getCandidateItems}
        onCreate={app.collectionLibrary.createCollection}
        onUpdate={app.collectionLibrary.updateCollection}
        onRefreshSource={app.collectionLibrary.refreshCollectionCandidates}
        onMoveToGroup={app.collectionLibrary.moveCollectionToGroup}
        onMoveManyToGroup={app.collectionLibrary.moveCollectionsToGroup}
        onDelete={app.deleteCollection}
        onDeleteMany={app.deleteCollections}
      />
    );
  } else if (app.screen === 'generateCollection') {
    content = (
      <CollectionGeneratorScreen
        onCreateGeneratedCollection={app.collectionLibrary.createGeneratedCollection}
        onComplete={() => app.setScreen('manageCollections')}
        onBack={() => app.setScreen('manageCollections')}
      />
    );
  } else if (app.screen === 'collections') {
    content = (
      <CollectionPickerScreen
        collections={app.collectionLibrary.availableCollections}
        onSelect={app.selectCollection}
      />
    );
  } else if (app.screen === 'review' && session.collection) {
    content = (
      <CollectionReviewScreen
        collection={session.collection}
        selectedItemIds={session.selectedItemIds}
        onSelectedItemIdsChange={session.setSelectedItemIds}
        onBack={() => app.setScreen('collections')}
        onStartRanking={app.startRanking}
      />
    );
  } else if (session.collection && session.rankingState) {
    if (app.screen === 'ranking') {
      if (!session.rankingState.current) {
        content = (
          <AppShell>
            <FinalChoiceCheckpoint
              title="Normal ranking complete"
              first={session.normalLastChoice?.first ?? null}
              second={session.normalLastChoice?.second ?? null}
              winnerId={session.normalLastChoice?.winnerId ?? null}
              onUndo={session.undoNormal}
              onContinue={() => app.setScreen('rankingComplete')}
            />
            <ExitConfirmModal
              open={app.exitConfirm}
              onStay={app.cancelNavigation}
              onExit={app.confirmNavigation}
            />
          </AppShell>
        );
      } else if (session.currentOpponent) {
        content = (
          <AppShell>
            <RankingScreen
              current={session.rankingState.current}
              opponent={session.currentOpponent}
              placedCount={session.displayedPlaced}
              totalItems={session.selectedItemIds.size}
              comparisons={session.rankingState.comparisons}
              canUndo={session.rankingWinnerIds.length > 0}
              onChoose={session.chooseNormal}
              onUndo={session.undoNormal}
            />
            <ExitConfirmModal
              open={app.exitConfirm}
              onStay={app.cancelNavigation}
              onExit={app.confirmNavigation}
            />
          </AppShell>
        );
      }
    } else if (app.screen === 'rankingComplete') {
      content = (
        <AppShell>
          <RankingCompleteScreen
            collectionName={session.collection.name}
            comparisons={session.rankingState.comparisons}
            refinementCount={session.refinementOptions.length}
            onRefine={app.startRefinement}
            onRateItems={() => app.openRatings('rankingComplete')}
            onSeeResults={app.showResults}
          />
          <ExitConfirmModal
            open={app.exitConfirm}
            onStay={app.cancelNavigation}
            onExit={app.confirmNavigation}
          />
        </AppShell>
      );
    } else if (app.screen === 'refinement') {
      if (session.refinementIndex >= session.refinementPairs.length) {
        content = (
          <AppShell>
            <FinalChoiceCheckpoint
              title="Refinement choices complete"
              first={session.refinementLastChoice?.first ?? null}
              second={session.refinementLastChoice?.second ?? null}
              winnerId={session.refinementLastChoice?.winnerId ?? null}
              onUndo={session.undoRefinement}
              onContinue={() => app.setScreen('refinementComplete')}
            />
            <ExitConfirmModal
              open={app.exitConfirm}
              onStay={app.cancelNavigation}
              onExit={app.confirmNavigation}
            />
          </AppShell>
        );
      } else if (session.currentRefinementItems) {
        content = (
          <AppShell>
            <RefinementScreen
              first={session.currentRefinementItems.first}
              second={session.currentRefinementItems.second}
              index={session.refinementIndex}
              total={session.refinementPairs.length}
              canUndo={session.refinementWinnerIds.length > 0}
              onChoose={session.chooseRefinement}
              onUndo={session.undoRefinement}
            />
            <ExitConfirmModal
              open={app.exitConfirm}
              onStay={app.cancelNavigation}
              onExit={app.confirmNavigation}
            />
          </AppShell>
        );
      }
    } else if (app.screen === 'refinementComplete') {
      content = (
        <AppShell>
          <RefinementCompleteScreen
            onRateItems={() => app.openRatings('refinementComplete')}
            onSeeResults={app.showResults}
          />
          <ExitConfirmModal
            open={app.exitConfirm}
            onStay={app.cancelNavigation}
            onExit={app.confirmNavigation}
          />
        </AppShell>
      );
    } else if (app.screen === 'ratings') {
      content = (
        <AppShell>
          <PersonalRatingsScreen
            items={session.ratingOrder}
            personalRatings={app.ratings.personalRatings}
            onUpdateRating={app.ratings.updatePersonalRating}
            onBack={() => app.setScreen(session.ratingBackScreen)}
            onContinue={app.showResults}
          />
          <ExitConfirmModal
            open={app.exitConfirm}
            onStay={app.cancelNavigation}
            onExit={app.confirmNavigation}
          />
        </AppShell>
      );
    } else if (app.screen === 'results') {
      content = (
        <AppShell>
          <ResultsScreen
            collection={session.collection}
            rankingState={session.rankingState}
            preferenceScores={session.preferenceScores}
            personalRatings={app.ratings.personalRatings}
            onNewRanking={app.startNewRanking}
          />
        </AppShell>
      );
    }
  }

  return (
    <AppNavigationProvider
      screen={app.screen}
      navigate={app.requestNavigation}
    >
      {content}
    </AppNavigationProvider>
  );
}

function getSharedResultId() {
  if (typeof window === 'undefined') {
    return null;
  }

  const shareId = new URLSearchParams(window.location.search).get('share')?.trim();
  return shareId || null;
}

function App() {
  const sharedResultId = getSharedResultId();

  if (sharedResultId) {
    return (
      <AppShell>
        <SharedResultsScreen
          key={sharedResultId}
          shareId={sharedResultId}
        />
      </AppShell>
    );
  }

  return <RankerApp />;
}

export default App;
