import { findIgdbEntityMatches } from '../generation/igdb-entity-search.mjs';
import { normalizeTitle } from '../providers/tmdb.mjs';

const SUPPORTED_MEDIA_TYPES = new Set(['movie', 'tv', 'game']);
const DEFAULT_LIMIT = 50;
const MAX_COLLECTION_LIMIT = 250;

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeComparable(value) {
  return normalizeTitle(value)
    .replace(/^the\s+/u, '')
    .trim();
}

function simpleSingular(value) {
  if (value.endsWith('ies') && value.length > 3) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith('s') && !value.endsWith('ss') && value.length > 2) {
    return value.slice(0, -1);
  }

  return value;
}

function uniqueQueries(values) {
  return [...new Set(values.map((value) => normalizeWhitespace(value)).filter(Boolean))];
}

function entityNameStartsWith(query, candidate) {
  const normalizedQuery = normalizeComparable(query);
  const normalizedCandidate = normalizeComparable(candidate);

  return normalizedCandidate.startsWith(`${normalizedQuery} `);
}

function entityNamesMatch(query, candidate, { allowSimplePlural = false } = {}) {
  const normalizedQuery = normalizeComparable(query);
  const normalizedCandidate = normalizeComparable(candidate);

  if (normalizedQuery === normalizedCandidate) {
    return true;
  }

  return (
    allowSimplePlural &&
    simpleSingular(normalizedQuery) === simpleSingular(normalizedCandidate)
  );
}


function parseRequestedLimit(text) {
  const normalized = normalizeComparable(text);
  const patterns = [
    /\b(?:top|best)\s+(\d{1,4})\b/u,
    /\b(\d{1,4})\s+(?:most\s+popular|highest\s+rated|best)\b/u,
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

function stripRequestedLimit(value) {
  return value
    .replace(/^(?:the\s+)?(?:top|best)\s+\d{1,4}\s+/iu, '')
    .replace(/^(?:the\s+)?\d{1,4}\s+(?:most\s+popular|highest\s+rated|best)\s+/iu, '')
    .trim();
}

function parseIncludeDlcExpansionsHint(text) {
  const normalized = normalizeComparable(text);

  return (
    /\b(?:include|including|with|plus)\b[^,.]{0,40}\b(?:dlc|dlcs|expansion|expansions)\b/u.test(
      normalized,
    ) ||
    /\b(?:dlc|dlcs|expansion|expansions)\b[^,.]{0,20}\bincluded\b/u.test(normalized)
  );
}

function stripGameContentScopeModifiers(value) {
  return value
    .replace(
      /\s+(?:including|include|with|plus|without)\s+(?:(?:dlc|dlcs)(?:\s*(?:and|\/|&)\s*)?)?(?:expansion|expansions)?\s*$/iu,
      '',
    )
    .replace(
      /\s+(?:including|include|with|plus|without)\s+(?:expansion|expansions)(?:\s*(?:and|\/|&)\s*(?:dlc|dlcs))?\s*$/iu,
      '',
    )
    .trim();
}

function parseSortHint(text, mediaType) {
  const normalized = normalizeComparable(text);

  if (/\b(?:highest|best|top)\s+rated\b/u.test(normalized)) {
    return mediaType === 'game' ? 'rating' : 'popularity';
  }

  if (/\b(?:newest|latest|most\s+recent)\b/u.test(normalized)) {
    return 'release-desc';
  }

  if (/\b(?:oldest|earliest)\b/u.test(normalized)) {
    return 'release-asc';
  }

  return mediaType === 'game' ? 'popular' : 'popularity';
}

function parseRelationHint(text, mediaType) {
  const normalized = normalizeComparable(text);

  if (mediaType === 'game') {
    if (/\b(?:franchise|series)\b/u.test(normalized)) {
      return 'franchise';
    }

    if (/\b(?:platform|console)\b/u.test(normalized)) {
      return 'platform';
    }

    if (/\b(?:company|developer|publisher|studio)\b/u.test(normalized)) {
      return 'company';
    }

    if (/\bgenre\b/u.test(normalized)) {
      return 'genre';
    }

    return null;
  }

  if (/\b(?:directed\s+by|director)\b/u.test(normalized)) {
    return 'director';
  }

  if (/\b(?:starring|featuring|actor|actress)\b/u.test(normalized)) {
    return 'actor';
  }

  if (/\bfeature\s+films?\b/u.test(normalized) && mediaType === 'movie') {
    return 'company-features';
  }

  if (/\b(?:company|studio|produced\s+by)\b/u.test(normalized)) {
    return 'company';
  }

  if (/\bgenre\b/u.test(normalized)) {
    return 'genre';
  }

  return null;
}

function cleanPlanningQuery(subject, requestText, mediaType) {
  let query = normalizeWhitespace(subject);
  const combinedText = `${requestText} ${subject}`;
  const relationHint = parseRelationHint(combinedText, mediaType);
  const requestedLimit = parseRequestedLimit(combinedText);
  const includeDlcExpansions =
    mediaType === 'game' && parseIncludeDlcExpansionsHint(combinedText);

  query = stripRequestedLimit(query);

  if (mediaType === 'game') {
    query = stripGameContentScopeModifiers(query);
  }

  query = query
    .replace(
      /^(?:the\s+)?(?:(?:most\s+)?popular|(?:highest|best|top)\s+rated|newest|latest|most\s+recent|oldest|earliest)\s+/iu,
      '',
    )
    .replace(/^(?:directed\s+by|starring|featuring|produced\s+by)\s+/iu, '')
    .replace(
      /\s+(?:franchise|series|genre|platform|console|company|developer|publisher|studio)$/iu,
      '',
    )
    .replace(/^(?:franchise|series|genre|platform|console|company|developer|publisher|studio)\s+/iu, '')
    .replace(/\s+feature\s+films?$/iu, '')
    .trim();

  return {
    query: query || normalizeWhitespace(subject),
    relationHint,
    sort: parseSortHint(combinedText, mediaType),
    requestedLimit,
    includeDlcExpansions,
  };
}

function normalizeReadyRequest(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Collection planning request must be an object.');
  }

  if (
    typeof value.requestText !== 'string' ||
    value.requestText.trim().length < 1 ||
    value.requestText.trim().length > 500
  ) {
    throw new Error('Collection planning requestText must contain between 1 and 500 characters.');
  }

  if (
    typeof value.subject !== 'string' ||
    value.subject.trim().length < 1 ||
    value.subject.trim().length > 300
  ) {
    throw new Error('Collection planning subject must contain between 1 and 300 characters.');
  }

  if (!Array.isArray(value.mediaTypes) || value.mediaTypes.length < 1) {
    throw new Error('Collection planning requires at least one media type.');
  }

  const mediaTypes = [...new Set(value.mediaTypes)];

  if (mediaTypes.some((mediaType) => !SUPPORTED_MEDIA_TYPES.has(mediaType))) {
    throw new Error('Collection planning contains an unsupported media type.');
  }

  return {
    requestText: normalizeWhitespace(value.requestText),
    subject: normalizeWhitespace(value.subject),
    mediaTypes,
  };
}

function createTmdbParameters(mediaType, sort, limit) {
  return {
    limit,
    sort,
    fromYear: null,
    toYear: null,
    minRuntime: null,
    excludeDocumentaries: false,
    includeAdult: false,
    language: 'en-US',
  };
}

function createIgdbParameters(sort, limit, includeDlcExpansions) {
  return {
    limit,
    sort,
    includeDlcExpansions,
  };
}

function createTmdbPlan({ mediaType, mode, query, entity, sort, limit }) {
  return {
    provider: 'tmdb',
    mediaType,
    mode,
    query,
    resolvedId: entity.id,
    resolvedName: entity.name,
    parameters: createTmdbParameters(mediaType, sort, limit),
  };
}

function createIgdbPlan({ mode, query, entity, sort, limit, includeDlcExpansions }) {
  return {
    provider: 'igdb',
    mediaType: 'game',
    mode,
    query,
    resolvedId: entity.id,
    resolvedName: entity.name,
    parameters: createIgdbParameters(sort, limit, includeDlcExpansions),
  };
}

function toPlanningMatch(plan) {
  return {
    provider: plan.provider,
    mediaType: plan.mediaType,
    mode: plan.mode,
    id: plan.resolvedId,
    name: plan.resolvedName,
  };
}

function clarificationForUnsupportedLimit({ requestedLimit, subject }) {
  return {
    status: 'clarification',
    reason: 'unsupported-limit',
    question: `You asked for ${requestedLimit} items, but RankerUltimate currently supports up to ${MAX_COLLECTION_LIMIT} items in one generated collection. Ask for ${MAX_COLLECTION_LIMIT} or fewer for now.`,
    examples: [`top ${MAX_COLLECTION_LIMIT} ${subject}`, `top 100 ${subject}`],
    matches: [],
  };
}

function clarificationForMatches({ subject, mediaType, matches }) {
  const mediaLabel = mediaType === 'movie' ? 'movie' : mediaType === 'tv' ? 'TV' : 'game';
  const examples = matches.slice(0, 4).map((match) => `${match.name} ${match.mode}`);

  return {
    status: 'clarification',
    reason: 'ambiguous-entity',
    question: `I found more than one plausible ${mediaLabel} match for “${subject}”. Please clarify what you mean in your own words.`,
    examples,
    matches,
  };
}

function clarificationForNoMatch({ subject, mediaType }) {
  if (mediaType === 'game') {
    return {
      status: 'clarification',
      reason: 'unresolved-entity',
      question: `I couldn't safely map “${subject}” to one IGDB genre, franchise, platform, or company. Please make the request more specific — for example, “${subject} franchise” or name the exact platform/company you mean.`,
      examples: [`${subject} franchise`, `${subject} genre`, `${subject} platform`],
      matches: [],
    };
  }

  const mediaLabel = mediaType === 'movie' ? 'movie' : 'TV';

  return {
    status: 'clarification',
    reason: 'unresolved-entity',
    question: `I couldn't safely map “${subject}” to a supported ${mediaLabel} genre, company, or person yet. Please make the request more specific.`,
    examples:
      mediaType === 'movie'
        ? [`${subject} genre`, `${subject} studio`, `movies starring ${subject}`]
        : [`${subject} genre`, `${subject} studio`, `TV shows starring ${subject}`],
    matches: [],
  };
}

async function findGamePlans({ igdb, subject, requestText }) {
  if (!igdb) {
    throw new Error('IGDB provider is required to plan game collections.');
  }

  const {
    query,
    relationHint,
    sort,
    requestedLimit,
    includeDlcExpansions,
  } = cleanPlanningQuery(subject, requestText, 'game');
  const limit = requestedLimit ?? DEFAULT_LIMIT;

  if (limit > MAX_COLLECTION_LIMIT) {
    return {
      plans: [],
      relatedPlatformPlans: [],
      relationHint,
      limitClarification: clarificationForUnsupportedLimit({
        requestedLimit: limit,
        subject: query,
      }),
    };
  }
  const modes = relationHint
    ? [relationHint]
    : ['genre', 'franchise', 'platform', 'company'];
  const exactPlans = [];
  const relatedPlatformPlans = [];

  for (const mode of modes) {
    const searchQueries =
      mode === 'genre'
        ? uniqueQueries([query, simpleSingular(normalizeComparable(query))])
        : [query];

    const matchesById = new Map();

    for (const searchQuery of searchQueries) {
      const matches = await findIgdbEntityMatches({
        igdb,
        mode,
        query: searchQuery,
        limit: 10,
      });

      for (const match of matches) {
        matchesById.set(match.id, match);
      }
    }

    for (const match of matchesById.values()) {
      if (
        entityNamesMatch(query, match.name, {
          allowSimplePlural: mode === 'genre',
        })
      ) {
        exactPlans.push(
          createIgdbPlan({
            mode,
            query,
            entity: match,
            sort,
            limit,
            includeDlcExpansions,
          }),
        );
        continue;
      }

      if (
        !relationHint &&
        mode === 'platform' &&
        entityNameStartsWith(query, match.name)
      ) {
        relatedPlatformPlans.push(
          createIgdbPlan({
            mode,
            query: match.name,
            entity: match,
            sort,
            limit,
            includeDlcExpansions,
          }),
        );
      }
    }
  }

  return {
    plans: dedupePlans(exactPlans),
    relatedPlatformPlans: dedupePlans(relatedPlatformPlans),
    relationHint,
    limitClarification: null,
  };
}

function clarificationForCompanyPlatformBrand({
  subject,
  companyPlan,
  platformPlans,
}) {
  const platformExamples = platformPlans
    .slice(0, 3)
    .map((plan) => `${plan.resolvedName} platform`);

  return {
    status: 'clarification',
    reason: 'ambiguous-entity',
    question: `I found “${subject}” as a game company, but it also matches a family of game platforms. Do you mean games associated with ${companyPlan.resolvedName} the company, or games from a specific platform?`,
    examples: [`${companyPlan.resolvedName} company`, ...platformExamples],
    matches: [
      toPlanningMatch(companyPlan),
      ...platformPlans.map(toPlanningMatch),
    ],
  };
}

function inferPersonMode(person, relationHint, mediaType) {
  if (relationHint === 'actor') {
    return 'actor';
  }

  if (relationHint === 'director') {
    return mediaType === 'movie' ? 'director' : null;
  }

  const department = normalizeComparable(person.known_for_department ?? '');

  if (department === 'acting') {
    return 'actor';
  }

  if (department === 'directing' && mediaType === 'movie') {
    return 'director';
  }

  return null;
}

async function findTmdbPlans({ tmdb, mediaType, subject, requestText }) {
  if (!tmdb) {
    throw new Error('TMDB provider is required to plan movie/TV collections.');
  }

  const { query, relationHint, sort, requestedLimit } = cleanPlanningQuery(
    subject,
    requestText,
    mediaType,
  );
  const limit = requestedLimit ?? DEFAULT_LIMIT;

  if (limit > MAX_COLLECTION_LIMIT) {
    return {
      plans: [],
      limitClarification: clarificationForUnsupportedLimit({
        requestedLimit: limit,
        subject: query,
      }),
    };
  }

  const plans = [];

  if (!relationHint || relationHint === 'genre') {
    const genres = mediaType === 'tv' ? await tmdb.getTvGenres() : await tmdb.getMovieGenres();

    for (const genre of genres) {
      if (entityNamesMatch(query, genre.name, { allowSimplePlural: true })) {
        plans.push(
          createTmdbPlan({
            mediaType,
            mode: 'genre',
            query,
            entity: genre,
            sort,
            limit,
          }),
        );
      }
    }
  }

  if (
    !relationHint ||
    relationHint === 'company' ||
    relationHint === 'company-features'
  ) {
    const companies = await tmdb.searchCompany(query);

    for (const company of companies) {
      if (entityNamesMatch(query, company.name)) {
        plans.push(
          createTmdbPlan({
            mediaType,
            mode: relationHint === 'company-features' ? 'company-features' : 'company',
            query,
            entity: company,
            sort,
            limit,
          }),
        );
      }
    }
  }

  if (!relationHint || relationHint === 'actor' || relationHint === 'director') {
    const people = await tmdb.searchPerson(query);

    for (const person of people) {
      if (!entityNamesMatch(query, person.name)) {
        continue;
      }

      const mode = inferPersonMode(person, relationHint, mediaType);

      if (!mode) {
        continue;
      }

      plans.push(
        createTmdbPlan({
          mediaType,
          mode,
          query,
          entity: person,
          sort,
          limit,
        }),
      );
    }
  }

  return {
    plans,
    limitClarification: null,
  };
}

function dedupePlans(plans) {
  const unique = new Map();

  for (const plan of plans) {
    const key = [
      plan.provider,
      plan.mediaType,
      plan.mode,
      plan.resolvedId,
    ].join(':');

    unique.set(key, plan);
  }

  return [...unique.values()];
}

async function planOneMediaType({ mediaType, subject, requestText, tmdb, igdb }) {
  if (mediaType === 'game') {
    const {
      plans,
      relatedPlatformPlans,
      relationHint,
      limitClarification,
    } = await findGamePlans({ igdb, subject, requestText });

    if (limitClarification) {
      return limitClarification;
    }

    if (
      plans.length === 1 &&
      plans[0].mode === 'company' &&
      relationHint === null &&
      relatedPlatformPlans.length > 0
    ) {
      return clarificationForCompanyPlatformBrand({
        subject,
        companyPlan: plans[0],
        platformPlans: relatedPlatformPlans,
      });
    }

    if (plans.length === 1) {
      return {
        status: 'planned',
        source: plans[0],
      };
    }

    if (plans.length > 1) {
      return clarificationForMatches({
        subject,
        mediaType,
        matches: plans.map(toPlanningMatch),
      });
    }

    return clarificationForNoMatch({ subject, mediaType });
  }

  const tmdbResult = await findTmdbPlans({
    tmdb,
    mediaType,
    subject,
    requestText,
  });

  if (tmdbResult.limitClarification) {
    return tmdbResult.limitClarification;
  }

  const plans = dedupePlans(tmdbResult.plans);

  if (plans.length === 1) {
    return {
      status: 'planned',
      source: plans[0],
    };
  }

  if (plans.length > 1) {
    return clarificationForMatches({
      subject,
      mediaType,
      matches: plans.map(toPlanningMatch),
    });
  }

  return clarificationForNoMatch({ subject, mediaType });
}

export async function planCollectionRequest({ request, tmdb = null, igdb = null }) {
  const normalizedRequest = normalizeReadyRequest(request);
  const plannedSources = [];

  for (const mediaType of normalizedRequest.mediaTypes) {
    const result = await planOneMediaType({
      mediaType,
      subject: normalizedRequest.subject,
      requestText: normalizedRequest.requestText,
      tmdb,
      igdb,
    });

    if (result.status !== 'planned') {
      return {
        ...result,
        context: {
          subject: normalizedRequest.subject,
          mediaTypes: normalizedRequest.mediaTypes,
        },
      };
    }

    plannedSources.push(result.source);
  }

  return {
    status: 'planned',
    requestText: normalizedRequest.requestText,
    subject: normalizedRequest.subject,
    mediaTypes: normalizedRequest.mediaTypes,
    plan: {
      kind: plannedSources.length === 1 ? 'single' : 'composite',
      originalRequest: normalizedRequest.requestText,
      sources: plannedSources,
    },
  };
}
