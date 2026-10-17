import { getCanonicalItemKey } from '@/domain/itemIdentity';
import type { RankItem } from '@/domain/models';
import { getPersonalRating, type PersonalRatingMap } from './personalRatings';

/** Metadata only: Personal Ratings themselves remain in personal-ratings:v2. */
const KEY = 'rankerultimate:rated-items:v1';
export type RememberedRatingItem = RankItem & { lastRatingEditAt?: string };
export type RatedItemCatalog = Record<string, RememberedRatingItem>;

function validItem(value: unknown): value is RankItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<RememberedRatingItem>;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' && item.name.length > 0 &&
    (item.subtitle === undefined || typeof item.subtitle === 'string') &&
    (item.image === undefined || typeof item.image === 'string') &&
    (item.lastRatingEditAt === undefined || typeof item.lastRatingEditAt === 'string') &&
    (item.source === undefined ||
      (typeof item.source === 'object' && item.source !== null &&
        typeof item.source.provider === 'string' && typeof item.source.id === 'string' &&
        (item.source.type === undefined || typeof item.source.type === 'string')));
}

export function loadRatedItemCatalog(): RatedItemCatalog {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || !data || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([key, value]) =>
      validItem(value) && getCanonicalItemKey(value) === key,
    )) as RatedItemCatalog;
  } catch {
    return {};
  }
}

function copyItemMetadata(item: RankItem): RankItem {
  return {
    id: item.id,
    name: item.name,
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(item.source ? { source: { ...item.source } } : {}),
  };
}

export function saveRatedItemCatalog(catalog: RatedItemCatalog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(catalog));
  } catch {
    // Ratings remain usable even if this optional metadata cache is full.
  }
}

export function rememberRatedItem(catalog: RatedItemCatalog, item: RankItem): RatedItemCatalog {
  if (!validItem(item)) return catalog;
  const key = getCanonicalItemKey(item);
  const next = { ...catalog, [key]: {
    ...copyItemMetadata(item),
    lastRatingEditAt: new Date().toISOString(),
  } };
  saveRatedItemCatalog(next);
  return next;
}

/** Pure merge, so asynchronously loaded collection items can be remembered without
 * a React setState call inside an effect or a storage write during rendering. */
export function mergeKnownRatedItems(
  catalog: RatedItemCatalog,
  knownItems: readonly RankItem[],
  ratings: PersonalRatingMap,
): RatedItemCatalog {
  let next = catalog;
  for (const item of knownItems) {
    const key = getCanonicalItemKey(item);
    const existing = next[key];
    const needsMetadata = !existing || /^Unknown item \(.*\)$/.test(existing.name);
    if (getPersonalRating(ratings, item) !== null && needsMetadata && validItem(item)) {
      if (next === catalog) next = { ...catalog };
      next[key] = { ...copyItemMetadata(item),
        ...(existing?.lastRatingEditAt ? { lastRatingEditAt: existing.lastRatingEditAt } : {}),
      };
    }
  }
  return next;
}

/** Source registry is intentionally open: new providers only need a stable source key. */
export function itemKind(item: RankItem): 'movie' | 'tv' | 'game' | 'book' | 'other' {
  const provider = item.source?.provider.toLowerCase();
  const type = item.source?.type?.toLowerCase();
  if (provider === 'tmdb' && type === 'movie') return 'movie';
  if (provider === 'tmdb' && type === 'tv') return 'tv';
  if (provider === 'igdb' || type === 'game' || provider === 'reported-sales') return 'game';
  if (provider === 'hardcover' || provider === 'stephenking.com') return 'book';
  return 'other';
}

/** Keep orphaned ratings visible even if their old collection was deleted. */
export function placeholderForRatingKey(key: string): RankItem | null {
  if (key.startsWith('local:')) {
    const id = key.slice(6);
    return id ? { id, name: id } : null;
  }
  const match = /^([^:]+):([^:]+):(.+)$/.exec(key);
  if (!match) return null;
  const [, provider, type, id] = match;
  return { id: key, name: `Unknown item (${id})`, source: { provider, type, id } };
}

/** Import metadata for ratings that predate standalone Find & Rate. */
export function seedRatedItemCatalog(
  catalog: RatedItemCatalog,
  knownItems: readonly RankItem[],
  ratings: PersonalRatingMap,
): RatedItemCatalog {
  const next = mergeKnownRatedItems(catalog, knownItems, ratings);
  if (next !== catalog) saveRatedItemCatalog(next);
  return next;
}
