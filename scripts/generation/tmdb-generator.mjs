import { createRankItem, normalizeTitle } from '../providers/tmdb.mjs';

const DISCOVER_SORTS = {
  movie: {
    'release-asc': 'primary_release_date.asc',
    'release-desc': 'primary_release_date.desc',
    popularity: 'popularity.desc',
  },
  tv: {
    'release-asc': 'first_air_date.asc',
    'release-desc': 'first_air_date.desc',
    popularity: 'popularity.desc',
  },
};

function printCompanySuggestions(companies, logger) {
  if (companies.length === 0) {
    logger.log('No companies found.');
    return;
  }

  logger.log('Possible companies:');

  for (const company of companies.slice(0, 10)) {
    logger.log(`  - ${company.name} [TMDB ${company.id}]`);
  }
}

async function resolveCompany(tmdb, name, logger) {
  logger.log(`Searching for company: ${name}...\n`);

  const companies = await tmdb.searchCompany(name);
  const requestedName = normalizeTitle(name);
  const exactMatches = companies.filter(
    (company) => normalizeTitle(company.name) === requestedName,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    logger.error('Multiple companies with that exact name were found.');
    printCompanySuggestions(exactMatches, logger);
    return null;
  }

  const aliasMatches = companies.filter((company) => {
    const candidateName = normalizeTitle(company.name);

    return requestedName.includes(candidateName) || candidateName.includes(requestedName);
  });

  if (aliasMatches.length === 1) {
    const company = aliasMatches[0];

    logger.log(`ℹ Matched "${name}" to TMDB's canonical name "${company.name}".\n`);

    return company;
  }

  logger.error('No safe company match was found.');
  printCompanySuggestions(companies, logger);

  return null;
}

function printPersonSuggestions(people, logger) {
  if (people.length === 0) {
    logger.log('No people found.');
    return;
  }

  logger.log('Possible people:');

  for (const person of people.slice(0, 10)) {
    const department = person.known_for_department ?? 'Unknown department';

    logger.log(`  - ${person.name} — ${department} [TMDB ${person.id}]`);
  }
}

async function resolvePerson(tmdb, name, expectedDepartment, logger) {
  logger.log(`Searching for person: ${name}...\n`);

  const people = await tmdb.searchPerson(name);
  const requestedName = normalizeTitle(name);
  const exactMatches = people.filter((person) => normalizeTitle(person.name) === requestedName);

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1 && expectedDepartment) {
    const departmentMatches = exactMatches.filter(
      (person) =>
        normalizeTitle(person.known_for_department ?? '') === normalizeTitle(expectedDepartment),
    );

    if (departmentMatches.length === 1) {
      return departmentMatches[0];
    }

    if (departmentMatches.length > 1) {
      logger.error(`Multiple exact matches were found in ${expectedDepartment}.`);
      printPersonSuggestions(departmentMatches, logger);
      return null;
    }
  }

  if (exactMatches.length > 1) {
    logger.error('Multiple people with that exact name were found.');
    printPersonSuggestions(exactMatches, logger);
    return null;
  }

  logger.error('No safe exact person match was found.');
  printPersonSuggestions(people, logger);

  return null;
}

async function resolveGenre(tmdb, name, mediaType, logger) {
  const genres = mediaType === 'tv' ? await tmdb.getTvGenres() : await tmdb.getMovieGenres();
  const requestedName = normalizeTitle(name);
  const matches = genres.filter((genre) => normalizeTitle(genre.name) === requestedName);

  if (matches.length === 1) {
    return matches[0];
  }

  logger.error(`No exact ${mediaType === 'tv' ? 'TV' : 'movie'} genre found for "${name}".`);
  logger.log('\nAvailable genres:');

  for (const genre of genres) {
    logger.log(`  - ${genre.name} [TMDB ${genre.id}]`);
  }

  return null;
}

function getItemDate(item, mediaType) {
  return mediaType === 'tv' ? item.first_air_date : item.release_date;
}

function getItemTitle(item, mediaType) {
  return mediaType === 'tv' ? item.name : item.title;
}

function sortPersonItems(items, sort, mediaType) {
  if (sort === 'release-asc') {
    items.sort((a, b) => getItemDate(a, mediaType).localeCompare(getItemDate(b, mediaType)));
    return;
  }

  if (sort === 'release-desc') {
    items.sort((a, b) => getItemDate(b, mediaType).localeCompare(getItemDate(a, mediaType)));
    return;
  }

  items.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

function getEffectiveCriteria(request) {
  const companyFeatures = request.mediaType === 'movie' && request.mode === 'company-features';

  return {
    minRuntime: request.mediaType === 'movie' ? request.minRuntime ?? (companyFeatures ? 75 : null) : null,
    excludeDocumentaries: request.excludeDocumentaries || companyFeatures,
  };
}

function passesCanonicalValidation(item, request, criteria, today) {
  if (!request.includeAdult && item.adult === true) {
    return false;
  }

  if (request.mediaType === 'movie' && item.video === true) {
    return false;
  }

  const releaseDate = getItemDate(item, request.mediaType);

  if (!releaseDate) {
    return false;
  }

  if (releaseDate > today) {
    return false;
  }

  if (request.fromYear !== null && releaseDate < `${request.fromYear}-01-01`) {
    return false;
  }

  if (request.toYear !== null && releaseDate > `${request.toYear}-12-31`) {
    return false;
  }

  if (
    criteria.minRuntime !== null &&
    (item.runtime === null || item.runtime === undefined || item.runtime < criteria.minRuntime)
  ) {
    return false;
  }

  if (criteria.excludeDocumentaries && item.genres?.some((genre) => genre.id === 99)) {
    return false;
  }

  return true;
}

function getFilterDescription(request, criteria) {
  const yearRange =
    request.fromYear !== null || request.toYear !== null
      ? `, years ${request.fromYear ?? 'earliest'}–${request.toYear ?? 'present'}`
      : '';

  const runtimeText =
    criteria.minRuntime !== null ? `, minimum runtime ${criteria.minRuntime} min` : '';

  const documentaryText = criteria.excludeDocumentaries ? ', documentaries excluded' : '';
  const adultText = request.includeAdult ? ', adult titles included' : ', adult titles excluded';

  return `${yearRange}${runtimeText}${documentaryText}${adultText}`;
}

function createCollection(request, resolvedEntity, items) {
  const isTv = request.mediaType === 'tv';
  const mediaLabel = isTv ? 'TV Shows' : 'Movies';
  const mediaDescription = isTv ? 'TV shows' : 'Movies';

  let name;
  let description;

  if (request.mode === 'company') {
    name = `${resolvedEntity.name} ${mediaLabel}`;
    description = `${mediaDescription} produced by ${resolvedEntity.name}.`;
  } else if (request.mode === 'company-features') {
    name = `${resolvedEntity.name} Feature Films`;
    description = `Feature films produced by ${resolvedEntity.name}.`;
  } else if (request.mode === 'director') {
    name = `${resolvedEntity.name} Movies`;
    description = `Movies directed by ${resolvedEntity.name}.`;
  } else if (request.mode === 'actor') {
    name = `${resolvedEntity.name} ${mediaLabel}`;
    description = `${mediaDescription} featuring ${resolvedEntity.name}.`;
  } else {
    name = `${resolvedEntity.name} ${mediaLabel}`;
    description = `${resolvedEntity.name} ${isTv ? 'TV shows' : 'movies'} from TMDB.`;
  }

  return {
    id: `${request.collectionId}-${isTv ? 'tv' : 'movies'}`,
    name,
    description,
    candidateSource: {
      kind: 'generated',
      provider: 'tmdb',
      originalRequest: request.query,
      definition: {
        schemaVersion: 2,
        collectionId: request.collectionId,
        mediaType: request.mediaType,
        mode: request.mode,
        query: request.query,
        tmdbId: resolvedEntity?.id ?? request.tmdbId ?? null,
        mediaTypes: [request.mediaType],
        limit: request.limit,
        fromYear: request.fromYear,
        toYear: request.toYear,
        sort: request.sort,
        minRuntime: request.minRuntime,
        excludeDocumentaries: request.excludeDocumentaries,
        includeAdult: request.includeAdult,
        language: request.language,
      },
    },
    items,
  };
}

function buildDiscoverFilters(request, criteria, today) {
  const filters = {
    include_adult: String(request.includeAdult),
    language: request.language,
    sort_by: DISCOVER_SORTS[request.mediaType][request.sort],
  };

  if (request.mediaType === 'movie') {
    filters.include_video = 'false';
  }

  const dateKey = request.mediaType === 'tv' ? 'first_air_date' : 'primary_release_date';

  if (request.fromYear !== null) {
    filters[`${dateKey}.gte`] = `${request.fromYear}-01-01`;
  }

  const requestedEndDate = request.toYear === null ? today : `${request.toYear}-12-31`;
  filters[`${dateKey}.lte`] = requestedEndDate < today ? requestedEndDate : today;

  if (criteria.minRuntime !== null) {
    filters['with_runtime.gte'] = String(criteria.minRuntime);
  }

  if (criteria.excludeDocumentaries) {
    filters.without_genres = '99';
  }

  if (request.mediaType === 'movie' && request.mode === 'company-features') {
    filters.region = 'US';
    filters.with_release_type = '3|2';
  }

  return filters;
}

function prefilterPersonCredit(item, request, today) {
  if (!request.includeAdult && item.adult === true) {
    return false;
  }

  if (request.mediaType === 'movie' && item.video === true) {
    return false;
  }

  const releaseDate = getItemDate(item, request.mediaType);

  if (!releaseDate || releaseDate > today) {
    return false;
  }

  if (request.fromYear !== null && releaseDate < `${request.fromYear}-01-01`) {
    return false;
  }

  if (request.toYear !== null && releaseDate > `${request.toYear}-12-31`) {
    return false;
  }

  return true;
}

export async function generateTmdbCollection({
  request,
  tmdb,
  today = new Date().toISOString().slice(0, 10),
  logger = console,
}) {
  const criteria = getEffectiveCriteria(request);
  const filters = buildDiscoverFilters(request, criteria, today);
  let resolvedEntity = null;

  if (request.mode === 'company' || request.mode === 'company-features') {
    let company;

    if (request.tmdbId !== null) {
      logger.log(`Loading company by TMDB ID ${request.tmdbId}...\n`);
      company = await tmdb.getCompanyById(request.tmdbId);
      logger.log(`✓ Company: ${company.name} [TMDB ${company.id}]`);
    } else {
      company = await resolveCompany(tmdb, request.query, logger);

      if (!company) {
        throw new Error('Generation cancelled.');
      }

      logger.log(`✓ Company: ${company.name} [TMDB ${company.id}]`);
    }

    resolvedEntity = company;
    filters.with_companies = String(company.id);
  }

  if (request.mode === 'director' || request.mode === 'actor') {
    const expectedDepartment = request.mode === 'director' ? 'Directing' : 'Acting';
    let person;

    if (request.tmdbId !== null) {
      logger.log(`Loading person by TMDB ID ${request.tmdbId}...\n`);
      person = await tmdb.getPersonById(request.tmdbId);
      logger.log(
        `✓ Person: ${person.name} — ${
          person.known_for_department ?? 'Unknown department'
        } [TMDB ${person.id}]`,
      );
    } else {
      person = await resolvePerson(tmdb, request.query, expectedDepartment, logger);

      if (!person) {
        throw new Error('Generation cancelled.');
      }

      logger.log(`✓ Person: ${person.name} [TMDB ${person.id}]`);
    }

    resolvedEntity = person;
  }

  if (request.mode === 'genre') {
    let genre;

    if (request.tmdbId !== null) {
      const genres =
        request.mediaType === 'tv' ? await tmdb.getTvGenres() : await tmdb.getMovieGenres();

      genre = genres.find((candidate) => candidate.id === request.tmdbId) ?? null;

      if (!genre) {
        throw new Error(`TMDB genre ${request.tmdbId} was not found.`);
      }
    } else {
      genre = await resolveGenre(tmdb, request.query, request.mediaType, logger);

      if (!genre) {
        throw new Error('Generation cancelled.');
      }
    }

    resolvedEntity = genre;
    logger.log(`✓ Genre: ${genre.name} [TMDB ${genre.id}]`);
    filters.with_genres = String(genre.id);
  }

  const filterDescription = getFilterDescription(request, criteria);
  let candidates;

  if (request.mode === 'director' || request.mode === 'actor') {
    const mediaDescription = request.mediaType === 'tv' ? 'TV' : 'movie';

    logger.log(
      `\nLoading ${resolvedEntity.name}'s ${mediaDescription} credits (${request.sort}${filterDescription})...\n`,
    );

    const credits =
      request.mediaType === 'tv'
        ? await tmdb.getPersonTvCredits(resolvedEntity.id)
        : await tmdb.getPersonMovieCredits(resolvedEntity.id);

    const candidateCredits =
      request.mode === 'director'
        ? (credits.crew ?? []).filter((credit) => credit.job === 'Director')
        : (credits.cast ?? []);

    const uniqueItems = new Map();

    for (const item of candidateCredits) {
      if (!prefilterPersonCredit(item, request, today)) {
        continue;
      }

      uniqueItems.set(item.id, item);
    }

    candidates = [...uniqueItems.values()];
    sortPersonItems(candidates, request.sort, request.mediaType);
  } else {
    const mediaDescription = request.mediaType === 'tv' ? 'TV shows' : 'movies';

    logger.log(
      `\nDiscovering released ${mediaDescription} through ${today}${filterDescription} (maximum ${request.limit}, sort ${request.sort})...\n`,
    );

    candidates =
      request.mediaType === 'tv'
        ? await tmdb.discoverTv(filters, request.limit)
        : await tmdb.discoverMovies(filters, request.limit);
  }

  const uniqueCandidates = [...new Map(candidates.map((item) => [item.id, item])).values()];
  const mediaDescription = request.mediaType === 'tv' ? 'TV shows' : 'movies';

  logger.log(`Found ${uniqueCandidates.length} candidate ${mediaDescription}.`);
  logger.log(`\nLoading canonical ${request.mediaType === 'tv' ? 'TV' : 'movie'} metadata...\n`);

  const canonicalItems = [];

  for (const candidate of uniqueCandidates) {
    const details =
      request.mediaType === 'tv'
        ? await tmdb.getTvById(candidate.id)
        : await tmdb.getMovieById(candidate.id);

    if (!passesCanonicalValidation(details, request, criteria, today)) {
      continue;
    }

    canonicalItems.push(details);

    if (canonicalItems.length >= request.limit) {
      break;
    }
  }

  if (canonicalItems.length === 0) {
    throw new Error(`No ${mediaDescription} passed validation.`);
  }

  logger.log(`\nValidated ${canonicalItems.length} ${mediaDescription}:\n`);

  for (const item of canonicalItems) {
    const date = getItemDate(item, request.mediaType);
    const year = date?.slice(0, 4) ?? 'unknown';

    logger.log(`  ${year} - ${getItemTitle(item, request.mediaType)} [TMDB ${item.id}]`);
  }

  const items = canonicalItems.map((item) => createRankItem(item, request.mediaType));
  const missingPosterCount = items.filter((item) => !item.image).length;

  if (missingPosterCount > 0) {
    logger.log(`\n⚠ ${missingPosterCount} item(s) have no poster.`);
  }

  return {
    collection: createCollection(request, resolvedEntity, items),
    resolvedEntity,
    candidateCount: uniqueCandidates.length,
    validatedCount: canonicalItems.length,
    missingPosterCount,
  };
}
