import type { RatedItemCatalog } from './ratingItemCatalog';
import { loadRatedItemCatalog, saveRatedItemCatalog } from './ratingItemCatalog';

let snapshot: RatedItemCatalog | null = null;
const subscribers = new Set<() => void>();
const EMPTY_CATALOG: RatedItemCatalog = {};

/** Stable snapshots for React's external-store subscription. */
export function getRatingCatalogSnapshot(): RatedItemCatalog {
  if (snapshot === null) snapshot = loadRatedItemCatalog();
  return snapshot;
}

export function getServerRatingCatalogSnapshot(): RatedItemCatalog {
  return EMPTY_CATALOG;
}

export function subscribeRatingCatalog(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function publishRatingCatalog(next: RatedItemCatalog): void {
  if (next === getRatingCatalogSnapshot()) return;
  snapshot = next;
  saveRatedItemCatalog(next);
  subscribers.forEach((notify) => notify());
}
