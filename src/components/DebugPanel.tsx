import type { RankCollection } from '../models';
import type { RankingState } from '../ranking/state';

type DebugPanelProps = {
  collection: RankCollection | null;
  rankingState: RankingState | null;
  history: RankingState[];
};

function DebugPanel({ collection, rankingState, history }: DebugPanelProps) {
  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <details className="debug-panel">
      <summary>Developer State</summary>

      <pre>
        {JSON.stringify(
          {
            collection: collection?.id ?? null,

            ranked: rankingState?.ranked.map((item) => item.id) ?? [],

            remaining: rankingState?.remaining.map((item) => item.id) ?? [],

            current: rankingState?.current?.id ?? null,

            low: rankingState?.low ?? null,

            high: rankingState?.high ?? null,

            comparisons: rankingState?.comparisons ?? null,

            historyLength: history.length,

            currentSource: rankingState?.current?.source ?? null,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

export default DebugPanel;
