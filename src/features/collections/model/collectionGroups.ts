import type {
  CollectionGroupId,
  CollectionPermissions,
  RankCollection,
} from '@/domain/models';

export type CollectionGroupDefinition = {
  id: CollectionGroupId;
  label: string;
  icon: string;
};

export const COLLECTION_GROUPS: readonly CollectionGroupDefinition[] = [
  { id: 'movies-tv', label: 'Movies & TV', icon: '▣' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'books', label: 'Books', icon: '▤' },
  { id: 'people-characters', label: 'People & Characters', icon: '♟' },
  { id: 'food-drink', label: 'Food & Drink', icon: '♨' },
  { id: 'restaurants', label: 'Restaurants', icon: '▦' },
  { id: 'animals', label: 'Animals', icon: '♞' },
  { id: 'various', label: 'Various', icon: '✦' },
] as const;

export const DEFAULT_COLLECTION_PERMISSIONS: CollectionPermissions = {
  edit: true,
  delete: true,
  move: true,
  refresh: false,
};

export const LOCKED_COLLECTION_PERMISSIONS: CollectionPermissions = {
  edit: false,
  delete: false,
  move: false,
  refresh: true,
};

export function inferCollectionGroupId(
  collection: Pick<RankCollection, 'candidateSource'>,
): CollectionGroupId {
  const source = collection.candidateSource;

  if (source?.kind === 'generated') {
    if (source.provider === 'tmdb') {
      return 'movies-tv' as const;
    }

    if (source.provider === 'igdb') {
      return 'games' as const;
    }

    if (source.provider === 'hardcover') {
      return 'books' as const;
    }
  }

  if (source?.kind === 'composite') {
    const childGroups = new Set(
      source.sources.map((child) =>
        inferCollectionGroupId({
          candidateSource: child,
        }),
      ),
    );

    if (childGroups.size === 1) {
      const [groupId] = childGroups;

      if (groupId) {
        return groupId;
      }
    }
  }

  return 'various' as const;
}

export function getCollectionGroupId(collection: RankCollection): CollectionGroupId {
  return collection.groupId ?? inferCollectionGroupId(collection);
}

export function getCollectionGroup(groupId: CollectionGroupId) {
  return COLLECTION_GROUPS.find((group) => group.id === groupId) ?? COLLECTION_GROUPS.at(-1)!;
}

export function getCollectionPermissions(collection: RankCollection): CollectionPermissions {
  return {
    ...DEFAULT_COLLECTION_PERMISSIONS,
    ...(collection.isBuiltIn ? LOCKED_COLLECTION_PERMISSIONS : {}),
    ...collection.permissions,
  };
}
