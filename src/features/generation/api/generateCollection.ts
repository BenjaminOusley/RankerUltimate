import type { GenerationRequest, RankCollection } from '../../../models';

type GenerationResponse = {
  collection?: RankCollection;
  error?: string;
};

export async function generateCollection(request: GenerationRequest): Promise<RankCollection> {
  const response = await fetch('/api/generate', {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify(request),
  });

  let result: GenerationResponse;

  try {
    result = (await response.json()) as GenerationResponse;
  } catch {
    throw new Error(`Collection generation failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(result.error ?? `Collection generation failed with HTTP ${response.status}.`);
  }

  if (!result.collection) {
    throw new Error('The generator returned no collection.');
  }

  return result.collection;
}
