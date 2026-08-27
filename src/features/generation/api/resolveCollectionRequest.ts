import type {
  CollectionRequestContext,
  CollectionRequestResolution,
} from '../requestTypes';

type ResolveCollectionRequestInput = {
  text: string;
  context?: CollectionRequestContext | null;
};

type ResolveCollectionRequestResponse = {
  resolution?: CollectionRequestResolution;
  error?: string;
};

export async function resolveCollectionRequest({
  text,
  context = null,
}: ResolveCollectionRequestInput) {
  const response = await fetch('/api/resolve-collection-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, context }),
  });

  const payload = (await response.json()) as ResolveCollectionRequestResponse;

  if (!response.ok || !payload.resolution) {
    throw new Error(payload.error ?? 'Collection request resolution failed.');
  }

  return payload.resolution;
}
