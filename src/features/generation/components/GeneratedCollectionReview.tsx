import { useMemo, useState } from 'react';

import { getCanonicalItemKey } from '@/domain/itemIdentity';
import type { CollectionGroupId, RankCollection } from '@/domain/models';
import {
  collectionHasRequestedItemOrder,
  collectionSupportsDateSort,
  getDefaultCollectionItemDisplaySort,
  sortCollectionItemsForDisplay,
  type CollectionItemDisplaySort,
} from '@/features/collections/model/collectionItemDisplaySort';
import chooserStyles from '@/features/collections/screens/CollectionReviewScreen/CollectionReviewScreen.module.css';
import {
  COLLECTION_GROUPS,
  getCollectionGroupId,
} from '@/features/collections/model/collectionGroups';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import styles from './GeneratedCollectionReview.module.css';

type GeneratedCollectionReviewProps = {
  collection: RankCollection;
  isSaving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (selectedItemKeys: ReadonlySet<string>, groupId: CollectionGroupId) => void;
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

  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(() => new Set(itemKeys));
  const [groupId, setGroupId] = useState<CollectionGroupId>(() => getCollectionGroupId(collection));
  const [itemSort, setItemSort] = useState<CollectionItemDisplaySort>(() =>
    getDefaultCollectionItemDisplaySort(collection),
  );
  const displayItems = useMemo(
    () => sortCollectionItemsForDisplay(collection.items, itemSort),
    [collection.items, itemSort],
  );
  const supportsDateSort = collectionSupportsDateSort(collection);
  const hasRequestedOrder = collectionHasRequestedItemOrder(collection);

  const gridDensityClass =
    collection.items.length <= 5
      ? `${chooserStyles.spaciousGrid} ${chooserStyles.singleRowGrid}`
      : collection.items.length <= 15
        ? chooserStyles.spaciousGrid
        : collection.items.length <= 40
          ? `${chooserStyles.denseGrid} ${chooserStyles.mediumDenseGrid}`
          : `${chooserStyles.denseGrid} ${chooserStyles.largeDenseGrid}`;

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
        <div className={styles.summaryCopy}>
          <span className={styles.eyebrow}>Review before saving</span>
          <h2>{collection.name}</h2>
          {collection.description && <p>{collection.description}</p>}

          <div className={styles.summaryActions}>
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
        </div>

        <div className={styles.summaryMeta}>
          <label className={styles.sortControl}>
            <span>Display order</span>
            <select
              value={itemSort}
              onChange={(event) => setItemSort(event.target.value as CollectionItemDisplaySort)}
              disabled={isSaving}
            >
              <option value="nameAsc">Name (A–Z)</option>
              <option value="nameDesc">Name (Z–A)</option>
              {supportsDateSort && <option value="dateAsc">Date (oldest first)</option>}
              {supportsDateSort && <option value="dateDesc">Date (newest first)</option>}
              <option value="source">{hasRequestedOrder ? 'Requested order' : 'Original order'}</option>
            </select>
          </label>

          <label className={styles.groupControl}>
            <span>Collection group</span>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value as CollectionGroupId)}
              disabled={isSaving}
            >
              {COLLECTION_GROUPS.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>

          <strong className={styles.count}>
            {selectedItemKeys.size} / {collection.items.length} selected
          </strong>
        </div>
      </div>

      {collection.items.length === 0 ? (
        <div className={styles.empty}>
          No items were returned for this request. Go back and refine it before saving.
        </div>
      ) : (
        <div className={`${chooserStyles.grid} ${gridDensityClass}`}>
          {displayItems.map((item) => {
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

                <Poster
                  item={item}
                  className={chooserStyles.poster}
                />

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
        <Button
          onClick={onBack}
          disabled={isSaving}
        >
          Change Request
        </Button>
        <Button
          variant="primary"
          onClick={() => onSave(selectedItemKeys, groupId)}
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
