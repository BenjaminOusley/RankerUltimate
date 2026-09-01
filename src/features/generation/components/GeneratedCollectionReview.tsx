import { useMemo, useState } from 'react';

import { getCanonicalItemKey } from '@/domain/itemIdentity';
import type { RankCollection } from '@/domain/models';
import chooserStyles from '@/features/collections/screens/CollectionReviewScreen/CollectionReviewScreen.module.css';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import styles from './GeneratedCollectionReview.module.css';

type GeneratedCollectionReviewProps = {
  collection: RankCollection;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (selectedItemKeys: ReadonlySet<string>) => void;
};

export function GeneratedCollectionReview({
  collection,
  isSaving,
  error,
  onBack,
  onSave,
}: GeneratedCollectionReviewProps) {
  const itemKeys = useMemo(
    () => collection.items.map((item) => getCanonicalItemKey(item)),
    [collection.items],
  );

  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    () => new Set(itemKeys),
  );

  const gridDensityClass =
    collection.items.length <= 5
      ? `${chooserStyles.spaciousGrid} ${chooserStyles.singleRowGrid}`
      : collection.items.length <= 15
        ? chooserStyles.spaciousGrid
        : chooserStyles.denseGrid;

  function toggleItem(itemKey: string) {
    setSelectedItemKeys((current) => {
      const next = new Set(current);

      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }

      return next;
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div>
          <span className={styles.eyebrow}>Review before saving</span>
          <h2>{collection.name}</h2>
          {collection.description && <p>{collection.description}</p>}
        </div>

        <strong className={styles.count}>
          {selectedItemKeys.size} / {collection.items.length} selected
        </strong>
      </div>

      <div className={chooserStyles.toolbar}>
        <Button
          size="small"
          onClick={() => setSelectedItemKeys(new Set(itemKeys))}
          disabled={isSaving}
        >
          Select All
        </Button>
        <Button
          size="small"
          onClick={() => setSelectedItemKeys(new Set())}
          disabled={isSaving}
        >
          Clear All
        </Button>
      </div>

      {collection.items.length === 0 ? (
        <div className={styles.empty}>
          No items were returned for this request. Go back and refine it before saving.
        </div>
      ) : (
        <div className={`${chooserStyles.grid} ${gridDensityClass}`}>
          {collection.items.map((item) => {
            const itemKey = getCanonicalItemKey(item);
            const selected = selectedItemKeys.has(itemKey);

            return (
              <label
                className={`${chooserStyles.item} ${selected ? chooserStyles.selectedItem : ''}`}
                key={itemKey}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleItem(itemKey)}
                  disabled={isSaving}
                />

                <Poster item={item} className={chooserStyles.poster} />

                <span className={chooserStyles.itemCopy}>
                  <strong title={item.name}>{item.name}</strong>
                  {item.subtitle && <small title={item.subtitle}>{item.subtitle}</small>}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={chooserStyles.footer}>
        <Button onClick={onBack} disabled={isSaving}>
          Change Request
        </Button>
        <Button
          variant="primary"
          onClick={() => onSave(selectedItemKeys)}
          disabled={isSaving || selectedItemKeys.size === 0}
        >
          {isSaving
            ? 'Saving…'
            : `Save ${selectedItemKeys.size} ${selectedItemKeys.size === 1 ? 'Item' : 'Items'}`}
        </Button>
      </div>
    </div>
  );
}
