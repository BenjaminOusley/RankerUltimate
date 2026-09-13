import type { RankCollection, RankItem } from '@/domain/models';

export type CollectionItemDisplaySort =
  | 'source'
  | 'nameAsc'
  | 'nameDesc'
  | 'dateAsc'
  | 'dateDesc';

function getOriginalRequest(collection: RankCollection) {
  const source = collection.candidateSource;

  if (source?.kind === 'generated' || source?.kind === 'composite') {
    return source.originalRequest ?? '';
  }

  return '';
}

export function getSortableItemYear(item: RankItem): number | null {
  const match = item.subtitle?.match(/\b(18|19|20|21)\d{2}\b/u);

  if (!match) {
    return null;
  }

  const year = Number(match[0]);
  return Number.isInteger(year) ? year : null;
}

export function collectionSupportsDateSort(collection: RankCollection) {
  return collection.items.some((item) => getSortableItemYear(item) !== null);
}

export function collectionHasRequestedItemOrder(collection: RankCollection) {
  const request = getOriginalRequest(collection).toLowerCase();

  if (
    /\b(?:top|best|highest|lowest|most|least|popular|rated|ranked|ranking|newest|latest|oldest|earliest|chronological)\b/u.test(
      request,
    )
  ) {
    return true;
  }

  return /^top\s+\d+\b/iu.test(collection.name) || /\bbest[- ]selling\b/iu.test(collection.name);
}

export function getDefaultCollectionItemDisplaySort(
  collection: RankCollection,
): CollectionItemDisplaySort {
  if (collectionHasRequestedItemOrder(collection)) {
    return 'source';
  }

  return collectionSupportsDateSort(collection) ? 'dateDesc' : 'nameAsc';
}

export function sortCollectionItemsForDisplay(
  items: readonly RankItem[],
  sort: CollectionItemDisplaySort,
) {
  if (sort === 'source') {
    return [...items];
  }

  const sorted = [...items];

  if (sort === 'nameAsc' || sort === 'nameDesc') {
    sorted.sort((first, second) => {
      const comparison = first.name.localeCompare(second.name, undefined, {
        sensitivity: 'base',
        numeric: true,
      });

      return sort === 'nameAsc' ? comparison : -comparison;
    });

    return sorted;
  }

  sorted.sort((first, second) => {
    const firstYear = getSortableItemYear(first);
    const secondYear = getSortableItemYear(second);

    if (firstYear === null && secondYear === null) {
      return first.name.localeCompare(second.name, undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    }

    if (firstYear === null) {
      return 1;
    }

    if (secondYear === null) {
      return -1;
    }

    const comparison = firstYear - secondYear;

    if (comparison !== 0) {
      return sort === 'dateAsc' ? comparison : -comparison;
    }

    return first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });

  return sorted;
}
