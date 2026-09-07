import type { RankItem } from '@/domain/models';
import {
  applyRefinementChoice,
  chooseRankingWinner,
  createRankingStateFromOrder,
  type ComparisonOutcome,
  type RankingState,
  type RefinementPair,
} from '../engine';

export function replayRankingChoices(
  orderedItems: readonly RankItem[],
  winnerIds: readonly string[],
): { state: RankingState; lastState: RankingState | null } {
  let state = createRankingStateFromOrder(orderedItems);
  let lastState: RankingState | null = null;

  for (const winnerId of winnerIds) {
    if (!state.current) {
      throw new Error('Ranking recovery contains more choices than the ranking requires.');
    }

    const previousState = state;
    const nextState = chooseRankingWinner(state, winnerId);

    if (nextState === state) {
      throw new Error(`Ranking recovery contains an invalid winner ID: ${winnerId}`);
    }

    lastState = previousState;
    state = nextState;
  }

  return { state, lastState };
}

export function replayRefinementChoices(
  initialState: RankingState,
  pairs: readonly RefinementPair[],
  winnerIds: readonly string[],
): RankingState {
  if (winnerIds.length > pairs.length) {
    throw new Error('Ranking recovery contains too many refinement choices.');
  }

  let state = initialState;

  for (let index = 0; index < winnerIds.length; index += 1) {
    const pair = pairs[index];
    const winnerId = winnerIds[index];

    if (!pair || (winnerId !== pair.firstId && winnerId !== pair.secondId)) {
      throw new Error(`Ranking recovery contains an invalid refinement winner ID: ${winnerId}`);
    }

    const loserId = winnerId === pair.firstId ? pair.secondId : pair.firstId;
    const outcome: ComparisonOutcome = {
      winnerId,
      loserId,
      phase: 'refinement',
    };

    state = {
      ...state,
      ranked: applyRefinementChoice(state.ranked, pair, winnerId),
      outcomes: [...state.outcomes, outcome],
      comparisons: state.comparisons + 1,
    };
  }

  return state;
}
