import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getRatingCatalogSnapshot, getServerRatingCatalogSnapshot,
  publishRatingCatalog, subscribeRatingCatalog,
} from '../ratingCatalogStore';
import { mergeKnownRatedItems, rememberRatedItem } from '../ratingItemCatalog';

import type { RankItem } from '@/domain/models';
import {
  loadPersonalRatings, savePersonalRatings, updatePersonalRatingMap,
} from '../personalRatings';

export function usePersonalRatings(items: readonly RankItem[] = []) {
  const [personalRatings, setPersonalRatings] = useState(() => loadPersonalRatings(items));
  const ratedItemCatalog = useSyncExternalStore(
    subscribeRatingCatalog, getRatingCatalogSnapshot, getServerRatingCatalogSnapshot,
  );

  // Generated source snapshots arrive AFTER the hook mounts. As soon as rated
  // items become known, persist their metadata independently of collections.
  useEffect(() => {
    const next = mergeKnownRatedItems(ratedItemCatalog, items, personalRatings);
    if (next !== ratedItemCatalog) publishRatingCatalog(next);
  }, [ratedItemCatalog, items, personalRatings]);

  const updatePersonalRating = useCallback((item: RankItem, value: number | null) => {
    publishRatingCatalog(rememberRatedItem(getRatingCatalogSnapshot(), item));
    setPersonalRatings((previous) => {
      const next = updatePersonalRatingMap(previous, item, value);
      savePersonalRatings(next);
      return next;
    });
  }, []);

  return { personalRatings, ratedItemCatalog, updatePersonalRating };
}
