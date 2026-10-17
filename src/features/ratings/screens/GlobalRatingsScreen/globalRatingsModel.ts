import { getCanonicalItemKey } from '@/domain/itemIdentity';
import type { RankCollection, RankItem } from '@/domain/models';
import { getSortableItemYear } from '@/features/collections/model/collectionItemDisplaySort';
import type { StoredRanking } from '@/features/myRankings/model/savedRankings';
import { getPersonalRating, type PersonalRatingMap } from '../../personalRatings';
import { placeholderForRatingKey, type RatedItemCatalog } from '../../ratingItemCatalog';

export type RatedItem = { key: string; item: RankItem; rating: number | null; updatedAt: string | null };
export type RatingSort = 'recent' | 'highest' | 'lowest' | 'nameAsc' | 'nameDesc' | 'dateAsc' | 'dateDesc';

function byName(first: RatedItem, second: RatedItem) {
  return first.item.name.localeCompare(second.item.name, undefined, { sensitivity: 'base', numeric: true });
}

/** A missing year sorts after known years, regardless of chronological direction. */
export function sortRatedItems(items: readonly RatedItem[], sort: RatingSort): RatedItem[] {
  return [...items].sort((first, second) => {
    if (sort === 'highest' || sort === 'lowest') {
      const left = first.rating;
      const right = second.rating;
      if (left === null) return right === null ? byName(first, second) : 1;
      if (right === null) return -1;
      const difference = sort === 'highest' ? right - left : left - right;
      return difference || byName(first, second);
    }
    if (sort === 'nameAsc' || sort === 'nameDesc') {
      return (sort === 'nameAsc' ? 1 : -1) * byName(first, second);
    }
    if (sort === 'dateAsc' || sort === 'dateDesc') {
      const left = getSortableItemYear(first.item);
      const right = getSortableItemYear(second.item);
      if (left === null) return right === null ? byName(first, second) : 1;
      if (right === null) return -1;
      const difference = sort === 'dateAsc' ? left - right : right - left;
      return difference || byName(first, second);
    }
    return (second.updatedAt ?? '').localeCompare(first.updatedAt ?? '') || byName(first, second);
  });
}

/** A rated item's identity is not tied to a collection, and metadata survives deletion. */
export function buildRatingCatalog(
  collections: readonly RankCollection[],
  knownItems: readonly RankItem[],
  rankings: readonly StoredRanking[],
  remembered: RatedItemCatalog,
  ratings: PersonalRatingMap,
): RatedItem[] {
  const byKey = new Map<string, RankItem>();
  for (const item of knownItems) byKey.set(getCanonicalItemKey(item), item);
  for (const collection of collections) {
    for (const item of collection.items) byKey.set(getCanonicalItemKey(item), item);
  }
  for (const ranking of rankings) {
    for (const item of ranking.items) {
      const rankItem: RankItem = {
        id: item.id, name: item.name,
        ...(item.subtitle ? { subtitle: item.subtitle } : {}),
        ...(item.image ? { image: item.image } : {}),
        ...(item.source ? { source: item.source } : {}),
      };
      if (!byKey.has(getCanonicalItemKey(rankItem))) byKey.set(getCanonicalItemKey(rankItem), rankItem);
    }
  }
  for (const [key, item] of Object.entries(remembered)) byKey.set(key, item);
  for (const key of Object.keys(ratings)) {
    if (!byKey.has(key)) {
      const placeholder = placeholderForRatingKey(key);
      if (placeholder) byKey.set(key, placeholder);
    }
  }
  return [...byKey].map(([key, item]) => ({
    key, item, rating: getPersonalRating(ratings, item), updatedAt: ratings[key]?.updatedAt ?? remembered[key]?.lastRatingEditAt ?? null,
  }));
}
