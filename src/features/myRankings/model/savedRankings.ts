import type { CollectionGroupId, ItemSource, RankCollection, RankItem } from '@/domain/models';
import type { RankingState } from '@/features/ranking/engine';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';
import type { SharedResultsSnapshot } from '@/features/results/share/resultsShare';
import { getPickerCollectionGroupId } from '@/features/collections/screens/CollectionPickerScreen/collectionPickerModel';

export const UNSAVED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type StoredRankingItem = {
  id: string;
  name: string;
  subtitle?: string;
  image?: string;
  source?: ItemSource;
  rankingScore: number;
  /** Captured when this ranking first reached Results; absent on legacy records. */
  personalRatingAtCompletion?: number | null;
};
export type StoredRanking = {
  version: 1;
  id: string;
  collectionId: string;
  collectionName: string;
  groupId: CollectionGroupId;
  name: string;
  items: StoredRankingItem[];
  comparisons: number;
  refinementCount: number;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
};

export function makeRecentRanking(
  collection: RankCollection,
  state: RankingState,
  scores: Record<string, number>,
  personalRatings: PersonalRatingMap,
  now = new Date(),
  id: string = crypto.randomUUID(),
): StoredRanking {
  const timestamp = now.toISOString();
  return {
    version: 1,
    id,
    collectionId: collection.id,
    collectionName: collection.name,
    groupId: getPickerCollectionGroupId(collection),
    name: collection.name,
    items: state.ranked.map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      ...(item.image ? { image: item.image } : {}),
      ...(item.source ? { source: { ...item.source } } : {}),
      rankingScore: scores[item.id] ?? 0,
      personalRatingAtCompletion: getPersonalRating(personalRatings, item),
    })),
    comparisons: state.comparisons,
    refinementCount: state.outcomes.filter((item) => item.phase === 'refinement').length,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    savedAt: null,
  };
}

export function isExpiredRecent(record: StoredRanking, nowMs = Date.now()) {
  return record.savedAt === null && Date.parse(record.completedAt) + UNSAVED_RETENTION_MS <= nowMs;
}
export function daysUntilExpiry(record: StoredRanking, nowMs = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(record.completedAt) + UNSAVED_RETENTION_MS - nowMs) / 86400000));
}
export function rankingToResultsData(record: StoredRanking) {
  const items: RankItem[] = record.items.map((item) => ({
    id: item.id, name: item.name,
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(item.source ? { source: item.source } : {}),
  }));
  const rankingScores = Object.fromEntries(record.items.map((item) => [item.id, item.rankingScore]));
  return { items, rankingScores };
}
/** Snapshots for Results / Share / Export ALWAYS use current global Personal Ratings. */
export function rankingToLiveSnapshot(record: StoredRanking, ratings: PersonalRatingMap): SharedResultsSnapshot {
  return {
    version: 1,
    createdAt: record.completedAt,
    collection: { name: record.name },
    comparisons: record.comparisons,
    refinementCount: record.refinementCount,
    items: record.items.map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      ...(item.image ? { image: item.image } : {}),
      ...(item.source ? { source: item.source } : {}),
      preferenceScore: item.rankingScore,
      personalRating: getPersonalRating(ratings, item),
    })),
  };
}
/** Absent means the old record predates history capture; null means unrated at completion. */
export function getRatingAtCompletion(record: StoredRanking, itemId: string): number | null | undefined {
  return record.items.find((item) => item.id === itemId)?.personalRatingAtCompletion;
}

/** Only ratings with both a historical and current value can show a numeric change. */
export function getPersonalRatingChange(
  historical: number | null | undefined,
  current: number | null,
): number | null {
  if (typeof historical !== 'number' || current === null) return null;
  return Number((current - historical).toFixed(1));
}

export function savedRankingMatches(record: StoredRanking, query: string, filter: string) {
  const category = ['movies-tv', 'games', 'books'].includes(record.groupId) ? record.groupId : 'other';
  if (filter !== 'all' && filter !== category) return false;
  return `${record.name} ${record.collectionName} ${record.groupId}`.toLowerCase().includes(query.trim().toLowerCase());
}
export function isValidStoredRanking(value: unknown): value is StoredRanking {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Partial<StoredRanking>;
  return r.version === 1 && typeof r.id === 'string' && typeof r.collectionId === 'string' &&
    typeof r.collectionName === 'string' && typeof r.groupId === 'string' &&
    typeof r.name === 'string' && typeof r.completedAt === 'string' &&
    typeof r.createdAt === 'string' && typeof r.updatedAt === 'string' &&
    Number.isFinite(Date.parse(r.updatedAt)) &&
    Number.isFinite(Date.parse(r.completedAt)) &&
    (r.savedAt === null || typeof r.savedAt === 'string') &&
    Array.isArray(r.items) && r.items.length >= 2 &&
    r.items.every((item) => item && typeof item.id === 'string' && typeof item.name === 'string' &&
      typeof item.rankingScore === 'number' && Number.isFinite(item.rankingScore) &&
      (item.personalRatingAtCompletion === undefined || item.personalRatingAtCompletion === null ||
        (typeof item.personalRatingAtCompletion === 'number' &&
          Number.isFinite(item.personalRatingAtCompletion) &&
          item.personalRatingAtCompletion >= 0 && item.personalRatingAtCompletion <= 10))) &&
    typeof r.comparisons === 'number' && Number.isFinite(r.comparisons) &&
    typeof r.refinementCount === 'number' && Number.isFinite(r.refinementCount);
}
