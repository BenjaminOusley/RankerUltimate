import type { GameGenerationMode, IgdbEntityMatch } from '../types';

type IgdbEntitySearchResponse = {
  matches?: IgdbEntityMatch[];
  error?: string;
};

export async function searchIgdbEntities(
  mode: GameGenerationMode,
  query: string,
): Promise<IgdbEntityMatch[]> {
  const response = await fetch('/api/search-igdb-entity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      query,
    }),
  });

  let result: IgdbEntitySearchResponse;

  try {
    result = (await response.json()) as IgdbEntitySearchResponse;
  } catch {
    throw new Error(`IGDB search failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(result.error ?? `IGDB search failed with HTTP ${response.status}.`);
  }

  return result.matches ?? [];
}
