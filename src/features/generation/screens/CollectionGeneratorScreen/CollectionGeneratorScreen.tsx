import { AppShell } from '@/app/AppShell';
import type { RankCollection } from '@/domain/models';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Button } from '@/shared/components/Button/Button';
import { SceneHeading, ScenePanel, ScrollPanel } from '@/shared/components/Scene/Scene';
import { generateCollection } from '../../api/generateCollection';
import { searchCompanies } from '../../api/searchCompanies';
import { searchPeople } from '../../api/searchPeople';
import { CollectionGenerator } from '../../components/CollectionGenerator';
import type { GenerationRequest } from '../../types';
import styles from './CollectionGeneratorScreen.module.css';

type CollectionGeneratorScreenProps = {
  onCreateGeneratedCollection: (collection: RankCollection) => Promise<string>;
  onComplete: (collectionId: string) => void;
  onBack: () => void;
  onMainMenu: () => void;
};

export function CollectionGeneratorScreen({
  onCreateGeneratedCollection,
  onComplete,
  onBack,
  onMainMenu,
}: CollectionGeneratorScreenProps) {
  async function handleGenerate(request: GenerationRequest) {
    const collection = await generateCollection(request);

    return onCreateGeneratedCollection(collection);
  }

  return (
    <AppShell>
      <AppHeader onMainMenu={onMainMenu} />

      <ScenePanel className={styles.scene}>
        <SceneHeading className={styles.heading}>
          <div>
            <h1>Generate Collection</h1>
            <p>Build a movie collection from TMDB.</p>
          </div>

          <Button onClick={onBack}>← Back</Button>
        </SceneHeading>

        <ScrollPanel className={styles.scroll}>
          <CollectionGenerator
            initialRequest={null}
            onGenerate={handleGenerate}
            onGenerated={onComplete}
            onSearchPeople={searchPeople}
            onSearchCompanies={searchCompanies}
          />
        </ScrollPanel>
      </ScenePanel>
    </AppShell>
  );
}
