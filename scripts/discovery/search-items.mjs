import { createIgdbRankItem } from '../providers/igdb.mjs';
import { createRankItem } from '../providers/tmdb.mjs';

/** Prefer exact names, then titles containing the complete query. This prevents
 * provider search engines from returning unrelated matches (e.g. Halo 3 -> Harry Potter 3).
 * Keep a token fallback for unusual punctuation/word order only when no phrase matches. */
function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKD').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function rankDiscoveryMatches(rows, query, title) {
  const expected = normalizeTitle(query);
  const tokens = expected.split(' ').filter(Boolean);
  const scored = rows.map((row, index) => {
    const name = normalizeTitle(title(row));
    const phrase = name === expected ? 4 : name.startsWith(`${expected} `) ? 3 :
      name.includes(` ${expected} `) || name.endsWith(` ${expected}`) ? 2 : 0;
    const allTokens = tokens.every((token) => name.split(' ').includes(token));
    return { row, index, phrase, allTokens, titleLength: name.length };
  });
  const hasPhrase = scored.some((item) => item.phrase > 0);
  return scored.filter((item) => hasPhrase ? item.phrase > 0 : item.allTokens)
    .sort((a, b) => b.phrase - a.phrase || a.titleLength - b.titleLength || a.index - b.index)
    .map((item) => item.row);
}

function isSingleBookResult(book) {
  const name = String(book?.title ?? '');
  // Hardcover indexes many commercial bundles as books. Standalone book search
  // prioritizes actual books; bundle/omnibus support can be offered explicitly later.
  return book?.compilation !== true &&
    !/\b(?:collection|box(?:ed)? set|omnibus|trilogy set|complete series|book collection)\b/iu.test(name);
}

/** Discovery is provider-driven; consumers (ratings, generator) share item identity. */
export const ITEM_DISCOVERY_SOURCES = Object.freeze(['tmdb', 'igdb', 'hardcover']);

function hardcoverItem(book) {
  const id = Number(book?.canonical_id || book?.id);
  const name = typeof book?.title === 'string' ? book.title.trim() : '';
  if (!Number.isSafeInteger(id) || id < 1 || !name) return null;
  const slug = typeof book.slug === 'string' && book.slug.trim()
    ? book.slug.trim() : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const year = Number(book.release_year);
  const subtitle = Number.isInteger(year) && year > 1000 && year < 9999
    ? String(year) : typeof book.release_date === 'string' ? book.release_date.slice(0, 4) : '';
  const image = typeof book.image === 'string' ? book.image :
    book.image?.url ?? book.image_url ?? book.cover_url ?? null;
  return {
    id: `${slug}-${id}`,
    name,
    ...( /^\d{4}$/.test(subtitle) ? { subtitle } : {}),
    ...(typeof image === 'string' && /^https:\/\//.test(image) ? { image } : {}),
    source: { provider: 'hardcover', type: 'book', id: String(id) },
  };
}

export async function findRateItems({ provider, mediaType, query, providers }) {
  if (!ITEM_DISCOVERY_SOURCES.includes(provider)) throw new Error('Unsupported discovery provider.');
  const text = typeof query === 'string' ? query.trim() : '';
  if (text.length < 2 || text.length > 200) throw new Error('Search must contain 2–200 characters.');
  if (provider === 'tmdb') {
    if (!['movie', 'tv'].includes(mediaType)) throw new Error('Choose Movies or TV Shows.');
    const tmdb = providers.tmdb;
    if (!tmdb) throw new Error('TMDB search is unavailable.');
    const matches = mediaType === 'movie' ? await tmdb.searchMovie(text) : await tmdb.searchTv(text);
    return rankDiscoveryMatches(matches, text, item => mediaType === 'movie' ? item?.title : item?.name).slice(0, 20).filter(item =>
      Number.isSafeInteger(item?.id) && item.id > 0 &&
      typeof (mediaType === 'movie' ? item.title : item.name) === 'string',
    ).map(item => createRankItem(item, mediaType));
  }
  if (provider === 'igdb') {
    if (!providers.igdb) throw new Error('IGDB search is unavailable.');
    const matches = await providers.igdb.searchGames(text, 40);
    return rankDiscoveryMatches(matches, text, item => item?.name).slice(0, 20).map(createIgdbRankItem);
  }
  if (!providers.hardcover) throw new Error('Hardcover search is unavailable.');
  const matches = await providers.hardcover.searchBooks(text, 40);
  const ranked = rankDiscoveryMatches(matches.filter(isSingleBookResult), text, item => item?.title);
  const items = ranked.slice(0, 20).map(hardcoverItem).filter(Boolean);
  // Return only one entry per book concept, not each printing/edition.
  return [...new Map(items.map(item => [`${item.source.provider}:${item.source.type}:${item.source.id}`, item])).values()];
}
