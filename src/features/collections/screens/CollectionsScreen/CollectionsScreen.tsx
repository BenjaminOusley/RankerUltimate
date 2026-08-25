import { useMemo, useState } from 'react';

import { AppShell } from '@/app/AppShell';
import type { RankCollection, RankItem } from '@/domain/models';
import { AppHeader } from '@/shared/components/AppHeader/AppHeader';
import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import { CollectionArtwork } from '../../components/CollectionArtwork/CollectionArtwork';
import {
  CollectionEditor,
  type CollectionEditorMode,
} from '../../components/CollectionEditor/CollectionEditor';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import styles from './CollectionsScreen.module.css';

type CollectionSort = 'nameAsc' | 'nameDesc' | 'itemsDesc' | 'itemsAsc';

type EditorState = {
  mode: CollectionEditorMode;
  collectionId: string | null;
};

type CollectionsScreenProps = {
  collections: readonly RankCollection[];
  itemLibrary: readonly RankItem[];
  onCreate: (name: string, description: string) => string;
  onUpdate: (collection: RankCollection, itemsChanged: boolean) => void;
  onDelete: (collectionId: string) => void;
  onMainMenu: () => void;
};

export function CollectionsScreen({
  collections,
  itemLibrary,
  onCreate,
  onUpdate,
  onDelete,
  onMainMenu,
}: CollectionsScreenProps) {
  const [sort, setSort] = useState<CollectionSort>('nameAsc');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const sortedCollections = useMemo(() => {
    return [...collections].sort((first, second) => {
      switch (sort) {
        case 'nameDesc':
          return second.name.localeCompare(first.name);
        case 'itemsDesc':
          return second.items.length - first.items.length;
        case 'itemsAsc':
          return first.items.length - second.items.length;
        case 'nameAsc':
        default:
          return first.name.localeCompare(second.name);
      }
    });
  }, [collections, sort]);

  const editorCollection = editor?.collectionId
    ? (collections.find((collection) => collection.id === editor.collectionId) ?? null)
    : null;

  const deleteTarget = deleteCollectionId
    ? (collections.find((collection) => collection.id === deleteCollectionId) ?? null)
    : null;

  return (
    <AppShell>
      <AppHeader onMainMenu={onMainMenu} />

      <ScenePanel className={styles.scene}>
        <SceneHeading className={styles.heading}>
          <div>
            <h1>My Collections</h1>
            <p>Create and manage your collections.</p>
          </div>

          <Button
            variant="primary"
            onClick={() => setEditor({ mode: 'create', collectionId: null })}
          >
            ＋ Create Collection
          </Button>
        </SceneHeading>

        <div className={styles.toolbar}>
          <strong>
            ▤ {collections.length} {collections.length === 1 ? 'Collection' : 'Collections'}
          </strong>

          <label className={styles.sortControl}>
            <span>Sort by:</span>
            <select
              className={styles.sortSelect}
              value={sort}
              onChange={(event) => setSort(event.target.value as CollectionSort)}
            >
              <option value="nameAsc">Name (A–Z)</option>
              <option value="nameDesc">Name (Z–A)</option>
              <option value="itemsDesc">Most Items</option>
              <option value="itemsAsc">Fewest Items</option>
            </select>
          </label>
        </div>

        <div className={styles.list}>
          {sortedCollections.map((collection) => (
            <article
              className={styles.row}
              key={collection.id}
            >
              <CollectionArtwork collection={collection} />

              <div className={styles.copy}>
                <strong
                  className={styles.name}
                  title={collection.name}
                >
                  {collection.name}
                </strong>

                {collection.description && <p>{collection.description}</p>}

                <span className={styles.count}>
                  ▤ {collection.items.length} {collection.items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className={styles.actions}>
                <Button
                  className={styles.editButton}
                  onClick={() =>
                    setEditor({ mode: 'edit', collectionId: collection.id })
                  }
                >
                  ✎ Edit
                </Button>

                <div className={styles.menuWrap}>
                  <Button
                    className={styles.overflowButton}
                    aria-label={`More options for ${collection.name}`}
                    aria-expanded={openMenuId === collection.id}
                    onClick={() =>
                      setOpenMenuId((previous) =>
                        previous === collection.id ? null : collection.id,
                      )
                    }
                  >
                    •••
                  </Button>

                  {openMenuId === collection.id && (
                    <div
                      className={styles.actionMenu}
                      role="menu"
                    >
                      <button
                        className={styles.deleteAction}
                        role="menuitem"
                        onClick={() => {
                          setDeleteCollectionId(collection.id);
                          setOpenMenuId(null);
                        }}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </ScenePanel>

      {editor && (
        <CollectionEditor
          key={`${editor.mode}:${editor.collectionId ?? 'new'}`}
          mode={editor.mode}
          collection={editorCollection}
          availableCollections={collections}
          itemLibrary={itemLibrary}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onClose={() => setEditor(null)}
        />
      )}

      {deleteTarget && (
        <Modal
          className={styles.deleteModal}
          aria-labelledby="delete-collection-title"
        >
          <h2 id="delete-collection-title">Delete Collection?</h2>
          <p>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
          </p>
          <p>This deletes the collection only. Your Personal Ratings are not affected.</p>

          <div className={styles.modalActions}>
            <Button onClick={() => setDeleteCollectionId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                onDelete(deleteTarget.id);
                setDeleteCollectionId(null);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
