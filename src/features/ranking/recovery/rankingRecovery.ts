import type { AppScreen, RatingBackScreen } from '@/app/appTypes';
import type { RankingState, RefinementPair } from '../engine';

type RecoverableScreen = Extract<
  AppScreen,
  'ranking' | 'rankingComplete' | 'refinement' | 'refinementComplete' | 'ratings'
>;

export type RankingRecoveryPayload = {
  version: 2;
  collectionId: string;
  selectedItemIds: string[];
  rankingOrderIds: string[];
  rankingWinnerIds: string[];
  placedItems: number;
  comparisons: number;
  screen: RecoverableScreen;
  refinementPairs: RefinementPair[];
  refinementWinnerIds: string[];
  ratingOrderIds: string[];
  ratingBackScreen: RatingBackScreen;
};

type LegacyRankingRecoveryPayload = {
  version: 1;
  collectionId: string;
  selectedItemIds: string[];
  rankingState: RankingState;
  rankingHistory: RankingState[];
  screen: RecoverableScreen;
  refinementPairs: RefinementPair[];
  ratingOrderIds: string[];
  ratingBackScreen: RatingBackScreen;
};

const RECOVERY_KEY = 'rankerultimate:recovery:v2';
const LEGACY_RECOVERY_KEY = 'rankerultimate:recovery:v1';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isCurrentRecoveryPayload(value: unknown): value is RankingRecoveryPayload {
  if (!isObject(value) || value.version !== 2) {
    return false;
  }

  return (
    typeof value.collectionId === 'string' &&
    isStringArray(value.selectedItemIds) &&
    isStringArray(value.rankingOrderIds) &&
    isStringArray(value.rankingWinnerIds) &&
    Number.isInteger(value.placedItems) &&
    Number(value.placedItems) >= 0 &&
    Number.isInteger(value.comparisons) &&
    Number(value.comparisons) >= 0 &&
    typeof value.screen === 'string' &&
    Array.isArray(value.refinementPairs) &&
    isStringArray(value.refinementWinnerIds) &&
    isStringArray(value.ratingOrderIds) &&
    typeof value.ratingBackScreen === 'string'
  );
}

function isLegacyRecoveryPayload(value: unknown): value is LegacyRankingRecoveryPayload {
  if (!isObject(value) || value.version !== 1) {
    return false;
  }

  return (
    typeof value.collectionId === 'string' &&
    isStringArray(value.selectedItemIds) &&
    isObject(value.rankingState) &&
    Array.isArray(value.rankingHistory) &&
    typeof value.screen === 'string' &&
    Array.isArray(value.refinementPairs) &&
    isStringArray(value.ratingOrderIds) &&
    typeof value.ratingBackScreen === 'string'
  );
}

function getInitialOrderIds(payload: LegacyRankingRecoveryPayload) {
  const initialState = payload.rankingHistory[0] ?? payload.rankingState;

  return [
    ...initialState.ranked,
    ...(initialState.current ? [initialState.current] : []),
    ...initialState.remaining,
  ].map((item) => item.id);
}

function migrateLegacyRecovery(
  payload: LegacyRankingRecoveryPayload,
): RankingRecoveryPayload {
  const rankingWinnerIds = payload.rankingState.outcomes
    .filter((outcome) => outcome.phase !== 'refinement')
    .map((outcome) => outcome.winnerId);
  const refinementWinnerIds = payload.rankingState.outcomes
    .filter((outcome) => outcome.phase === 'refinement')
    .map((outcome) => outcome.winnerId);
  const placedItems =
    payload.rankingState.mode === 'validation'
      ? Math.max(0, payload.rankingState.ranked.length - 1)
      : payload.rankingState.ranked.length;

  return {
    version: 2,
    collectionId: payload.collectionId,
    selectedItemIds: payload.selectedItemIds,
    rankingOrderIds: getInitialOrderIds(payload),
    rankingWinnerIds,
    placedItems,
    comparisons: payload.rankingState.comparisons,
    screen: payload.screen,
    refinementPairs: payload.refinementPairs,
    refinementWinnerIds,
    ratingOrderIds: payload.ratingOrderIds,
    ratingBackScreen: payload.ratingBackScreen,
  };
}

export function loadRankingRecovery(): RankingRecoveryPayload | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);

    if (raw) {
      const parsed: unknown = JSON.parse(raw);

      if (isCurrentRecoveryPayload(parsed)) {
        return parsed;
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_RECOVERY_KEY);

    if (!legacyRaw) {
      return null;
    }

    const legacyParsed: unknown = JSON.parse(legacyRaw);

    if (!isLegacyRecoveryPayload(legacyParsed)) {
      return null;
    }

    const migrated = migrateLegacyRecovery(legacyParsed);

    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_RECOVERY_KEY);
    } catch {
      // The migrated payload is still usable for this session even if persistence fails.
    }

    return migrated;
  } catch {
    return null;
  }
}

export function saveRankingRecovery(payload: RankingRecoveryPayload) {
  try {
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearRankingRecovery() {
  localStorage.removeItem(RECOVERY_KEY);
  localStorage.removeItem(LEGACY_RECOVERY_KEY);
}
