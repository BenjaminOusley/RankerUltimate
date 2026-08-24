import type { PersonGenerationMode, PersonMatch } from '../../../models';

type PersonSearchResponse = {
  matches?: PersonMatch[];
  error?: string;
};

export async function searchPeople(
  mode: PersonGenerationMode,
  query: string,
): Promise<PersonMatch[]> {
  const response = await fetch('/api/search-person', {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      mode,
      query,
    }),
  });

  let result: PersonSearchResponse;

  try {
    result = (await response.json()) as PersonSearchResponse;
  } catch {
    throw new Error(`Person search failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(result.error ?? `Person search failed with HTTP ${response.status}.`);
  }

  return result.matches ?? [];
}
