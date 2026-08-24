import { AppShell } from '@/app/AppShell';
import type { RankCollection } from '@/models';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import styles from './CollectionReviewScreen.module.css';

type CollectionReviewScreenProps = {
  collection: RankCollection;
  selectedItemIds: ReadonlySet<string>;
  onSelectedItemIdsChange: (ids: Set<string>) => void;
  onBack: () => void;
  onStartRanking: () => void;
  onMainMenu: () => void;
};

export function CollectionReviewScreen({
  collection,
  selectedItemIds,
  onSelectedItemIdsChange,
  onBack,
  onStartRanking,
  onMainMenu,
}: CollectionReviewScreenProps) {
  const gridDensityClass =
    collection.items.length <= 5
      ? `${styles.spaciousGrid} ${styles.singleRowGrid}`
      : collection.items.length <= 15
        ? styles.spaciousGrid
        : styles.denseGrid;

  function toggleItem(itemId: string) {
    const next = new Set(selectedItemIds);

    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }

    onSelectedItemIdsChange(next);
  }

  return (
    <AppShell>
      <AppHeader onMainMenu={onMainMenu} />

      <section className={`scene-panel ${styles.scene}`}>
        <div className={`scene-heading ${styles.heading}`}>
          <div>
            <h1>{collection.name}</h1>
            <p>Choose which items belong in this ranking.</p>
          </div>

          <strong>{selectedItemIds.size} selected</strong>
        </div>

        <div className={styles.toolbar}>
          <Button
            size="small"
            onClick={() => onSelectedItemIdsChange(new Set(collection.items.map((item) => item.id)))}
          >
            Select All
          </Button>
          <Button
            size="small"
            onClick={() => onSelectedItemIdsChange(new Set())}
          >
            Clear All
          </Button>
        </div>

        <div className={`${styles.grid} ${gridDensityClass}`}>
          {collection.items.map((item) => {
            const selected = selectedItemIds.has(item.id);

            return (
              <label
                className={`${styles.item} ${selected ? styles.selectedItem : ''}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleItem(item.id)}
                />

                <Poster
                  item={item}
                  className={styles.poster}
                />

                <span className={styles.itemCopy}>
                  <strong title={item.name}>{item.name}</strong>
                  {item.subtitle && <small title={item.subtitle}>{item.subtitle}</small>}
                </span>
              </label>
            );
          })}
        </div>

        <div className={styles.footer}>
          <Button onClick={onBack}>Back</Button>
          <Button
            variant="primary"
            onClick={onStartRanking}
            disabled={selectedItemIds.size < 2}
          >
            Rank {selectedItemIds.size} Items
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
