import {
  DEFAULT_BOOK_COLLECTION_LIMIT,
  DEFAULT_BOOK_TAG_CANDIDATE_LIMIT,
  DEFAULT_BOOK_TAG_SERIES_LIMIT,
  MAX_BOOK_COLLECTION_LIMIT,
} from '../../generation/book-defaults.mjs';
import { normalizeHardcoverText } from '../../providers/hardcover.mjs';

const TAG_ALIAS_SLUGS = new Map([
  ['sci fi', 'science-fiction'],
  ['scifi', 'science-fiction'],
  ['science fiction', 'science-fiction'],
]);

const SEMANTIC_BOOK_CATEGORIES = new Map([
  [
    'drama',
    {
      key: 'drama',
      displayName: 'Drama',
      sources: [
        { slug: 'drama', categorySlug: 'tag', weight: 1 },
        { slug: 'plays', categorySlug: 'genre', weight: 0.85 },
        { slug: 'literary-fiction', categorySlug: 'genre', weight: 0.45 },
      ],
    },
  ],
]);

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function comparable(value) {
  return normalizeHardcoverText(value).replace(/^the\s+/u, '').trim();
}

function entityNamesMatch(left, right) {
  return comparable(left) === comparable(right);
}

function seriesMatchesQuery(query, series) {
  if (entityNamesMatch(query, series?.name)) {
    return true;
  }

  const normalizedQuery = comparable(query);
  const seriesName = comparable(series?.name);
  const authorName = comparable(series?.author_name ?? series?.author?.name ?? '');

  if (!seriesName || !authorName) {
    return false;
  }

  return (
    normalizedQuery === `${authorName} ${seriesName}` ||
    normalizedQuery === `${seriesName} ${authorName}`
  );
}

function seriesNameStartsWith(query, series) {
  const normalizedQuery = comparable(query);
  const normalizedName = comparable(series?.name);

  return normalizedName.startsWith(`${normalizedQuery} `);
}

function getReadersCount(series) {
  return Number(series?.readers_count ?? series?.users_count ?? 0);
}

function getAuthorVolume(author) {
  return Number(author?.books_count ?? author?.users_count ?? 0);
}

function selectDominantExactMatches(matches, getScore, minimumRatio = 0.1) {
  if (matches.length <= 1) {
    return matches;
  }

  const ranked = [...matches].sort(
    (left, right) =>
      getScore(right) - getScore(left) ||
      Number(right?.books_count ?? right?.primary_books_count ?? 0) -
        Number(left?.books_count ?? left?.primary_books_count ?? 0) ||
      Number(left?.id ?? 0) - Number(right?.id ?? 0),
  );
  const bestScore = getScore(ranked[0]);

  if (bestScore <= 0) {
    return ranked;
  }

  const cutoff = bestScore * minimumRatio;
  const plausible = ranked.filter((entry) => getScore(entry) >= cutoff);

  return plausible.length > 0 ? plausible : [ranked[0]];
}

function selectPlausibleSeriesMatches(
  query,
  seriesResults,
  { preferExactSeries = false } = {},
) {
  const rawDirectMatches = seriesResults.filter((series) =>
    seriesMatchesQuery(query, series),
  );

  if (rawDirectMatches.length === 0) {
    return [];
  }

  const directMatches = selectDominantExactMatches(
    rawDirectMatches,
    getReadersCount,
    0.05,
  );
  const authorQualified = directMatches.some(
    (series) => !entityNamesMatch(query, series?.name),
  );

  if (authorQualified || preferExactSeries) {
    return directMatches;
  }

  const bestDirectReaders = Math.max(0, ...directMatches.map(getReadersCount));
  const broaderThreshold = Math.max(1000, bestDirectReaders * 0.5);
  const broaderMatches = seriesResults.filter(
    (series) =>
      !rawDirectMatches.some((direct) => Number(direct.id) === Number(series.id)) &&
      seriesNameStartsWith(query, series) &&
      getReadersCount(series) >= broaderThreshold,
  );

  return [...directMatches, ...broaderMatches];
}

function selectPlausibleAuthorMatches(query, authorResults) {
  const directMatches = authorResults.filter((author) =>
    entityNamesMatch(query, author?.name),
  );

  return selectDominantExactMatches(directMatches, getAuthorVolume, 0.1);
}

function parseRequestedLimit(text) {
  const normalized = normalizeHardcoverText(text);
  const patterns = [
    /\b(?:top|best)\s+(\d{1,4})\b/u,
    /\b(\d{1,4})\s+(?:most\s+popular|highest\s+rated|best)\b/u,
    /^(\d{1,4})\s+/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (!match) {
      continue;
    }

    const limit = Number.parseInt(match[1], 10);

    if (Number.isSafeInteger(limit) && limit > 0) {
      return limit;
    }
  }

  return null;
}

function stripRequestedLimit(value, requestedLimit) {
  let output = normalizeWhitespace(value)
    .replace(/^(?:the\s+)?(?:top|best)\s+\d{1,4}\s+/iu, '')
    .replace(/^(?:the\s+)?\d{1,4}\s+(?:most\s+popular|highest\s+rated|best)\s+/iu, '');

  if (requestedLimit !== null) {
    output = output.replace(/^\d{1,4}\s+/u, '');
  }

  return output.trim();
}

function parseRelationHint(text) {
  const normalized = normalizeHardcoverText(text);

  if (/\b(?:books?\s+by|written\s+by|authored\s+by|author)\b/u.test(normalized)) {
    return 'author';
  }

  if (/\b(?:series|saga)\b/u.test(normalized)) {
    return 'series';
  }

  if (/\b(?:genre|subject|mood|tag)\b/u.test(normalized)) {
    return 'tag-series';
  }

  return null;
}

function parseAuthorSort(text) {
  const normalized = normalizeHardcoverText(text);

  if (/\b(?:highest|best|top)\s+rated\b/u.test(normalized)) {
    return 'rating';
  }

  if (/\b(?:newest|latest|most\s+recent)\b/u.test(normalized)) {
    return 'release-desc';
  }

  if (/\b(?:oldest|earliest)\b/u.test(normalized)) {
    return 'release-asc';
  }

  if (/\b(?:alphabetical|alphabetically|a\s+z|name)\b/u.test(normalized)) {
    return 'name';
  }

  return 'popular';
}

function cleanBookQuery(subject, requestText) {
  const combinedText = `${requestText} ${subject}`;
  const normalizedCombinedText = normalizeHardcoverText(combinedText);
  const requestedLimit = parseRequestedLimit(combinedText);
  const relationHint = parseRelationHint(combinedText);
  const preferExactSeries =
    relationHint === 'series' &&
    /\bmain(?:\s+book)?\s+(?:series|saga)\b/u.test(normalizedCombinedText);
  let query = stripRequestedLimit(subject, requestedLimit);

  query = query
    .replace(/^(?:books?\s+)?(?:by|written\s+by|authored\s+by)\s+/iu, '')
    .replace(/^(?:the\s+)?(?:author|series|saga|genre|subject|mood|tag)\s+/iu, '')
    .replace(/\s+(?:author|series|saga|genre|subject|mood|tag)$/iu, '')
    .replace(/\s+main$/iu, '')
    .replace(
      /^(?:the\s+)?(?:(?:most\s+)?popular|(?:highest|best|top)\s+rated|newest|latest|most\s+recent|oldest|earliest)\s+/iu,
      '',
    )
    .trim();

  return {
    query: query || normalizeWhitespace(subject),
    relationHint,
    requestedLimit,
    authorSort: parseAuthorSort(combinedText),
    preferExactSeries,
  };
}

function tagSlugCandidates(query) {
  const normalized = normalizeHardcoverText(query);
  const defaultSlug = normalized.replace(/\s+/gu, '-');
  const aliasSlug = TAG_ALIAS_SLUGS.get(normalized);

  return [...new Set([defaultSlug, aliasSlug].filter(Boolean))];
}

function tagMatchesQuery(query, tag) {
  const normalizedQuery = normalizeHardcoverText(query);
  const normalizedTag = normalizeHardcoverText(tag?.tag);
  const normalizedSlug = normalizeHardcoverText(String(tag?.slug ?? '').replace(/-/gu, ' '));

  return normalizedQuery === normalizedTag || normalizedQuery === normalizedSlug;
}

function tagDisplayName(tag) {
  const raw = String(tag?.tag ?? '').trim();

  if (!raw || raw !== raw.toLowerCase()) {
    return raw;
  }

  return raw.replace(/\b[a-z]/gu, (character) => character.toUpperCase());
}

function getSemanticBookCategory(query, requestText) {
  const normalizedQuery = normalizeHardcoverText(query);
  const explicitProviderTag = /\b(?:tag|mood)\b/iu.test(requestText);

  if (explicitProviderTag) {
    return null;
  }

  return SEMANTIC_BOOK_CATEGORIES.get(normalizedQuery) ?? null;
}

function resolveSemanticTagSources(category, tags) {
  const resolved = [];

  for (const source of category.sources) {
    const tag = tags.find(
      (entry) =>
        String(entry?.slug ?? '') === source.slug &&
        entry?.tag_category?.slug === source.categorySlug,
    );

    if (!tag) {
      continue;
    }

    resolved.push({
      id: Number(tag.id),
      slug: tag.slug,
      categorySlug: source.categorySlug,
      weight: source.weight,
    });
  }

  return resolved;
}

function createSeriesPlan({ query, series, limit }) {
  const authorName = series.author_name ?? series.author?.name;
  const resolvedAuthorName =
    typeof authorName === 'string' && authorName.trim() ? authorName.trim() : null;

  return {
    provider: 'hardcover',
    mediaType: 'book',
    mode: 'series',
    query,
    resolvedId: Number(series.id),
    resolvedName: series.name,
    ...(resolvedAuthorName ? { resolvedAuthorName } : {}),
    parameters: {
      limit,
      sort: 'series-order',
    },
  };
}

function createAuthorPlan({ query, author, limit, sort }) {
  return {
    provider: 'hardcover',
    mediaType: 'book',
    mode: 'author',
    query,
    resolvedId: Number(author.id),
    resolvedName: author.name,
    parameters: {
      limit,
      sort,
    },
  };
}

function createTagPlan({
  query,
  tag,
  limit,
  resolvedName = tagDisplayName(tag),
  semanticCategory = null,
  tagSources = null,
}) {
  return {
    provider: 'hardcover',
    mediaType: 'book',
    mode: 'tag-series',
    query,
    resolvedId: Number(tag.id),
    resolvedName,
    parameters: {
      limit,
      sort: 'popular',
      tagSlug: tag.slug,
      tagCategorySlug: tag.tag_category?.slug ?? 'genre',
      candidateLimit: DEFAULT_BOOK_TAG_CANDIDATE_LIMIT,
      ...(semanticCategory ? { semanticCategory } : {}),
      ...(Array.isArray(tagSources) && tagSources.length > 0 ? { tagSources } : {}),
    },
  };
}

function dedupePlans(plans) {
  const unique = new Map();

  for (const plan of plans) {
    unique.set(`${plan.mode}:${plan.resolvedId}`, plan);
  }

  return [...unique.values()];
}

export async function findBookPlans({ hardcover, subject, requestText }) {
  if (!hardcover) {
    throw new Error('Hardcover provider is required to plan book collections.');
  }

  const {
    query,
    relationHint,
    requestedLimit,
    authorSort,
    preferExactSeries,
  } = cleanBookQuery(subject, requestText);

  if (requestedLimit !== null && requestedLimit > MAX_BOOK_COLLECTION_LIMIT) {
    return {
      plans: [],
      query,
      relationHint,
      requestedLimit,
      unsupportedLimit: true,
    };
  }

  const plans = [];
  const defaultLimit = DEFAULT_BOOK_COLLECTION_LIMIT;
  const explicitLimit = requestedLimit ?? null;

  if (!relationHint || relationHint === 'tag-series') {
    const semanticCategory = getSemanticBookCategory(query, requestText);

    if (semanticCategory) {
      const tags = await hardcover.findTagsBySlugs(
        semanticCategory.sources.map((source) => source.slug),
      );
      const tagSources = resolveSemanticTagSources(semanticCategory, tags);
      const primarySource = tagSources[0] ?? null;
      const primaryTag = primarySource
        ? tags.find(
            (tag) =>
              Number(tag.id) === primarySource.id &&
              tag.tag_category?.slug === primarySource.categorySlug,
          )
        : null;

      if (primaryTag) {
        plans.push(
          createTagPlan({
            query,
            tag: primaryTag,
            limit: explicitLimit ?? DEFAULT_BOOK_TAG_SERIES_LIMIT,
            resolvedName: semanticCategory.displayName,
            semanticCategory: semanticCategory.key,
            tagSources,
          }),
        );

        return {
          plans: dedupePlans(plans),
          query,
          relationHint,
          requestedLimit,
          unsupportedLimit: false,
        };
      }
    }

    const tags = await hardcover.findTagsBySlugs(tagSlugCandidates(query));
    const matchingTags = tags.filter((tag) => {
      if (!tagMatchesQuery(query, tag)) {
        return false;
      }

      if (relationHint === 'tag-series' && /\bgenre\b/iu.test(requestText)) {
        return tag.tag_category?.slug === 'genre';
      }

      return true;
    });

    for (const tag of matchingTags) {
      plans.push(
        createTagPlan({
          query,
          tag,
          limit: explicitLimit ?? DEFAULT_BOOK_TAG_SERIES_LIMIT,
        }),
      );
    }

    if (
      relationHint === null &&
      matchingTags.some((tag) => ['genre', 'mood'].includes(tag.tag_category?.slug))
    ) {
      return {
        plans: dedupePlans(plans),
        query,
        relationHint,
        requestedLimit,
        unsupportedLimit: false,
      };
    }
  }

  if (!relationHint || relationHint === 'series') {
    const seriesResults = await hardcover.searchSeries(query, 15);
    const matchingSeries = selectPlausibleSeriesMatches(query, seriesResults, {
      preferExactSeries,
    });

    for (const series of matchingSeries) {
      plans.push(
        createSeriesPlan({
          query,
          series,
          limit: explicitLimit ?? defaultLimit,
        }),
      );
    }
  }

  if (!relationHint || relationHint === 'author') {
    const authors = await hardcover.searchAuthors(query, 15);
    const matchingAuthors = selectPlausibleAuthorMatches(query, authors);

    for (const author of matchingAuthors) {
      plans.push(
        createAuthorPlan({
          query,
          author,
          limit: explicitLimit ?? defaultLimit,
          sort: authorSort,
        }),
      );
    }
  }

  return {
    plans: dedupePlans(plans),
    query,
    relationHint,
    requestedLimit,
    unsupportedLimit: false,
  };
}
