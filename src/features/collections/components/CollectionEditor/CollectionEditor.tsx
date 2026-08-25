import { useMemo, useState } from 'react';

import type { RankCollection, RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import { Poster } from '@/shared/components/Poster/Poster';
import { getCollectionLibraryItemKey } from '../../library/collectionLibrary';
import styles from './CollectionEditor.module.css';

export type CollectionEditorMode = 'create' | 'edit';

type CollectionEditorProps = {
  mode: CollectionEditorMode;
  collection: RankCollection | null;
  availableCollections: readonly RankCollection[];
  itemLibrary: readonly RankItem[];
  onCreate: (name: string, description: string) => string;
  onUpdate: (collection: RankCollection, itemsChanged: boolean) => void;
  onClose: () => void;
};

export function CollectionEditor({
  mode,
  collection,
  availableCollections,
  itemLibrary,
  onCreate,
  onUpdate,
  onClose,
}: CollectionEditorProps) {
  const [currentMode, setCurrentMode] = useState<CollectionEditorMode>(mode);
  const [tab, setTab] = useState<'details' | 'items'>('details');
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(
    collection?.id ?? null,
  );
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(
    () => new Set(collection?.items.map(getCollectionLibraryItemKey) ?? []),
  );
  const [itemsDirty, setItemsDirty] = useState(false);
  const [itemSearch, setItemSearch] = useState('');

  const normalizedName = name.trim().toLowerCase();
  const nameConflict =
    normalizedName.length > 0 &&
    availableCollections.some(
      (item) =>
        item.id !== editingCollectionId && item.name.trim().toLowerCase() === normalizedName,
    );

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();

    if (!query) {
      return itemLibrary;
    }

    return itemLibrary.filter((item) =>
      `${item.name} ${item.subtitle ?? ''}`.toLowerCase().includes(query),
    );
  }, [itemLibrary, itemSearch]);

  function toggleItem(item: RankItem) {
    const key = getCollectionLibraryItemKey(item);

    setSelectedItemKeys((previous) => {
      const next = new Set(previous);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });

    setItemsDirty(true);
  }

  function save() {
    const trimmedName = name.trim();

    if (!trimmedName || nameConflict) {
      return;
    }

    const trimmedDescription = description.trim();

    if (currentMode === 'create') {
      const collectionId = onCreate(trimmedName, trimmedDescription);

      setCurrentMode('edit');
      setEditingCollectionId(collectionId);
      setTab('items');
      setSelectedItemKeys(new Set());
      setItemsDirty(false);
      return;
    }

    if (!editingCollectionId) {
      return;
    }

    const existingCollection = availableCollections.find(
      (item) => item.id === editingCollectionId,
    );

    if (!existingCollection) {
      onClose();
      return;
    }

    const selectedItems = itemLibrary.filter((item) =>
      selectedItemKeys.has(getCollectionLibraryItemKey(item)),
    );

    onUpdate(
      {
        ...existingCollection,
        name: trimmedName,
        description: trimmedDescription || undefined,
        items: selectedItems,
      },
      itemsDirty,
    );

    onClose();
  }

  return (
    <Modal
      className={`${styles.modal} ${currentMode === 'create' ? styles.createModal : ''}`}
      aria-labelledby="collection-editor-title"
    >
      <div className={styles.header}>
        <div>
          <h2 id="collection-editor-title">
            {currentMode === 'create' ? 'Create Collection' : 'Edit Collection'}
          </h2>

          {currentMode === 'edit' && (
            <span>
              {selectedItemKeys.size} {selectedItemKeys.size === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>

        <button
          className={styles.close}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {currentMode === 'edit' && (
        <div className={styles.tabs}>
          <button
            className={tab === 'details' ? styles.activeTab : ''}
            onClick={() => setTab('details')}
          >
            Details
          </button>

          <button
            className={tab === 'items' ? styles.activeTab : ''}
            onClick={() => setTab('items')}
          >
            Items
          </button>
        </div>
      )}

      <div className={styles.body}>
        {currentMode === 'create' || tab === 'details' ? (
          <div className={styles.fields}>
            <label>
              <span>Name</span>

              <input
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My Favorite Things"
                autoFocus
              />
            </label>

            <label>
              <span>
                Description <em>(optional)</em>
              </span>

              <textarea
                className={styles.textarea}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add a short description…"
              />
            </label>

            {nameConflict && (
              <p className={styles.error}>You already have a collection with that name.</p>
            )}

            {currentMode === 'create' && (
              <p className={styles.help}>
                After creating it, you’ll choose which items belong in the collection.
              </p>
            )}
          </div>
        ) : (
          <div className={styles.itemsEditor}>
            <input
              className={styles.search}
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Search items…"
            />

            <div className={styles.itemList}>
              {filteredItems.map((item) => {
                const key = getCollectionLibraryItemKey(item);
                const selected = selectedItemKeys.has(key);

                return (
                  <label
                    className={`${styles.item} ${selected ? styles.selectedItem : ''}`}
                    key={key}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleItem(item)}
                    />

                    <Poster
                      item={item}
                      className={styles.poster}
                    />

                    <div className={styles.itemCopy}>
                      <strong title={item.name}>{item.name}</strong>
                      {item.subtitle && <span>{item.subtitle}</span>}
                    </div>
                  </label>
                );
              })}

              {filteredItems.length === 0 && <div className={styles.empty}>No matching items.</div>}
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!name.trim() || nameConflict}
          onClick={save}
        >
          {currentMode === 'create' ? 'Create' : 'Save Collection'}
        </Button>
      </div>
    </Modal>
  );
}
