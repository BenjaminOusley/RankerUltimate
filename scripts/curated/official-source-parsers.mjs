import {
  BEST_SELLING_GAMES_URL,
  DISNEY_PRINCESS_URL,
  STAR_WARS_EXCLUDED_TITLE_PATTERNS,
  STAR_WARS_GUIDE_URL,
  STEPHEN_KING_EXCLUDED_TITLE_PATTERNS,
  STEPHEN_KING_INCLUDED_OTHER_PROJECTS,
} from './default-manifest-policy.mjs';
import {
  dateFromText,
  decodeHtml,
  dedupeBy,
  htmlToLines,
  normalizeTitle,
  normalizeWhitespace,
  slugify,
  stripHtml,
  yearFromDate,
} from './curated-utils.mjs';

function sectionLines(lines, startLabel, endLabel) {
  const startIndex = lines.findIndex((line) => line.toLowerCase() === startLabel.toLowerCase());

  if (startIndex < 0) {
    return [];
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && line.toLowerCase() === endLabel.toLowerCase(),
  );

  return lines.slice(startIndex + 1, endIndex < 0 ? undefined : endIndex);
}

function cleanStarWarsTitle(rawTitle) {
  return normalizeWhitespace(rawTitle)
    .replace(/^[-•*]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStarWarsTmdbSearchTitles(title) {
  const normalized = normalizeWhitespace(title);
  const variants = [normalized];
  const episodeMatch = normalized.match(/^(?:Star Wars:\s*)?(.+?)\s*\(Episode\s+([IVX]+)\)$/i);

  if (episodeMatch) {
    const coreTitle = normalizeWhitespace(episodeMatch[1]);
    const episodeNumber = episodeMatch[2].toUpperCase();

    variants.push(
      coreTitle,
      `Star Wars: ${coreTitle}`,
      `Star Wars: Episode ${episodeNumber} - ${coreTitle}`,
    );

    if (normalizeTitle(coreTitle) === 'a new hope') {
      variants.push('Star Wars');
    }
  } else if (/^star wars:\s*/i.test(normalized)) {
    variants.push(normalized.replace(/^star wars:\s*/i, ''));
  }

  return dedupeBy(variants.filter(Boolean), (variant) => normalizeTitle(variant));
}

export function parseStarWarsGuide(html) {
  const lines = htmlToLines(html);
  const releaseLines = sectionLines(lines, 'Release Order', 'Chronological Order');
  const animatedLines = sectionLines(lines, 'Animated Series', 'Specials');
  const entries = [];

  for (const line of releaseLines) {
    const match = line.match(/^(.*?)(?:\s*\((movie|series),\s*(\d{4})\)|\s*\((\d{4})\))\s*$/i);

    if (!match) {
      continue;
    }

    const title = cleanStarWarsTitle(match[1]);
    const explicitType = match[2]?.toLowerCase() ?? null;
    const year = Number(match[3] ?? match[4]);

    if (!title || STAR_WARS_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
      continue;
    }

    entries.push({
      title,
      year,
      ...(explicitType ? { explicitType } : {}),
    });
  }

  for (const line of animatedLines) {
    const title = cleanStarWarsTitle(line);

    if (
      !title ||
      title.length > 100 ||
      STAR_WARS_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    ) {
      continue;
    }

    if (!/star wars|young jedi adventures/i.test(title)) {
      continue;
    }

    entries.push({
      title,
      year: null,
      explicitType: 'series',
    });
  }

  const deduped = dedupeBy(
    entries,
    (entry) => `${normalizeTitle(entry.title)}:${entry.explicitType ?? ''}:${entry.year ?? ''}`,
  );

  if (deduped.length < 20) {
    throw new Error(
      `Star Wars guide parsing returned only ${deduped.length} rankable entries from ${STAR_WARS_GUIDE_URL}.`,
    );
  }

  return deduped;
}

export function parseDisneyPrincessFilms(html) {
  const lines = htmlToLines(html);
  const section = sectionLines(
    lines,
    'Discover (And Rediscover) Your Favorite Princess Films',
    'What’s Trending',
  );
  const entries = [];

  for (const line of section) {
    const cleaned = line
      .replace(/^\d+\.\s*/, '')
      .replace(/^[-•*]+\s*/, '')
      .trim();

    if (!cleaned || cleaned.length > 100) {
      continue;
    }

    const match = cleaned.match(/^(.*?)(?:\s*\((\d{4})\))?$/);
    const title = normalizeWhitespace(match?.[1] ?? cleaned);
    const year = match?.[2] ? Number(match[2]) : null;

    if (!title || /^(videos?|characters?|discover disney princess)$/i.test(title)) {
      continue;
    }

    entries.push({ title, year });
  }

  const deduped = dedupeBy(entries, (entry) => normalizeTitle(entry.title));

  if (deduped.length < 13 || deduped.length > 25) {
    throw new Error(
      `Disney Princess parsing returned ${deduped.length} films from ${DISNEY_PRINCESS_URL}; expected the official film section.`,
    );
  }

  return deduped;
}

function cleanWorkTitle(value) {
  return normalizeWhitespace(stripHtml(value)).replace(/\s+/g, ' ').trim();
}

export function parseStephenKingWorksPage(html, category) {
  const source = String(html);
  const works = [];

  const rows = [
    ...source.matchAll(/<a\b([^>]*\bclass=["'][^"']*\bwork\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi),
  ];

  for (const row of rows) {
    const attributes = row[1];
    const body = row[2];

    const href = attributes.match(/\bhref=["']([^"']+)["']/i)?.[1] ?? '';

    const titleHtml =
      body.match(/<p\b[^>]*class=["'][^"']*\bworks-title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
      '';

    const typeHtml =
      body.match(/<p\b[^>]*class=["'][^"']*\bworks-type\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
      '';

    const dateHtml =
      body.match(/<p\b[^>]*class=["'][^"']*\bworks-date\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
      '';

    const title = normalizeWhitespace(stripHtml(titleHtml));
    const type = normalizeWhitespace(stripHtml(typeHtml));
    const dateText = normalizeWhitespace(stripHtml(dateHtml));

    if (!href || !title) {
      continue;
    }

    const releaseDate = attributes.match(/\bdata-date=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1] ?? null;

    const yearText = releaseDate?.slice(0, 4) ?? dateText.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? null;

    const imagePath =
      body.match(/background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/i)?.[1] ?? null;

    const slug =
      href
        .split('/')
        .filter(Boolean)
        .at(-1)
        ?.replace(/\.html$/i, '') ?? '';

    works.push({
      title,
      type,
      context: type,
      workType: type,
      label: type,
      dateText,
      date: dateText,
      category,
      href,
      slug,
      releaseDate,
      year: yearText ? Number(yearText) : undefined,
      ...(imagePath
        ? {
            image: new URL(imagePath, 'https://stephenking.com/').href,
          }
        : {}),
    });
  }

  if (works.length > 0) {
    return works;
  }

  /*
   * Compatibility fallback for our compact parser fixtures and
   * for an older StephenKing.com markup shape.
   */
  const legacyPattern =
    /<a\b[^>]*href=["']([^"']*\/works\/[^"']+\.html)["'][^>]*>([\s\S]*?)<\/a>\s*<span\b[^>]*>([\s\S]*?)<\/span>\s*<time\b[^>]*>([\s\S]*?)<\/time>/gi;

  for (const match of source.matchAll(legacyPattern)) {
    const href = match[1];
    const title = normalizeWhitespace(stripHtml(match[2]));
    const type = normalizeWhitespace(stripHtml(match[3]));
    const dateText = normalizeWhitespace(stripHtml(match[4]));

    const yearText = dateText.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? null;

    const slug =
      href
        .split('/')
        .filter(Boolean)
        .at(-1)
        ?.replace(/\.html$/i, '') ?? '';

    works.push({
      title,
      type,
      context: type,
      workType: type,
      label: type,
      dateText,
      date: dateText,
      category,
      href,
      slug,
      releaseDate: null,
      year: yearText ? Number(yearText) : undefined,
    });
  }

  return works;
}

function normalizeKingCanonicalTitle(title) {
  return title
    .replace(/\s+Illustrated Edition$/i, '')
    .replace(/\s+\(Revised\)$/i, '')
    .replace(/^The Green Mile: .+$/i, 'The Green Mile')
    .trim();
}

export function filterStephenKingBooks(works) {
  const filtered = [];

  for (const work of works) {
    const { category, context } = work;
    const title = normalizeKingCanonicalTitle(work.title);

    if (STEPHEN_KING_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(work.title))) {
      continue;
    }

    if (category === 'novel') {
      if (!/\b(?:bachman\s+)?novel\b/i.test(context) || /\bnovella\b/i.test(context)) {
        continue;
      }
    } else if (category === 'other-project') {
      if (!STEPHEN_KING_INCLUDED_OTHER_PROJECTS.has(title)) {
        continue;
      }
    } else if (category !== 'collection' && category !== 'nonfiction') {
      continue;
    }

    filtered.push({
      ...work,
      title,
      slug: work.slug || slugify(title),
    });
  }

  const byTitle = new Map();

  for (const work of filtered) {
    const key = normalizeTitle(work.title);
    const existing = byTitle.get(key);

    if (
      !existing ||
      (work.year ?? Number.MAX_SAFE_INTEGER) < (existing.year ?? Number.MAX_SAFE_INTEGER)
    ) {
      byTitle.set(key, work);
    }
  }

  return [...byTitle.values()].sort((left, right) => {
    const yearDifference = (left.year ?? 9999) - (right.year ?? 9999);
    return yearDifference || left.title.localeCompare(right.title);
  });
}

function cellText(cellHtml) {
  return normalizeWhitespace(stripHtml(cellHtml));
}

function cleanBestSellingGameTitle(value) {
  const [title] = String(value ?? '').split(/\s*(?:\{\{|<ref\b|<\/ref\b)/iu);

  return normalizeWhitespace(title.replace(/\s*\[[^\]]+\]\s*/gu, ' '));
}

export function parseBestSellingGames(html) {
  const tableMatch = String(html).match(
    /<table\b[^>]*class=["'][^"']*wikitable[^"']*["'][^>]*>[\s\S]*?<\/table>/i,
  );

  if (!tableMatch) {
    throw new Error(`Could not find the best-selling games table on ${BEST_SELLING_GAMES_URL}.`);
  }

  const rows = [...tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const results = [];
  let inheritedRank = null;

  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cellText(cell[1]),
    );

    if (cells.length < 4 || (/title/i.test(cells[0]) && /sales/i.test(cells[1]))) {
      continue;
    }

    let offset = 0;
    let rank = Number.parseInt(cells[0], 10);

    if (Number.isFinite(rank)) {
      inheritedRank = rank;
      offset = 1;
    } else {
      rank = inheritedRank ?? results.length + 1;
    }

    const title = cells[offset];
    const sales = Number.parseFloat(cells[offset + 1]?.replace(/[^0-9.]/g, ''));
    const releaseYearCell = cells[offset + 4] ?? '';
    const year = yearFromDate(releaseYearCell);

    if (!title || !Number.isFinite(sales)) {
      continue;
    }

    results.push({
      rank,
      title: cleanBestSellingGameTitle(title),
      salesMillions: sales,
      year,
    });
  }

  const top50 = results.slice(0, 50);

  if (top50.length !== 50) {
    throw new Error(
      `Best-selling games parsing returned ${top50.length} rows; expected exactly 50 from ${BEST_SELLING_GAMES_URL}.`,
    );
  }

  return top50;
}
