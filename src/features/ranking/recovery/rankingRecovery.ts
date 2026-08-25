import type { AppScreen, RatingBackScreen } from '@/app/appTypes';
import type { RankingState, RefinementPair } from '../engine';

export type RefinementSnapshot = {
  rankingState: RankingState;
  refinementIndex: number;
};

export type RankingRecoveryPayload = {
  version: 1;
  collectionId: string;
  selectedItemIds: string[];
  rankingState: RankingState;
  rankingHistory: RankingState[];
  screen: Extract<
    AppScreen,
    'ranking' | 'rankingComplete' | 'refinement' | 'refinementComplete' | 'ratings'
  >;
  refinementPairs: RefinementPair[];
  refinementIndex: number;
  refinementHistory: RefinementSnapshot[];
  ratingOrderIds: string[];
  ratingBackScreen: RatingBackScreen;
};

const RECOVERY_KEY = 'rankerultimate:recovery:v1';

export function loadRankingRecovery(): RankingRecoveryPayload | null {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as RankingRecoveryPayload;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRankingRecovery(payload: RankingRecoveryPayload) {
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload));
}

export function clearRankingRecovery() {
  localStorage.removeItem(RECOVERY_KEY);
}
