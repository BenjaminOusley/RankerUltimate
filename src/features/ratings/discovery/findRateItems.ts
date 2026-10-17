import type { RankItem } from '@/domain/models';

export type DiscoverySource = 'movie' | 'tv' | 'game' | 'book';

const PROVIDERS: Record<DiscoverySource, 'tmdb' | 'igdb' | 'hardcover'> = {
  movie: 'tmdb', tv: 'tmdb', game: 'igdb', book: 'hardcover',
};

function isRankItem(value: unknown): value is RankItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<RankItem>;
  return typeof item.id === 'string' && typeof item.name === 'string' && item.name.length > 0 &&
    typeof item.source?.provider === 'string' && typeof item.source?.id === 'string' &&
    typeof item.source?.type === 'string' &&
    (item.subtitle === undefined || typeof item.subtitle === 'string') &&
    (item.image === undefined || typeof item.image === 'string');
}

export async function findRateItems(source: DiscoverySource, query: string): Promise<RankItem[]> {
  const label = PROVIDERS[source].toUpperCase() === 'TMDB' ? 'TMDB' :
    PROVIDERS[source] === 'igdb' ? 'IGDB' : 'Hardcover';
  let response: Response;
  try {
    response = await fetch('/api/find-rate-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: PROVIDERS[source], mediaType: source, query }),
    });
  } catch {
    throw new Error(`Unable to reach ${label} search. Check your connection and try again.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${label} returned an unreadable response. Try again.`);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${label} returned an invalid search response.`);
  }
  const result = body as { items?: unknown; error?: unknown };
  if (!response.ok) {
    const reason = typeof result.error === 'string' ? result.error : '';
    if (response.status >= 500 && /fetch failed|failed to fetch|network|timeout|timed out/i.test(reason)) {
      throw new Error(`${label} is temporarily unreachable. Check your connection and try again.`);
    }
    throw new Error(reason || `${label} search failed (HTTP ${response.status}).`);
  }
  if (!Array.isArray(result.items) || !result.items.every(isRankItem)) {
    throw new Error(`${label} returned an invalid item list.`);
  }
  return result.items;
}
