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

const AMBIGUOUS_BOOK_CATEGORIES = new Map([
  [
    'drama',
    {
      displayName: 'Drama',
      options: [
        { slug: 'literary-fiction', categorySlug: 'genre', label: 'Literary Fiction' },
        {
          slug: 'contemporary-fiction',
          categorySlug: 'genre',
          label: 'Contemporary Fiction',
        },
        { slug: 'plays', categorySlug: 'genre', label: 'Plays' },
      ],
    },
  ],
]);

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function comparable(value) {
  return normalizeHardcoverText(value)
    .replace(/^the\s+/u, '')
    .trim();
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

function selectPlausibleSeriesMatches(query, seriesResults, { preferExactSeries = false } = {}) {
  const rawDirectMatches = seriesResults.filter((series) => seriesMatchesQuery(query, series));

  if (rawDirectMatches.length === 0) {
    return [];
  }

  const directMatches = selectDominantExactMatches(rawDirectMatches, getReadersCount, 0.05);
  const authorQualified = directMatches.some((series) => !entityNamesMatch(query, series?.name));

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
  const directMatches = authorResults.filter((author) => entityNamesMatch(query, author?.name));

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

  if (/\b(?:genre|subject|mood|tag)\b/u.test(normalized)) {
    return 'tag';
  }

  if (/\b(?:series|saga|trilogy)\b/u.test(normalized)) {
    return 'series';
  }

  return null;
}

function parseTagTargetHint(text) {
  const normalized = normalizeHardcoverText(text);

  if (
    /\b(?:individual|single)\s+(?:books?|titles?)\b/u.test(normalized) ||
    /\bbooks?\s+(?:themselves|individually)\b/u.test(normalized)
  ) {
    return 'books';
  }

  if (
    /\bbook\s+(?:series|trilogy)\b/u.test(normalized) ||
    /\b(?:series|trilogy)\s+of\s+books\b/u.test(normalized)
  ) {
    return 'series';
  }

  return null;
}

function hasAuthorSeriesSyntax(text) {
  const normalized = normalizeHardcoverText(text);

  return (
    /\b(?:book\s+)?(?:series|trilogy)\s+by\b/u.test(normalized) ||
    /\bbook\s+(?:series|trilogy)\b/u.test(normalized)
  );
}

function hasExplicitBookNoun(text) {
  return /\bbooks?\b/u.test(normalizeHardcoverText(text));
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
  const tagTargetHint = parseTagTargetHint(combinedText);
  const preferExactSeries =
    relationHint === 'series' &&
    /\bmain(?:\s+book)?\s+(?:series|saga|trilogy)\b/u.test(normalizedCombinedText);
  let query = stripRequestedLimit(subject, requestedLimit);

  query = query
    .replace(/^(?:books?\s+)?(?:by|written\s+by|authored\s+by)\s+/iu, '')
    .replace(/^(?:book\s+)?(?:series|saga|trilogy)\s+by\s+/iu, '')
    .replace(/\s+book\s+(?:series|saga|trilogy)$/iu, '')
    .replace(/^(?:the\s+)?(?:author|series|saga|trilogy|genre|subject|mood|tag)\s+/iu, '')
    .replace(/\s+(?:author|series|saga|trilogy|genre|subject|mood|tag)$/iu, '')
    .replace(/\s+(?:individual|single)$/iu, '')
    .replace(/\s+main$/iu, '')
    .replace(
      /^(?:the\s+)?(?:(?:most\s+)?popular|(?:highest|best|top)\s+rated|newest|latest|most\s+recent|oldest|earliest)\s+/iu,
      '',
    )
    .trim();

  return {
    query: query || normalizeWhitespace(subject),
    relationHint,
    tagTargetHint,
    requestedLimit,
    authorSort: parseAuthorSort(combinedText),
    preferExactSeries,
    authorSeriesSyntax: hasAuthorSeriesSyntax(combinedText),
    explicitBookNoun: hasExplicitBookNoun(combinedText),
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

function getAmbiguousBookCategory(query, requestText) {
  const normalizedQuery = normalizeHardcoverText(query);
  const explicitProviderTaxonomy = /\b(?:genre|subject|tag|mood)\b/iu.test(requestText);

  if (explicitProviderTaxonomy) {
    return null;
  }

  return AMBIGUOUS_BOOK_CATEGORIES.get(normalizedQuery) ?? null;
}

async function buildAmbiguousBookCategoryClarification(hardcover, category) {
  const tags = await hardcover.findTagsBySlugs(category.options.map((option) => option.slug));
  const availableOptions = category.options.filter((option) =>
    tags.some(
      (tag) =>
        String(tag?.slug ?? '') === option.slug && tag?.tag_category?.slug === option.categorySlug,
    ),
  );

  if (availableOptions.length === 0) {
    return null;
  }

  return {
    status: 'clarification',
    reason: 'ambiguous-entity',
    question: `"${category.displayName}" is not a single standard Hardcover book genre. Which meaning do you want?`,
    examples: availableOptions.map((option) => `${option.label} books`),
    matches: [],
  };
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

function createAuthorSeriesPlan({ query, author, limit }) {
  return {
    provider: 'hardcover',
    mediaType: 'book',
    mode: 'author-series',
    query,
    resolvedId: Number(author.id),
    resolvedName: author.name,
    parameters: {
      limit,
      sort: 'popular',
    },
  };
}

function createTagPlan({
  query,
  tag,
  limit,
  mode = 'tag-series',
  resolvedName = tagDisplayName(tag),
  semanticCategory = null,
  tagSources = null,
}) {
  return {
    provider: 'hardcover',
    mediaType: 'book',
    mode,
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
    tagTargetHint,
    requestedLimit,
    authorSort,
    preferExactSeries,
    authorSeriesSyntax,
    explicitBookNoun,
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

  let matchingAuthors = [];
  let authorLookupAttempted = false;
  let preloadedSeriesResults = null;
  let exactNamedSeriesMatches = [];

  /*
   * Explicit author-shaped requests must resolve first-class Author entities
   * before Hardcover tags. Hardcover occasionally misclassifies a person's
   * name as a genre, which must not hijack "individual books" or "book series"
   * requests for that author.
   */
  const shouldResolveAuthorFirst =
    relationHint === 'author' ||
    tagTargetHint === 'books' ||
    (relationHint === 'series' && authorSeriesSyntax);

  if (shouldResolveAuthorFirst) {
    const authors = await hardcover.searchAuthors(query, 15);

    matchingAuthors = selectPlausibleAuthorMatches(query, authors);
    authorLookupAttempted = true;

    if (matchingAuthors.length > 0) {
      const useAuthorSeries = relationHint === 'series' && authorSeriesSyntax;

      for (const author of matchingAuthors) {
        plans.push(
          useAuthorSeries
            ? createAuthorSeriesPlan({
                query,
                author,
                limit: explicitLimit ?? defaultLimit,
              })
            : createAuthorPlan({
                query,
                author,
                limit: explicitLimit ?? defaultLimit,
                sort: authorSort,
              }),
        );
      }

      return {
        plans: dedupePlans(plans),
        query,
        relationHint,
        tagTargetHint,
        requestedLimit,
        unsupportedLimit: false,
      };
    }
  }

  /*
   * First-class Series entities outrank same-name inferred tags. Hardcover can
   * have community/category tags such as "Lord of the Rings" that otherwise
   * hijack requests for the actual named series. Keep explicit taxonomy
   * requests ("fantasy genre", "subject", etc.) on the tag path.
   *
   * We only preload here; if no tag collision exists, the normal series path
   * below still decides whether broader related series should be offered.
   */
  const explicitTaxonomyRequest = relationHint === 'tag';
  const shouldProbeNamedSeries =
    !explicitTaxonomyRequest &&
    (relationHint === 'series' || tagTargetHint !== null || explicitBookNoun);

  if (shouldProbeNamedSeries) {
    preloadedSeriesResults = await hardcover.searchSeries(query, 15);
    exactNamedSeriesMatches = selectPlausibleSeriesMatches(query, preloadedSeriesResults, {
      preferExactSeries: true,
    });
  }

  const shouldTryTags = !relationHint || relationHint === 'tag' || tagTargetHint !== null;

  if (shouldTryTags) {
    const ambiguousCategory = getAmbiguousBookCategory(query, requestText);

    if (ambiguousCategory) {
      const clarification = await buildAmbiguousBookCategoryClarification(
        hardcover,
        ambiguousCategory,
      );

      if (clarification) {
        return {
          plans: [],
          query,
          relationHint,
          tagTargetHint,
          requestedLimit,
          unsupportedLimit: false,
          clarification,
        };
      }
    }

    const tags = await hardcover.findTagsBySlugs(tagSlugCandidates(query));
    const matchingTags = tags.filter((tag) => {
      if (!tagMatchesQuery(query, tag)) {
        return false;
      }

      if (relationHint === 'tag' && /\bgenre\b/iu.test(requestText)) {
        return tag.tag_category?.slug === 'genre';
      }

      return true;
    });

    const strongCategoryMatch = matchingTags.some((tag) =>
      ['genre', 'mood'].includes(tag.tag_category?.slug),
    );
    const explicitTagRequest = relationHint === 'tag';

    if (strongCategoryMatch && !explicitTagRequest && exactNamedSeriesMatches.length > 0) {
      for (const series of exactNamedSeriesMatches) {
        plans.push(
          createSeriesPlan({
            query,
            series,
            limit: explicitLimit ?? defaultLimit,
          }),
        );
      }

      return {
        plans: dedupePlans(plans),
        query,
        relationHint,
        tagTargetHint,
        requestedLimit,
        unsupportedLimit: false,
      };
    }

    if (strongCategoryMatch || explicitTagRequest) {
      for (const tag of matchingTags) {
        const limit = explicitLimit ?? DEFAULT_BOOK_TAG_SERIES_LIMIT;

        if (tagTargetHint !== 'series') {
          plans.push(
            createTagPlan({
              query,
              tag,
              limit,
              mode: 'tag-books',
            }),
          );
        }

        if (tagTargetHint !== 'books') {
          plans.push(
            createTagPlan({
              query,
              tag,
              limit,
              mode: 'tag-series',
            }),
          );
        }
      }

      return {
        plans: dedupePlans(plans),
        query,
        relationHint,
        tagTargetHint,
        requestedLimit,
        unsupportedLimit: false,
      };
    }

    // Generic Hardcover tags are lower-confidence than first-class Series and
    // Author entities. Names such as "Stephen King" and "Brandon Sanderson"
    // can exist as community tags, but those tags must not hijack requests for
    // the actual author or their book series. Keep generic tags as a fallback.
    for (const tag of matchingTags) {
      const limit = explicitLimit ?? DEFAULT_BOOK_TAG_SERIES_LIMIT;

      if (tagTargetHint !== 'series') {
        plans.push(
          createTagPlan({
            query,
            tag,
            limit,
            mode: 'tag-books',
          }),
        );
      }

      if (tagTargetHint !== 'books') {
        plans.push(
          createTagPlan({
            query,
            tag,
            limit,
            mode: 'tag-series',
          }),
        );
      }
    }
  }

  const deferredGenericTagPlans = plans.filter(
    (plan) => plan.mode === 'tag-books' || plan.mode === 'tag-series',
  );
  plans.length = 0;

  if (
    !authorLookupAttempted &&
    (!relationHint || relationHint === 'author' || relationHint === 'series')
  ) {
    const authors = await hardcover.searchAuthors(query, 15);
    matchingAuthors = selectPlausibleAuthorMatches(query, authors);

    const explicitAuthorBooks =
      matchingAuthors.length > 0 &&
      (relationHint === 'author' || (!relationHint && explicitBookNoun));
    const explicitAuthorSeries =
      matchingAuthors.length > 0 && relationHint === 'series' && authorSeriesSyntax;

    if (explicitAuthorBooks || explicitAuthorSeries) {
      for (const author of matchingAuthors) {
        plans.push(
          explicitAuthorSeries
            ? createAuthorSeriesPlan({
                query,
                author,
                limit: explicitLimit ?? defaultLimit,
              })
            : createAuthorPlan({
                query,
                author,
                limit: explicitLimit ?? defaultLimit,
                sort: authorSort,
              }),
        );
      }

      return {
        plans: dedupePlans(plans),
        query,
        relationHint,
        tagTargetHint,
        requestedLimit,
        unsupportedLimit: false,
      };
    }
  }

  if (!relationHint || relationHint === 'series') {
    const seriesResults =
      preloadedSeriesResults ?? (await hardcover.searchSeries(query, 15));
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

  for (const author of matchingAuthors) {
    if (relationHint === 'series') {
      plans.push(
        createAuthorSeriesPlan({
          query,
          author,
          limit: explicitLimit ?? defaultLimit,
        }),
      );
    } else {
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

  if (plans.length === 0 && deferredGenericTagPlans.length > 0) {
    plans.push(...deferredGenericTagPlans);
  }

  return {
    plans: dedupePlans(plans),
    query,
    relationHint,
    tagTargetHint,
    requestedLimit,
    unsupportedLimit: false,
  };
}
