import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
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
import { ExitConfirmModal } from './components/ExitConfirmModal/ExitConfirmModal';
import { useAppController } from './hooks/useAppController';
import { AppShell } from './AppShell';

function App() {
  const app = useAppController();
  const { session } = app;

  if (app.resumePrompt) {
    const resumeCollection = app.collectionLibrary.availableCollections.find(
      (item) => item.id === app.resumePrompt?.collectionId,
    );

    return (
      <ResumeRankingScreen
        collectionName={resumeCollection?.name ?? 'Previous ranking'}
        placedItems={app.resumePrompt.rankingState.ranked.length}
        comparisons={app.resumePrompt.rankingState.comparisons}
        onResume={app.resumeInterruptedRanking}
        onDiscard={app.discardInterruptedRanking}
      />
    );
  }

  if (app.screen === 'home') {
    return (
      <MainMenuScreen
        onStartRanking={() => app.setScreen('collections')}
        onCollections={() => app.setScreen('manageCollections')}
      />
    );
  }

  if (app.screen === 'manageCollections') {
    return (
      <CollectionsScreen
        collections={app.collectionLibrary.availableCollections}
        itemLibrary={app.collectionLibrary.itemLibrary}
        onGenerate={() => app.setScreen('generateCollection')}
        getCandidateItems={app.collectionLibrary.getCandidateItems}
        onCreate={app.collectionLibrary.createCollection}
        onUpdate={app.collectionLibrary.updateCollection}
        onRefreshSource={app.collectionLibrary.refreshCollectionCandidates}
        onDelete={app.deleteCollection}
        onMainMenu={app.requestMainMenu}
      />
    );
  }

  if (app.screen === 'generateCollection') {
    return (
      <CollectionGeneratorScreen
        onCreateGeneratedCollection={app.collectionLibrary.createGeneratedCollection}
        onComplete={() => app.setScreen('manageCollections')}
        onBack={() => app.setScreen('manageCollections')}
        onMainMenu={app.requestMainMenu}
      />
    );
  }

  if (app.screen === 'collections') {
    return (
      <CollectionPickerScreen
        collections={app.collectionLibrary.availableCollections}
        onSelect={app.selectCollection}
        onMainMenu={app.requestMainMenu}
      />
    );
  }

  if (app.screen === 'review' && session.collection) {
    return (
      <CollectionReviewScreen
        collection={session.collection}
        selectedItemIds={session.selectedItemIds}
        onSelectedItemIdsChange={session.setSelectedItemIds}
        onBack={() => app.setScreen('collections')}
        onStartRanking={app.startRanking}
        onMainMenu={app.requestMainMenu}
      />
    );
  }

  if (!session.collection || !session.rankingState) {
    return null;
  }

  if (app.screen === 'ranking') {
    if (!session.rankingState.current) {
      return (
        <AppShell>
          <AppHeader onMainMenu={app.requestMainMenu} />
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
            onStay={() => app.setExitConfirm(false)}
            onExit={app.goHomeNow}
          />
        </AppShell>
      );
    }

    if (!session.currentOpponent) {
      return null;
    }

    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
        <RankingScreen
          current={session.rankingState.current}
          opponent={session.currentOpponent}
          placedCount={session.displayedPlaced}
          totalItems={session.selectedItemIds.size}
          comparisons={session.rankingState.comparisons}
          canUndo={session.rankingHistory.length > 0}
          onChoose={session.chooseNormal}
          onUndo={session.undoNormal}
        />
        <ExitConfirmModal
          open={app.exitConfirm}
          onStay={() => app.setExitConfirm(false)}
          onExit={app.goHomeNow}
        />
      </AppShell>
    );
  }

  if (app.screen === 'rankingComplete') {
    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
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
          onStay={() => app.setExitConfirm(false)}
          onExit={app.goHomeNow}
        />
      </AppShell>
    );
  }

  if (app.screen === 'refinement') {
    if (session.refinementIndex >= session.refinementPairs.length) {
      return (
        <AppShell>
          <AppHeader onMainMenu={app.requestMainMenu} />
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
            onStay={() => app.setExitConfirm(false)}
            onExit={app.goHomeNow}
          />
        </AppShell>
      );
    }

    if (!session.currentRefinementItems) {
      return null;
    }

    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
        <RefinementScreen
          first={session.currentRefinementItems.first}
          second={session.currentRefinementItems.second}
          index={session.refinementIndex}
          total={session.refinementPairs.length}
          canUndo={session.refinementHistory.length > 0}
          onChoose={session.chooseRefinement}
          onUndo={session.undoRefinement}
        />
        <ExitConfirmModal
          open={app.exitConfirm}
          onStay={() => app.setExitConfirm(false)}
          onExit={app.goHomeNow}
        />
      </AppShell>
    );
  }

  if (app.screen === 'refinementComplete') {
    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
        <RefinementCompleteScreen
          onRateItems={() => app.openRatings('refinementComplete')}
          onSeeResults={app.showResults}
        />
        <ExitConfirmModal
          open={app.exitConfirm}
          onStay={() => app.setExitConfirm(false)}
          onExit={app.goHomeNow}
        />
      </AppShell>
    );
  }

  if (app.screen === 'ratings') {
    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
        <PersonalRatingsScreen
          items={session.ratingOrder}
          personalRatings={app.ratings.personalRatings}
          onUpdateRating={app.ratings.updatePersonalRating}
          onBack={() => app.setScreen(session.ratingBackScreen)}
          onContinue={app.showResults}
        />
        <ExitConfirmModal
          open={app.exitConfirm}
          onStay={() => app.setExitConfirm(false)}
          onExit={app.goHomeNow}
        />
      </AppShell>
    );
  }

  if (app.screen === 'results') {
    return (
      <AppShell>
        <AppHeader onMainMenu={app.requestMainMenu} />
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

  return null;
}

export default App;
