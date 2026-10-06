const HTML_ENTITY_MAP = new Map([
  ['&amp;', '&'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&nbsp;', ' '],
  ['&ndash;', '–'],
  ['&mdash;', '—'],
  ['&rsquo;', '’'],
  ['&lsquo;', '‘'],
  ['&ldquo;', '“'],
  ['&rdquo;', '”'],
]);

export function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(amp|quot|apos|lt|gt|nbsp|ndash|mdash|rsquo|lsquo|ldquo|rdquo);/gi, (entity) =>
      HTML_ENTITY_MAP.get(entity.toLowerCase()) ?? entity,
    );
}

export function normalizeWhitespace(value) {
  return decodeHtml(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function stripHtml(value) {
  return normalizeWhitespace(
    String(value ?? '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:br|\/p|\/li|\/div|\/section|\/article|\/h[1-6]|\/tr|\/td|\/th)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function htmlToLines(value) {
  return stripHtml(value)
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

export function normalizeTitle(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugify(value) {
  return normalizeTitle(value).replace(/\s+/g, '-');
}

export function yearFromDate(value) {
  const match = String(value ?? '').match(/\b(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : null;
}

export function dateFromText(value) {
  const text = String(value ?? '');
  const monthNames = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  const full = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/i,
  );

  if (full) {
    const month = monthNames[full[1].toLowerCase()];
    return `${full[3]}-${String(month).padStart(2, '0')}-${String(Number(full[2])).padStart(2, '0')}`;
  }

  const monthYear = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(18\d{2}|19\d{2}|20\d{2}|21\d{2})\b/i,
  );

  if (monthYear) {
    const month = monthNames[monthYear[1].toLowerCase()];
    return `${monthYear[2]}-${String(month).padStart(2, '0')}-01`;
  }

  return null;
}

export function dedupeBy(items, getKey) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = getKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export async function fetchText(url, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required.');
  }

  const response = await fetchImpl(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'RankerUltimate curated-default updater (+https://github.com/)',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }

  return response.text();
}

export function itemIdentityKey(item) {
  if (item?.source?.provider && item?.source?.id) {
    return `${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`;
  }

  return `${item?.name ?? ''}:${item?.subtitle ?? ''}`;
}

export function currentIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function releasedByToday(dateValue, today = currentIsoDate()) {
  return typeof dateValue === 'string' && dateValue.length >= 10 && dateValue.slice(0, 10) <= today;
}
