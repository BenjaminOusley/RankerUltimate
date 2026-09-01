import { useState } from 'react';

import { AppShell } from '@/app/AppShell';
import type { RankCollection } from '@/domain/models';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Button } from '@/shared/components/Button/Button';
import { SceneHeading, ScenePanel, ScrollPanel } from '@/shared/components/Scene/Scene';
import { generateCollection } from '../../api/generateCollection';
import { searchCompanies } from '../../api/searchCompanies';
import { searchIgdbEntities } from '../../api/searchIgdbEntities';
import { searchPeople } from '../../api/searchPeople';
import { CollectionGenerator } from '../../components/CollectionGenerator';
import { ConversationalCollectionGenerator } from '../../components/ConversationalCollectionGenerator';
import { GeneratedCollectionReview } from '../../components/GeneratedCollectionReview';
import type { GenerationRequest } from '../../types';
import styles from './CollectionGeneratorScreen.module.css';

type CollectionGeneratorScreenProps = {
  onCreateGeneratedCollection: (
    collection: RankCollection,
    selectedItemKeys?: ReadonlySet<string>,
  ) => Promise<string>;
  onComplete: (collectionId: string) => void;
  onBack: () => void;
  onMainMenu: () => void;
};

type GeneratorMode = 'conversation' | 'advanced';

export function CollectionGeneratorScreen({
  onCreateGeneratedCollection,
  onComplete,
  onBack,
  onMainMenu,
}: CollectionGeneratorScreenProps) {
  const [mode, setMode] = useState<GeneratorMode>('conversation');
  const [pendingCollection, setPendingCollection] = useState<RankCollection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleAdvancedGenerate(request: GenerationRequest) {
    const collection = await generateCollection(request);
    setPendingCollection(collection);
    setSaveError(null);
    return collection.id;
  }

  function handleBuilt(collection: RankCollection) {
    setPendingCollection(collection);
    setSaveError(null);
  }

  async function handleSave(selectedItemKeys: ReadonlySet<string>) {
    if (!pendingCollection || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const collectionId = await onCreateGeneratedCollection(
        pendingCollection,
        selectedItemKeys,
      );
      onComplete(collectionId);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Saving the generated collection failed.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <AppHeader onMainMenu={onMainMenu} />

      <ScenePanel
        className={`${styles.scene} ${pendingCollection ? styles.reviewScene : ''}`}
      >
        <SceneHeading className={styles.heading}>
          <div>
            <h1>{pendingCollection ? 'Review Collection' : 'Generate Collection'}</h1>
            <p>
              {pendingCollection
                ? 'Check the generated items before adding this collection to your library.'
                : mode === 'conversation'
                  ? 'Describe what you want to rank and clarify anything ambiguous in your own words.'
                  : 'Build movie, TV, or game collections directly from TMDB and IGDB.'}
            </p>
          </div>

          <div className={styles.headingActions}>
            {!pendingCollection && (
              <Button
                variant="quiet"
                onClick={() => setMode(mode === 'conversation' ? 'advanced' : 'conversation')}
              >
                {mode === 'conversation' ? 'Advanced generator' : 'Conversational generator'}
              </Button>
            )}
            {!pendingCollection && <Button onClick={onBack}>← Back</Button>}
          </div>
        </SceneHeading>

        {pendingCollection ? (
          <div className={styles.reviewWrap}>
            <GeneratedCollectionReview
              collection={pendingCollection}
              isSaving={isSaving}
              error={saveError}
              onBack={() => {
                setPendingCollection(null);
                setSaveError(null);
              }}
              onSave={handleSave}
            />
          </div>
        ) : (
          <ScrollPanel className={styles.scroll}>
            {mode === 'conversation' ? (
              <ConversationalCollectionGenerator onBuilt={handleBuilt} />
            ) : (
              <CollectionGenerator
                initialRequest={null}
                onGenerate={handleAdvancedGenerate}
                onGenerated={() => undefined}
                onSearchPeople={searchPeople}
                onSearchCompanies={searchCompanies}
                onSearchIgdbEntities={searchIgdbEntities}
              />
            )}
          </ScrollPanel>
        )}
      </ScenePanel>
    </AppShell>
  );
}
