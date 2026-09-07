import { describe, expect, it } from 'vitest';

import type { RankItem } from '@/domain/models';
import {
  chooseRankingWinner,
  createRankingStateFromOrder,
  getCurrentOpponent,
  type RankingState,
} from '../engine';
import { replayRankingChoices, replayRefinementChoices } from './rankingReplay';

function item(id: string): RankItem {
  return {
    id,
    name: id,
    source: {
      provider: 'test',
      id,
      type: 'test',
    },
  };
}

describe('ranking replay', () => {
  it('rebuilds normal ranking state from the original order and compact winner IDs', () => {
    const orderedItems = [item('a'), item('b'), item('c'), item('d')];
    const winnerIds: string[] = [];
    const statesBeforeChoices: RankingState[] = [];
    let state = createRankingStateFromOrder(orderedItems);

    while (state.current) {
      const opponent = getCurrentOpponent(state);

      if (!opponent) {
        throw new Error('Expected a ranking opponent.');
      }

      statesBeforeChoices.push(state);
      winnerIds.push(state.current.id);
      state = chooseRankingWinner(state, state.current.id);
    }

    const replay = replayRankingChoices(orderedItems, winnerIds);

    expect(replay.state).toEqual(state);
    expect(replay.lastState).toEqual(statesBeforeChoices.at(-1));

    const undoneReplay = replayRankingChoices(orderedItems, winnerIds.slice(0, -1));

    expect(undoneReplay.state).toEqual(statesBeforeChoices.at(-1));
  });

  it('replays refinement choices without storing full ranking snapshots', () => {
    const initialState: RankingState = {
      ranked: [item('a'), item('b'), item('c')],
      remaining: [],
      current: null,
      low: 0,
      high: 3,
      comparisons: 4,
      outcomes: [],
      mode: 'insert',
      validationPair: null,
      validationChecked: true,
    };

    const replayed = replayRefinementChoices(
      initialState,
      [{ firstId: 'a', secondId: 'c' }],
      ['c'],
    );

    expect(replayed.ranked.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect(replayed.comparisons).toBe(5);
    expect(replayed.outcomes).toEqual([
      {
        winnerId: 'c',
        loserId: 'a',
        phase: 'refinement',
      },
    ]);
  });

  it('rejects invalid compact recovery choices instead of restoring corrupt state', () => {
    const orderedItems = [item('a'), item('b'), item('c')];

    expect(() => replayRankingChoices(orderedItems, ['missing'])).toThrow(
      'invalid winner ID',
    );
    expect(() =>
      replayRefinementChoices(
        {
          ranked: orderedItems,
          remaining: [],
          current: null,
          low: 0,
          high: 3,
          comparisons: 0,
          outcomes: [],
          mode: 'insert',
          validationPair: null,
          validationChecked: true,
        },
        [{ firstId: 'a', secondId: 'b' }],
        ['c'],
      ),
    ).toThrow('invalid refinement winner ID');
  });
});
