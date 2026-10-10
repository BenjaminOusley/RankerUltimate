import { useMemo, useRef, useState } from 'react';

import { AppShell } from '@/app/AppShell';
import type { RankCollection, RankItem } from '@/domain/models';
import { getCollectionGroup } from '@/features/collections/model/collectionGroups';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import { Poster } from '@/shared/components/Poster/Poster';
import {
  getPickerCategory,
  getPickerCollectionGroupId,
  getPickerSearchText,
  type PickerCategory,
} from './collectionPickerModel';
import styles from './CollectionPickerScreen.module.css';

type CollectionPickerScreenProps = {
  collections: readonly RankCollection[];
  onSelect: (collection: RankCollection) => void;
};


type PickerFilter = {
  id: PickerCategory;
  label: string;
  icon: string;
};

const PICKER_FILTERS: readonly PickerFilter[] = [
  { id: 'all', label: 'All', icon: '▦' },
  { id: 'movies-tv', label: 'Movies & TV', icon: '▣' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'books', label: 'Books', icon: '▤' },
  { id: 'other', label: 'Other', icon: '✦' },
];

function getRepresentativeItems(collection: RankCollection): RankItem[] {
  const artworkItems = collection.items.filter((item) => Boolean(item.image));

  if (artworkItems.length <= 4) {
    return artworkItems;
  }

  const lastIndex = artworkItems.length - 1;
  const representativeIndexes = [
    0,
    Math.round(lastIndex / 3),
    Math.round((lastIndex * 2) / 3),
    lastIndex,
  ];

  return [...new Set(representativeIndexes)].map((index) => artworkItems[index]);
}

function CollectionArtwork({ collection }: { collection: RankCollection }) {
  const representativeItems = getRepresentativeItems(collection);
  const group = getCollectionGroup(getPickerCollectionGroupId(collection));

  if (representativeItems.length === 0) {
    return (
      <div className={`${styles.artwork} ${styles.artworkFallback}`} aria-hidden="true">
        <span>{group.icon}</span>
        <strong>{collection.name.charAt(0)}</strong>
      </div>
    );
  }

  return (
    <div
      className={`${styles.artwork} ${representativeItems.length === 1 ? styles.artworkSingle : ''}`}
      aria-hidden="true"
    >
      {representativeItems.map((item) => (
        <Poster
          key={item.id}
          item={item}
          className={styles.artworkPoster}
        />
      ))}
    </div>
  );
}

function CollectionCard({
  collection,
  onSelect,
}: {
  collection: RankCollection;
  onSelect: (collection: RankCollection) => void;
}) {
  const group = getCollectionGroup(getPickerCollectionGroupId(collection));
  const disabled = collection.items.length < 2;

  return (
    <button
      className={styles.card}
      onClick={() => onSelect(collection)}
      disabled={disabled}
      title={
        disabled
          ? 'Add at least 2 items before ranking this collection.'
          : `Rank ${collection.name}`
      }
    >
      <CollectionArtwork collection={collection} />

      <div className={styles.cardCopy}>
        <strong className={styles.cardName}>{collection.name}</strong>
        <span className={styles.cardCount}>
          {collection.items.length} {collection.items.length === 1 ? 'item' : 'items'}
        </span>
        <span className={styles.cardGroup}>
          <span aria-hidden="true">{group.icon}</span>
          {group.label}
        </span>
      </div>

      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function CollectionPickerScreen({
  collections,
  onSelect,
}: CollectionPickerScreenProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<PickerCategory>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const visibleCollections = useMemo(() => {
    const query = search.trim().toLowerCase();

    return collections.filter((collection) => {
      const groupId = getPickerCollectionGroupId(collection);
      const matchesCategory =
        category === 'all' || getPickerCategory(groupId) === category;
      const matchesSearch = !query || getPickerSearchText(collection, groupId).includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [category, collections, search]);

  const curatedCollections = visibleCollections.filter((collection) => collection.isBuiltIn);
  const userCollections = visibleCollections.filter((collection) => !collection.isBuiltIn);
  const hasVisibleCollections = visibleCollections.length > 0;

  return (
    <AppShell>
      <ScenePanel className={styles.scene}>
        <SceneHeading className={styles.heading}>
          <div>
            <h1>Select a Collection</h1>
            <p>Pick the list you want to rank. You’ll review the items before starting.</p>
          </div>
        </SceneHeading>

        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Filter collections by category">
            {PICKER_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`${styles.filterButton} ${category === filter.id ? styles.filterButtonActive : ''}`}
                onClick={() => setCategory(filter.id)}
                aria-pressed={category === filter.id}
              >
                <span aria-hidden="true">{filter.icon}</span>
                {filter.label}
              </button>
            ))}
          </div>

          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              ⌕
            </span>
            <input
              ref={searchInputRef}
              className={styles.search}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search collections…"
              aria-label="Search collections"
            />
            {search && (
              <button
                type="button"
                className={styles.clearSearchButton}
                aria-label="Clear collection search"
                title="Clear search"
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
              >
                <span className={styles.clearSearchIcon} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className={styles.content}>
          {curatedCollections.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div className={styles.sectionIcon} aria-hidden="true">
                  ★
                </div>
                <div>
                  <h2>Curated Collections</h2>
                  <p>Built-in collections ready to rank.</p>
                </div>
              </div>

              <div className={styles.grid}>
                {curatedCollections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          )}

          {userCollections.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div className={styles.sectionIcon} aria-hidden="true">
                  ▰
                </div>
                <div>
                  <h2>Your Collections</h2>
                  <p>Your custom and generated collections.</p>
                </div>
              </div>

              <div className={styles.grid}>
                {userCollections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          )}

          {!hasVisibleCollections && (
            <div className={styles.emptyState}>
              <strong>No collections found.</strong>
              <span>Try another search or category.</span>
            </div>
          )}
        </div>
      </ScenePanel>
    </AppShell>
  );
}
