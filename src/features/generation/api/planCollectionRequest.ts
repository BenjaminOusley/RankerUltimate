import type {
  CollectionRequestPlanningResult,
  CollectionRequestReadyForPlanning,
} from '../requestTypes';

type PlanCollectionRequestResponse = {
  plan?: CollectionRequestPlanningResult;
  error?: string;
};

export async function planCollectionRequest(
  request: CollectionRequestReadyForPlanning,
) {
  const response = await fetch('/api/plan-collection-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request }),
  });

  const payload = (await response.json()) as PlanCollectionRequestResponse;

  if (!response.ok || !payload.plan) {
    throw new Error(payload.error ?? 'Collection request planning failed.');
  }

  return payload.plan;
}
