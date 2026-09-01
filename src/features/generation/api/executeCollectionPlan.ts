import type { RankCollection } from '@/domain/models';
import type { CollectionRequestPlanned } from '../requestTypes';

type CollectionPlanExecutionResponse = {
  collection?: RankCollection;
  meta?: {
    candidateCount: number;
    validatedCount: number;
    missingPosterCount: number;
  };
  error?: string;
};

export async function executeCollectionPlan(
  plannedRequest: CollectionRequestPlanned,
): Promise<RankCollection> {
  const response = await fetch('/api/execute-collection-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ plannedRequest }),
  });

  let result: CollectionPlanExecutionResponse;

  try {
    result = (await response.json()) as CollectionPlanExecutionResponse;
  } catch {
    throw new Error(`Collection plan execution failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(
      result.error ?? `Collection plan execution failed with HTTP ${response.status}.`,
    );
  }

  if (!result.collection) {
    throw new Error('Collection plan execution returned no collection.');
  }

  return result.collection;
}
