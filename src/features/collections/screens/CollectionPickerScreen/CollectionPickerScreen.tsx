import { useMemo, useState } from 'react';

import { AppShell } from '@/app/AppShell';
import type { RankCollection } from '@/domain/models';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import styles from './CollectionPickerScreen.module.css';

type CollectionPickerScreenProps = {
  collections: readonly RankCollection[];
  onSelect: (collection: RankCollection) => void;
  onMainMenu: () => void;
};

export function CollectionPickerScreen({
  collections,
  onSelect,
  onMainMenu,
}: CollectionPickerScreenProps) {
  const [search, setSearch] = useState('');

  const visibleCollections = useMemo(() => {
    const query = search.trim().toLowerCase();

    return collections.filter((collection) =>
      query
        ? `${collection.name} ${collection.description ?? ''}`.toLowerCase().includes(query)
        : true,
    );
  }, [collections, search]);

  return (
    <AppShell>
      <AppHeader onMainMenu={onMainMenu} />

      <ScenePanel className={styles.scene}>
        <SceneHeading>
          <div>
            <h1>Select a Collection</h1>
            <p>Pick the list you want to rank.</p>
          </div>
        </SceneHeading>

        <input
          className={styles.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search collections…"
        />

        <div className={styles.list}>
          {visibleCollections.map((collection) => (
            <button
              className={styles.row}
              key={collection.id}
              onClick={() => onSelect(collection)}
              disabled={collection.items.length < 2}
              title={
                collection.items.length < 2
                  ? 'Add at least 2 items before ranking this collection.'
                  : undefined
              }
            >
              <div className={styles.icon}>{collection.name.charAt(0)}</div>
              <div className={styles.copy}>
                <strong>{collection.name}</strong>
                <span>{collection.items.length} items</span>
              </div>
              <span className={styles.chevron}>›</span>
            </button>
          ))}
        </div>
      </ScenePanel>
    </AppShell>
  );
}
