import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { AppShell } from '@/app/AppShell';
import type { CollectionGroupId, RankCollection, RankItem } from '@/domain/models';
import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import { Poster } from '@/shared/components/Poster/Poster';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import { canRefreshCollectionSource } from '../../api/refreshCollectionSource';
import { CollectionArtwork } from '../../components/CollectionArtwork/CollectionArtwork';
import {
  collectionHasRequestedItemOrder,
  collectionSupportsDateSort,
  getDefaultCollectionItemDisplaySort,
  sortCollectionItemsForDisplay,
  type CollectionItemDisplaySort,
} from '../../model/collectionItemDisplaySort';
import {
  CollectionEditor,
  type CollectionEditorMode,
} from '../../components/CollectionEditor/CollectionEditor';
import {
  COLLECTION_GROUPS,
  getCollectionGroupId,
  getCollectionPermissions,
} from '../../model/collectionGroups';
import styles from './CollectionsScreen.module.css';

type CollectionSort = 'nameAsc' | 'nameDesc' | 'itemsDesc' | 'itemsAsc';

type EditorState = {
  mode: CollectionEditorMode;
  collectionId: string | null;
};

type PointerDragCandidate = {
  pointerId: number;
  collectionId: string;
  startX: number;
  startY: number;
  active: boolean;
};

type CollectionsScreenProps = {
  collections: readonly RankCollection[];
  itemLibrary: readonly RankItem[];
  onGenerate: () => void;
  getCandidateItems: (collectionId: string | null) => readonly RankItem[];
  onCreate: (name: string, description: string) => string;
  onUpdate: (collection: RankCollection, itemsChanged: boolean) => void;
  onRefreshSource: (collectionId: string) => Promise<void>;
  onMoveToGroup: (collectionId: string, groupId: CollectionGroupId) => void;
  onMoveManyToGroup: (collectionIds: readonly string[], groupId: CollectionGroupId) => void;
  onDelete: (collectionId: string) => void;
  onDeleteMany: (collectionIds: readonly string[]) => void;
};

export function CollectionsScreen({
  collections,
  itemLibrary,
  onGenerate,
  getCandidateItems,
  onCreate,
  onUpdate,
  onRefreshSource,
  onMoveToGroup,
  onMoveManyToGroup,
  onDelete,
  onDeleteMany,
}: CollectionsScreenProps) {
  const [sort, setSort] = useState<CollectionSort>('nameAsc');
  const [search, setSearch] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [refreshingCollectionId, setRefreshingCollectionId] = useState<string | null>(null);
  const [deleteCollectionId, setDeleteCollectionId] = useState<string | null>(null);
  const [previewCollectionId, setPreviewCollectionId] = useState<string | null>(null);
  const [previewSort, setPreviewSort] = useState<CollectionItemDisplaySort>('nameAsc');
  const [moveCollectionId, setMoveCollectionId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<CollectionGroupId>>(
    () => new Set(['movies-tv']),
  );
  const [draggingCollectionId, setDraggingCollectionId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<CollectionGroupId | null>(null);
  const [deleteDropActive, setDeleteDropActive] = useState(false);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragScrollDirection, setDragScrollDirection] = useState<'up' | 'down' | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const groupsRef = useRef<HTMLDivElement>(null);
  const topScrollZoneRef = useRef<HTMLDivElement>(null);
  const bottomScrollZoneRef = useRef<HTMLDivElement>(null);
  const deleteDropRef = useRef<HTMLDivElement>(null);
  const dragCandidateRef = useRef<PointerDragCandidate | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextCardClickRef = useRef(false);

  const visibleCollections = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filteredCollections = query
      ? collections.filter((collection) => {
          const searchableText = [collection.name, collection.description ?? '']
            .join(' ')
            .toLowerCase();

          return searchableText.includes(query);
        })
      : [...collections];

    return filteredCollections.sort((first, second) => {
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
  }, [collections, search, sort]);

  const groupedCollections = useMemo(
    () =>
      COLLECTION_GROUPS.map((group) => ({
        ...group,
        collections: visibleCollections.filter(
          (collection) => getCollectionGroupId(collection) === group.id,
        ),
      })),
    [visibleCollections],
  );

  const editorCollection = editor?.collectionId
    ? (collections.find((collection) => collection.id === editor.collectionId) ?? null)
    : null;

  const deleteTarget = deleteCollectionId
    ? (collections.find((collection) => collection.id === deleteCollectionId) ?? null)
    : null;

  const moveTarget = moveCollectionId
    ? (collections.find((collection) => collection.id === moveCollectionId) ?? null)
    : null;

  const previewTarget = previewCollectionId
    ? (collections.find((collection) => collection.id === previewCollectionId) ?? null)
    : null;
  const previewItems = useMemo(
    () => (previewTarget ? sortCollectionItemsForDisplay(previewTarget.items, previewSort) : []),
    [previewTarget, previewSort],
  );
  const previewSupportsDateSort = previewTarget ? collectionSupportsDateSort(previewTarget) : false;
  const previewHasRequestedOrder = previewTarget
    ? collectionHasRequestedItemOrder(previewTarget)
    : false;

  const draggingCollection = draggingCollectionId
    ? (collections.find((collection) => collection.id === draggingCollectionId) ?? null)
    : null;
  const draggingPermissions = draggingCollection
    ? getCollectionPermissions(draggingCollection)
    : null;

  const selectedCollections = collections.filter((collection) =>
    selectedCollectionIds.has(collection.id),
  );
  const selectedCollectionIdList = selectedCollections.map((collection) => collection.id);
  const selectedCount = selectedCollections.length;
  const canBulkMove =
    selectedCount > 0 &&
    selectedCollections.every((collection) => getCollectionPermissions(collection).move);
  const canBulkDelete =
    selectedCount > 0 &&
    selectedCollections.every((collection) => getCollectionPermissions(collection).delete);
  const visibleSelectableCollectionIds = visibleCollections
    .filter((collection) => {
      const permissions = getCollectionPermissions(collection);
      return permissions.move || permissions.delete;
    })
    .map((collection) => collection.id);

  const editorItemLibrary = editor?.collectionId
    ? getCandidateItems(editor.collectionId)
    : itemLibrary;

  const allGroupsExpanded = COLLECTION_GROUPS.every((group) => expandedGroups.has(group.id));
  const searching = search.trim().length > 0;

  useEffect(() => {
    if (!draggingCollectionId) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    function pointerInsideElement(element: HTMLElement | null, clientX: number, clientY: number) {
      const bounds = element?.getBoundingClientRect();

      return Boolean(
        bounds &&
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom,
      );
    }

    function groupAtPointer(clientX: number, clientY: number): CollectionGroupId | null {
      const element = document.elementFromPoint(clientX, clientY);
      const groupElement = element?.closest<HTMLElement>('[data-collection-group-id]');
      const groupId = groupElement?.dataset.collectionGroupId;

      if (!groupId || !COLLECTION_GROUPS.some((group) => group.id === groupId)) {
        return null;
      }

      return groupId as CollectionGroupId;
    }

    function handleDragWheel(event: WheelEvent) {
      const container = groupsRef.current;
      const pointer = dragPointerRef.current;
      const collection = collections.find((item) => item.id === draggingCollectionId);

      if (!container || !pointer || !collection || event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      container.scrollTop += event.deltaY;

      const permissions = getCollectionPermissions(collection);

      const scrollDirection = pointerInsideElement(topScrollZoneRef.current, pointer.x, pointer.y)
        ? 'up'
        : pointerInsideElement(bottomScrollZoneRef.current, pointer.x, pointer.y)
          ? 'down'
          : null;

      setDragScrollDirection(scrollDirection);

      if (scrollDirection) {
        setDeleteDropActive(false);
        setDragOverGroupId(null);
        return;
      }

      const deleteTargetActive =
        permissions.delete && pointerInsideElement(deleteDropRef.current, pointer.x, pointer.y);

      if (deleteTargetActive) {
        setDeleteDropActive(true);
        setDragOverGroupId(null);
        return;
      }

      setDeleteDropActive(false);
      setDragOverGroupId(permissions.move ? groupAtPointer(pointer.x, pointer.y) : null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      dragCandidateRef.current = null;
      dragPointerRef.current = null;
      setDraggingCollectionId(null);
      setDragOverGroupId(null);
      setDeleteDropActive(false);
      setDragPointer(null);
      setDragScrollDirection(null);
    }

    window.addEventListener('wheel', handleDragWheel, {
      passive: false,
      capture: true,
    });
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('wheel', handleDragWheel, {
        capture: true,
      });
      window.removeEventListener('keydown', handleEscape);
    };
  }, [collections, draggingCollectionId]);

  useEffect(() => {
    if (!draggingCollectionId || !dragScrollDirection) {
      return;
    }

    let animationFrame = 0;

    const scroll = () => {
      const container = groupsRef.current;

      if (container) {
        container.scrollTop += dragScrollDirection === 'up' ? -14 : 14;
      }

      animationFrame = window.requestAnimationFrame(scroll);
    };

    animationFrame = window.requestAnimationFrame(scroll);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [dragScrollDirection, draggingCollectionId]);

  function toggleGroup(groupId: CollectionGroupId) {
    setExpandedGroups((previous) => {
      const next = new Set(previous);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  function toggleAllGroups() {
    setExpandedGroups(
      allGroupsExpanded ? new Set() : new Set(COLLECTION_GROUPS.map((group) => group.id)),
    );
  }

  function openCollectionPreview(collection: RankCollection) {
    setPreviewSort(getDefaultCollectionItemDisplaySort(collection));
    setPreviewCollectionId(collection.id);
  }

  function clearDragState() {
    dragCandidateRef.current = null;
    dragPointerRef.current = null;
    setDraggingCollectionId(null);
    setDragOverGroupId(null);
    setDeleteDropActive(false);
    setDragPointer(null);
    setDragScrollDirection(null);
  }

  function getPointerGroupId(clientX: number, clientY: number): CollectionGroupId | null {
    const element = document.elementFromPoint(clientX, clientY);
    const groupElement = element?.closest<HTMLElement>('[data-collection-group-id]');
    const groupId = groupElement?.dataset.collectionGroupId;

    if (!groupId || !COLLECTION_GROUPS.some((group) => group.id === groupId)) {
      return null;
    }

    return groupId as CollectionGroupId;
  }

  function isPointerOverDeleteTarget(clientX: number, clientY: number) {
    const bounds = deleteDropRef.current?.getBoundingClientRect();

    return Boolean(
      bounds &&
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom,
    );
  }

  function isPointerInsideElement(element: HTMLElement | null, clientX: number, clientY: number) {
    const bounds = element?.getBoundingClientRect();

    return Boolean(
      bounds &&
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom,
    );
  }

  function getPointerScrollDirection(clientX: number, clientY: number) {
    if (isPointerInsideElement(topScrollZoneRef.current, clientX, clientY)) {
      return 'up' as const;
    }

    if (isPointerInsideElement(bottomScrollZoneRef.current, clientX, clientY)) {
      return 'down' as const;
    }

    return null;
  }

  function updatePointerDrag(clientX: number, clientY: number, collection: RankCollection) {
    const permissions = getCollectionPermissions(collection);
    const pointer = { x: clientX, y: clientY };

    dragPointerRef.current = pointer;
    setDragPointer(pointer);

    const scrollDirection = getPointerScrollDirection(clientX, clientY);
    setDragScrollDirection(scrollDirection);

    if (scrollDirection) {
      setDeleteDropActive(false);
      setDragOverGroupId(null);
      return;
    }

    if (permissions.delete && isPointerOverDeleteTarget(clientX, clientY)) {
      setDeleteDropActive(true);
      setDragOverGroupId(null);
      return;
    }

    setDeleteDropActive(false);
    setDragOverGroupId(permissions.move ? getPointerGroupId(clientX, clientY) : null);
  }

  function beginPointerDragCandidate(
    event: ReactPointerEvent<HTMLElement>,
    collection: RankCollection,
  ) {
    if (event.button !== 0 || selectionMode) {
      return;
    }

    const permissions = getCollectionPermissions(collection);

    if (!permissions.move && !permissions.delete) {
      return;
    }

    const target = event.target as HTMLElement;
    const actionButton = target.closest('button');
    const artworkButton = target.closest(`.${styles.cardArtworkButton}`);

    if (actionButton && !artworkButton) {
      return;
    }

    dragCandidateRef.current = {
      pointerId: event.pointerId,
      collectionId: collection.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerDragMove(
    event: ReactPointerEvent<HTMLElement>,
    collection: RankCollection,
  ) {
    const candidate = dragCandidateRef.current;

    if (
      !candidate ||
      candidate.pointerId !== event.pointerId ||
      candidate.collectionId !== collection.id
    ) {
      return;
    }

    if (!candidate.active) {
      const distance = Math.hypot(
        event.clientX - candidate.startX,
        event.clientY - candidate.startY,
      );

      if (distance < 7) {
        return;
      }

      candidate.active = true;
      suppressNextCardClickRef.current = true;
      setDraggingCollectionId(collection.id);
      setOpenMenuId(null);
    }

    event.preventDefault();
    updatePointerDrag(event.clientX, event.clientY, collection);
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLElement>, collection: RankCollection) {
    const candidate = dragCandidateRef.current;

    if (
      !candidate ||
      candidate.pointerId !== event.pointerId ||
      candidate.collectionId !== collection.id
    ) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!candidate.active) {
      dragCandidateRef.current = null;
      return;
    }

    const permissions = getCollectionPermissions(collection);
    const scrollDirection = getPointerScrollDirection(event.clientX, event.clientY);
    const deleteTargetActive =
      !scrollDirection &&
      permissions.delete &&
      isPointerOverDeleteTarget(event.clientX, event.clientY);
    const groupId =
      !scrollDirection && permissions.move ? getPointerGroupId(event.clientX, event.clientY) : null;

    if (deleteTargetActive) {
      setDeleteCollectionId(collection.id);
    } else if (groupId) {
      if (getCollectionGroupId(collection) !== groupId) {
        onMoveToGroup(collection.id, groupId);
      }

      setExpandedGroups((previous) => new Set([...previous, groupId]));
    }

    clearDragState();

    window.setTimeout(() => {
      suppressNextCardClickRef.current = false;
    }, 0);
  }

  function cancelPointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const candidate = dragCandidateRef.current;

    if (candidate?.pointerId === event.pointerId) {
      clearDragState();
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedCollectionIds(new Set());
    setBulkMoveOpen(false);
    setBulkDeleteOpen(false);
  }

  function toggleCollectionSelection(collectionId: string) {
    setSelectedCollectionIds((previous) => {
      const next = new Set(previous);

      if (next.has(collectionId)) {
        next.delete(collectionId);
      } else {
        next.add(collectionId);
      }

      return next;
    });
  }

  function selectAllVisibleCollections() {
    setSelectedCollectionIds(
      (previous) => new Set([...previous, ...visibleSelectableCollectionIds]),
    );
  }

  return (
    <AppShell>
      <ScenePanel
        className={`${styles.scene} ${draggingCollection ? styles.sceneDragging : ''} ${selectionMode ? styles.sceneSelecting : ''}`}
      >
        <SceneHeading className={styles.heading}>
          <div>
            <h1>Collection Library</h1>
            <p>Browse, organize, and manage your collections.</p>
          </div>

          <div className={styles.headingActions}>
            <Button
              variant="primary"
              onClick={onGenerate}
            >
              ✦ Generate Collection
            </Button>
          </div>
        </SceneHeading>

        <div className={styles.toolbar}>
          <strong className={styles.collectionCount}>
            <span className={styles.collectionCountNumber}>{collections.length}</span>
            <span>{collections.length === 1 ? 'Collection' : 'Collections'}</span>
          </strong>

          <Button
            className={styles.selectModeButton}
            size="small"
            variant={selectionMode ? 'quiet' : undefined}
            onClick={() => {
              if (selectionMode) {
                exitSelectionMode();
              } else {
                setSelectionMode(true);
                setOpenMenuId(null);
              }
            }}
          >
            {selectionMode ? 'Cancel' : 'Select'}
          </Button>

          <div className={styles.searchWrap}>
            <input
              className={styles.searchInput}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collections…"
              aria-label="Search collections"
            />

            {search && (
              <button
                className={styles.clearSearchButton}
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear collection search"
                title="Clear search"
              >
                <span
                  className={styles.clearSearchIcon}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          <Button
            className={styles.collapseAllButton}
            size="small"
            onClick={toggleAllGroups}
            disabled={searching}
            title={searching ? 'Clear the search to expand or collapse all groups.' : undefined}
          >
            {allGroupsExpanded ? 'Collapse All' : 'Expand All'}
          </Button>

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

        {draggingCollection && (
          <div
            ref={topScrollZoneRef}
            className={`${styles.dragScrollZone} ${styles.dragScrollZoneTop} ${
              dragScrollDirection === 'up' ? styles.dragScrollZoneActive : ''
            }`}
          >
            <span aria-hidden="true">▲</span>
            <strong>Drag here to scroll up</strong>
            <span aria-hidden="true">▲</span>
          </div>
        )}

        <div
          ref={groupsRef}
          className={styles.groups}
        >
          {groupedCollections.map((group) => {
            const expanded = searching
              ? group.collections.length > 0
              : expandedGroups.has(group.id);

            if (searching && group.collections.length === 0) {
              return null;
            }

            const groupDropTarget =
              dragOverGroupId === group.id && Boolean(draggingPermissions?.move);

            return (
              <section
                className={`${styles.group} ${groupDropTarget ? styles.groupDropTarget : ''}`}
                key={group.id}
                data-collection-group-id={group.id}
              >
                <button
                  className={styles.groupHeader}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                >
                  <span
                    className={styles.groupChevron}
                    aria-hidden="true"
                  >
                    {expanded ? '⌄' : '›'}
                  </span>
                  <span
                    className={styles.groupIcon}
                    aria-hidden="true"
                  >
                    {group.icon}
                  </span>
                  <strong>{group.label}</strong>
                  <span className={styles.groupCount}>
                    <strong>{group.collections.length}</strong>
                    <span>{group.collections.length === 1 ? 'collection' : 'collections'}</span>
                  </span>
                </button>

                {expanded && (
                  <div className={styles.collectionGrid}>
                    {group.collections.length === 0 ? (
                      <div className={styles.groupEmpty}>No collections here yet.</div>
                    ) : (
                      group.collections.map((collection) => {
                        const permissions = getCollectionPermissions(collection);
                        const refreshable =
                          permissions.refresh && canRefreshCollectionSource(collection);
                        const hasMenuActions =
                          refreshable || permissions.move || permissions.delete;
                        const locked =
                          !permissions.edit && !permissions.delete && !permissions.move;
                        const selectable = permissions.move || permissions.delete;
                        const selected = selectedCollectionIds.has(collection.id);
                        const draggable = !selectionMode && selectable;

                        return (
                          <article
                            className={`${styles.card} ${draggable ? styles.draggableCard : ''} ${
                              draggingCollectionId === collection.id ? styles.draggingCard : ''
                            } ${selected ? styles.selectedCard : ''}`}
                            key={collection.id}
                            onPointerDown={(event) => beginPointerDragCandidate(event, collection)}
                            onPointerMove={(event) => handlePointerDragMove(event, collection)}
                            onPointerUp={(event) => finishPointerDrag(event, collection)}
                            onPointerCancel={cancelPointerDrag}
                            onDragStart={(event) => event.preventDefault()}
                            onClickCapture={(event) => {
                              if (!suppressNextCardClickRef.current) {
                                return;
                              }

                              event.preventDefault();
                              event.stopPropagation();
                              suppressNextCardClickRef.current = false;
                            }}
                            title={draggable ? 'Drag to another group, or to Delete.' : undefined}
                          >
                            {selectionMode && selectable && (
                              <label
                                className={styles.selectionCheckbox}
                                title={`Select ${collection.name}`}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleCollectionSelection(collection.id)}
                                  aria-label={`Select ${collection.name}`}
                                />
                                <span aria-hidden="true" />
                              </label>
                            )}

                            <button
                              className={styles.cardArtworkButton}
                              type="button"
                              onClick={() => openCollectionPreview(collection)}
                              aria-label={`View items in ${collection.name}`}
                              title={`View ${collection.name}`}
                            >
                              <CollectionArtwork collection={collection} />
                              <span className={styles.cardArtworkHint}>View items</span>
                            </button>

                            <div className={styles.cardCopy}>
                              <strong
                                className={styles.cardName}
                                title={collection.name}
                              >
                                {collection.name}
                              </strong>
                              <span className={styles.cardCount}>
                                {collection.items.length}{' '}
                                {collection.items.length === 1 ? 'item' : 'items'}
                              </span>
                            </div>

                            <div className={styles.cardFooter}>
                              <div className={styles.cardBadges}>
                                <span
                                  className={
                                    collection.isBuiltIn
                                      ? styles.builtInBadge
                                      : styles.generatedBadge
                                  }
                                >
                                  {collection.isBuiltIn ? '▣ Built-in' : '✦ Generated'}
                                </span>
                                {locked && <span className={styles.lockedLabel}>🔒 Locked</span>}
                              </div>

                              <div className={styles.cardActions}>
                                {permissions.edit && (
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      setEditor({ mode: 'edit', collectionId: collection.id })
                                    }
                                  >
                                    Edit
                                  </Button>
                                )}

                                {hasMenuActions && (
                                  <div className={styles.menuWrap}>
                                    <Button
                                      className={styles.overflowButton}
                                      size="small"
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
                                        {refreshable && (
                                          <button
                                            role="menuitem"
                                            disabled={refreshingCollectionId === collection.id}
                                            onClick={async () => {
                                              setRefreshingCollectionId(collection.id);

                                              try {
                                                await onRefreshSource(collection.id);
                                                setOpenMenuId(null);
                                              } catch (error) {
                                                window.alert(
                                                  error instanceof Error
                                                    ? error.message
                                                    : 'Collection source refresh failed.',
                                                );
                                              } finally {
                                                setRefreshingCollectionId(null);
                                              }
                                            }}
                                          >
                                            {refreshingCollectionId === collection.id
                                              ? '↻ Refreshing…'
                                              : '↻ Refresh source'}
                                          </button>
                                        )}

                                        {permissions.move && (
                                          <button
                                            role="menuitem"
                                            onClick={() => {
                                              setMoveCollectionId(collection.id);
                                              setOpenMenuId(null);
                                            }}
                                          >
                                            ⇄ Move to group
                                          </button>
                                        )}

                                        {permissions.delete && (
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
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {visibleCollections.length === 0 && (
            <div className={styles.emptyState}>
              <strong>No collections match your search.</strong>
              <span>“{search.trim()}”</span>
            </div>
          )}
        </div>

        {draggingCollection && dragPointer && (
          <div
            className={styles.dragPreview}
            style={{ left: dragPointer.x + 16, top: dragPointer.y + 16 }}
            aria-hidden="true"
          >
            <strong>{draggingCollection.name}</strong>
            <span>
              {draggingCollection.items.length}{' '}
              {draggingCollection.items.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}

        {draggingCollection && (
          <div className={styles.dragFooter}>
            {draggingPermissions?.delete && (
              <div
                ref={deleteDropRef}
                className={`${styles.deleteDropZone} ${deleteDropActive ? styles.deleteDropZoneActive : ''}`}
              >
                <strong>🗑 Drop here to delete</strong>
                <span>Release to delete · confirmation still required</span>
              </div>
            )}

            <div
              ref={bottomScrollZoneRef}
              className={`${styles.dragScrollZone} ${styles.dragScrollZoneBottom} ${
                dragScrollDirection === 'down' ? styles.dragScrollZoneActive : ''
              }`}
            >
              <span aria-hidden="true">▼</span>
              <strong>Drag here to scroll down</strong>
              <span aria-hidden="true">▼</span>
            </div>
          </div>
        )}

        {selectionMode && (
          <div className={styles.selectionBar}>
            <div className={styles.selectionSummary}>
              <strong>{selectedCount} selected</strong>
              <span>Locked default collections cannot be selected.</span>
            </div>

            <div className={styles.selectionActions}>
              <Button
                size="small"
                onClick={selectAllVisibleCollections}
                disabled={visibleSelectableCollectionIds.length === 0}
              >
                {searching ? 'Select all results' : 'Select all'}
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedCollectionIds(new Set())}
                disabled={selectedCount === 0}
              >
                Clear selection
              </Button>
              <Button
                size="small"
                onClick={() => setBulkMoveOpen(true)}
                disabled={!canBulkMove}
              >
                Move to Group
              </Button>
              <Button
                size="small"
                variant="danger"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={!canBulkDelete}
              >
                Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </Button>
            </div>
          </div>
        )}
      </ScenePanel>

      {editor && (
        <CollectionEditor
          key={`${editor.mode}:${editor.collectionId ?? 'new'}`}
          mode={editor.mode}
          collection={editorCollection}
          availableCollections={collections}
          itemLibrary={editorItemLibrary}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onClose={() => setEditor(null)}
        />
      )}

      {previewTarget && (
        <Modal
          className={styles.previewModal}
          aria-labelledby="preview-collection-title"
        >
          <div className={styles.previewHeader}>
            <div>
              <h2 id="preview-collection-title">{previewTarget.name}</h2>
              <p>
                {previewTarget.items.length} {previewTarget.items.length === 1 ? 'item' : 'items'}
                {previewTarget.description ? ` · ${previewTarget.description}` : ''}
              </p>
            </div>

            <div className={styles.previewHeaderActions}>
              <label className={styles.previewSortControl}>
                <span>Display order</span>
                <select
                  value={previewSort}
                  onChange={(event) =>
                    setPreviewSort(event.target.value as CollectionItemDisplaySort)
                  }
                >
                  <option value="nameAsc">Name (A–Z)</option>
                  <option value="nameDesc">Name (Z–A)</option>
                  {previewSupportsDateSort && <option value="dateAsc">Date (oldest first)</option>}
                  {previewSupportsDateSort && <option value="dateDesc">Date (newest first)</option>}
                  <option value="source">
                    {previewHasRequestedOrder ? 'Requested order' : 'Original order'}
                  </option>
                </select>
              </label>
              <Button onClick={() => setPreviewCollectionId(null)}>Close</Button>
            </div>
          </div>

          <div className={styles.previewGrid}>
            {previewItems.map((item) => (
              <div
                className={styles.previewItem}
                key={item.id}
              >
                <Poster
                  item={item}
                  className={styles.previewPoster}
                />
                <div className={styles.previewItemCopy}>
                  <strong title={item.name}>{item.name}</strong>
                  {item.subtitle && <span title={item.subtitle}>{item.subtitle}</span>}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {moveTarget && (
        <Modal
          className={styles.moveModal}
          aria-labelledby="move-collection-title"
        >
          <h2 id="move-collection-title">Move Collection</h2>
          <p>
            Choose a group for <strong>{moveTarget.name}</strong>.
          </p>

          <div className={styles.groupChoices}>
            {COLLECTION_GROUPS.map((group) => (
              <button
                className={
                  getCollectionGroupId(moveTarget) === group.id ? styles.activeGroupChoice : ''
                }
                type="button"
                key={group.id}
                onClick={() => {
                  onMoveToGroup(moveTarget.id, group.id);
                  setMoveCollectionId(null);
                }}
              >
                <span aria-hidden="true">{group.icon}</span>
                <span>{group.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.modalActions}>
            <Button onClick={() => setMoveCollectionId(null)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {bulkMoveOpen && selectedCount > 0 && (
        <Modal
          className={styles.moveModal}
          aria-labelledby="bulk-move-collections-title"
        >
          <h2 id="bulk-move-collections-title">Move {selectedCount} Collections</h2>
          <p>Choose a destination group for the selected collections.</p>

          <div className={styles.groupChoices}>
            {COLLECTION_GROUPS.map((group) => (
              <button
                type="button"
                key={group.id}
                onClick={() => {
                  onMoveManyToGroup(selectedCollectionIdList, group.id);
                  setExpandedGroups((previous) => new Set([...previous, group.id]));
                  exitSelectionMode();
                }}
              >
                <span aria-hidden="true">{group.icon}</span>
                <span>{group.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.modalActions}>
            <Button onClick={() => setBulkMoveOpen(false)}>Cancel</Button>
          </div>
        </Modal>
      )}

      {bulkDeleteOpen && selectedCount > 0 && (
        <Modal
          className={styles.deleteModal}
          aria-labelledby="bulk-delete-collections-title"
        >
          <h2 id="bulk-delete-collections-title">Delete {selectedCount} Collections?</h2>
          <p>This deletes the selected collections only. Your Personal Ratings are not affected.</p>

          <div className={styles.bulkDeleteNames}>
            {selectedCollections.slice(0, 6).map((collection) => (
              <span key={collection.id}>{collection.name}</span>
            ))}
            {selectedCount > 6 && <span>…and {selectedCount - 6} more</span>}
          </div>

          <div className={styles.modalActions}>
            <Button onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                onDeleteMany(selectedCollectionIdList);
                exitSelectionMode();
              }}
            >
              Delete {selectedCount}
            </Button>
          </div>
        </Modal>
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
