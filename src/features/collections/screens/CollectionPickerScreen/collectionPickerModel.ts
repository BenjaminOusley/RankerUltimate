import type { CollectionGroupId, RankCollection, RankItem } from '@/domain/models';
import { getCollectionGroup, getCollectionGroupId } from '@/features/collections/model/collectionGroups';

export type PickerCategory = 'all' | 'movies-tv' | 'games' | 'books' | 'other';

function getItemGroupId(item: RankItem): CollectionGroupId | null {
  const provider = item.source?.provider?.toLowerCase();
  const type = item.source?.type?.toLowerCase();

  if (provider === 'tmdb' && (type === 'movie' || type === 'tv')) {
    return 'movies-tv';
  }

  if (provider === 'igdb') {
    return 'games';
  }

  if (provider === 'hardcover' || provider === 'stephenking.com') {
    return 'books';
  }

  return null;
}

// Use the user's assigned group where specific. A generic Various group can
// be refined only if every item has recognizable, consistent source metadata.
export function getPickerCollectionGroupId(collection: RankCollection): CollectionGroupId {
  const groupId = getCollectionGroupId(collection);

  if (groupId !== 'various' || collection.items.length === 0) {
    return groupId;
  }

  const firstGroup = getItemGroupId(collection.items[0]);

  if (!firstGroup || collection.items.some((item) => getItemGroupId(item) !== firstGroup)) {
    return groupId;
  }

  return firstGroup;
}

export function getPickerCategory(groupId: CollectionGroupId): PickerCategory {
  if (groupId === 'movies-tv' || groupId === 'games' || groupId === 'books') {
    return groupId;
  }

  return 'other';
}

export function getPickerSearchText(
  collection: RankCollection,
  groupId: CollectionGroupId = getPickerCollectionGroupId(collection),
): string {
  const categoryName = getPickerCategory(groupId) === 'other' ? 'Other' : '';

  return [
    collection.name,
    collection.description ?? '',
    getCollectionGroup(groupId).label,
    categoryName,
  ].join(' ').toLowerCase();
}
