import { createRankItem, normalizeTitle } from '../providers/tmdb.mjs';

const DISCOVER_SORTS = {
  'release-asc': 'primary_release_date.asc',
  'release-desc': 'primary_release_date.desc',
  popularity: 'popularity.desc',
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

  /*
   * TMDB sometimes uses a shorter canonical
   * company name.
   *
   * Example:
   * Requested: "Pixar Animation Studios"
   * TMDB:      "Pixar"
   *
   * We allow a containment match only when
   * exactly one search result qualifies.
   */
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

async function resolveGenre(tmdb, name, logger) {
  const genres = await tmdb.getMovieGenres();

  const requestedName = normalizeTitle(name);

  const matches = genres.filter((genre) => normalizeTitle(genre.name) === requestedName);

  if (matches.length === 1) {
    return matches[0];
  }

  logger.error(`No exact movie genre found for "${name}".`);

  logger.log('\nAvailable genres:');

  for (const genre of genres) {
    logger.log(`  - ${genre.name} [TMDB ${genre.id}]`);
  }

  return null;
}

function sortPersonMovies(movies, sort) {
  if (sort === 'release-asc') {
    movies.sort((a, b) => a.release_date.localeCompare(b.release_date));

    return;
  }

  if (sort === 'release-desc') {
    movies.sort((a, b) => b.release_date.localeCompare(a.release_date));

    return;
  }

  movies.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
}

function getEffectiveCriteria(request) {
  const companyFeatures = request.mode === 'company-features';

  return {
    minRuntime: request.minRuntime ?? (companyFeatures ? 75 : null),

    excludeDocumentaries: request.excludeDocumentaries || companyFeatures,
  };
}

function passesCanonicalValidation(movie, request, criteria, today) {
  if (!request.includeAdult && movie.adult === true) {
    return false;
  }

  if (movie.video === true) {
    return false;
  }

  if (!movie.release_date) {
    return false;
  }

  if (movie.release_date > today) {
    return false;
  }

  if (request.fromYear !== null && movie.release_date < `${request.fromYear}-01-01`) {
    return false;
  }

  if (request.toYear !== null && movie.release_date > `${request.toYear}-12-31`) {
    return false;
  }

  if (
    criteria.minRuntime !== null &&
    (movie.runtime === null || movie.runtime === undefined || movie.runtime < criteria.minRuntime)
  ) {
    return false;
  }

  if (criteria.excludeDocumentaries && movie.genres?.some((genre) => genre.id === 99)) {
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

  return `${yearRange}` + `${runtimeText}` + `${documentaryText}` + `${adultText}`;
}

function createCollection(request, resolvedEntity, items) {
  let name;
  let description;

  if (request.mode === 'company') {
    name = `${resolvedEntity.name} Movies`;

    description = `Movies produced by ${resolvedEntity.name}.`;
  } else if (request.mode === 'company-features') {
    name = `${resolvedEntity.name} Feature Films`;

    description = `Feature films produced by ${resolvedEntity.name}.`;
  } else if (request.mode === 'director') {
    name = `${resolvedEntity.name} Movies`;

    description = `Movies directed by ${resolvedEntity.name}.`;
  } else if (request.mode === 'actor') {
    name = `${resolvedEntity.name} Movies`;

    description = `Movies featuring ${resolvedEntity.name}.`;
  } else {
    name = `${resolvedEntity.name} Movies`;

    description = `${resolvedEntity.name} movies from TMDB.`;
  }

  return {
    id: `${request.collectionId}-movies`,
    name,
    description,
    items,
  };
}

export async function generateTmdbCollection({
  request,
  tmdb,
  today = new Date().toISOString().slice(0, 10),
  logger = console,
}) {
  const criteria = getEffectiveCriteria(request);

  const discoverSortBy = DISCOVER_SORTS[request.sort];

  /** @type {Record<string, string>} */
  const filters = {
    include_adult: String(request.includeAdult),
    include_video: 'false',
    language: request.language,
    sort_by: discoverSortBy,
  };

  let resolvedEntity = null;

  if (request.mode === 'company' || request.mode === 'company-features') {
    const company = await resolveCompany(tmdb, request.query, logger);

    if (!company) {
      throw new Error('Generation cancelled.');
    }

    resolvedEntity = company;

    logger.log(`✓ Company: ${company.name} [TMDB ${company.id}]`);

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
    const genre = await resolveGenre(tmdb, request.query, logger);

    if (!genre) {
      throw new Error('Generation cancelled.');
    }

    resolvedEntity = genre;

    logger.log(`✓ Genre: ${genre.name} [TMDB ${genre.id}]`);

    filters.with_genres = String(genre.id);
  }

  if (request.fromYear !== null) {
    filters['primary_release_date.gte'] = `${request.fromYear}-01-01`;
  }

  const requestedEndDate = request.toYear === null ? today : `${request.toYear}-12-31`;

  filters['primary_release_date.lte'] = requestedEndDate < today ? requestedEndDate : today;

  if (criteria.minRuntime !== null) {
    filters['with_runtime.gte'] = String(criteria.minRuntime);
  }

  if (criteria.excludeDocumentaries) {
    filters.without_genres = '99';
  }

  if (request.mode === 'company-features') {
    filters.region = 'US';
    filters.with_release_type = '3|2';
  }

  const filterDescription = getFilterDescription(request, criteria);

  let movies;

  if (request.mode === 'director' || request.mode === 'actor') {
    logger.log(
      `\nLoading ${resolvedEntity.name}'s movie credits (${request.sort}${filterDescription})...\n`,
    );

    const credits = await tmdb.getPersonMovieCredits(resolvedEntity.id);

    const candidateCredits =
      request.mode === 'director'
        ? (credits.crew ?? []).filter((credit) => credit.job === 'Director')
        : (credits.cast ?? []);

    const uniqueMovies = new Map();

    for (const movie of candidateCredits) {
      if (!request.includeAdult && movie.adult === true) {
        continue;
      }

      if (movie.video === true) {
        continue;
      }

      if (!movie.release_date) {
        continue;
      }

      if (movie.release_date > today) {
        continue;
      }

      if (request.fromYear !== null && movie.release_date < `${request.fromYear}-01-01`) {
        continue;
      }

      if (request.toYear !== null && movie.release_date > `${request.toYear}-12-31`) {
        continue;
      }

      uniqueMovies.set(movie.id, movie);
    }

    movies = [...uniqueMovies.values()];

    sortPersonMovies(movies, request.sort);
  } else {
    logger.log(
      `\nDiscovering released movies through ${today}${filterDescription} (maximum ${request.limit}, sort ${request.sort})...\n`,
    );

    movies = await tmdb.discoverMovies(filters, request.limit);
  }

  const uniqueMovies = [...new Map(movies.map((movie) => [movie.id, movie])).values()];

  logger.log(`Found ${uniqueMovies.length} candidate movies.`);

  logger.log('\nLoading canonical movie metadata...\n');

  const canonicalMovies = [];

  for (const movie of uniqueMovies) {
    const details = await tmdb.getMovieById(movie.id);

    if (!passesCanonicalValidation(details, request, criteria, today)) {
      continue;
    }

    canonicalMovies.push(details);

    if (canonicalMovies.length >= request.limit) {
      break;
    }
  }

  if (canonicalMovies.length === 0) {
    throw new Error('No movies passed validation.');
  }

  logger.log(`\nValidated ${canonicalMovies.length} movies:\n`);

  for (const movie of canonicalMovies) {
    const year = movie.release_date?.slice(0, 4) ?? 'unknown';

    logger.log(`  ${year} - ${movie.title} [TMDB ${movie.id}]`);
  }

  const items = canonicalMovies.map(createRankItem);

  const missingPosterCount = items.filter((item) => !item.image).length;

  if (missingPosterCount > 0) {
    logger.log(`\n⚠ ${missingPosterCount} item(s) have no poster.`);
  }

  return {
    collection: createCollection(request, resolvedEntity, items),
    resolvedEntity,
    candidateCount: uniqueMovies.length,
    validatedCount: canonicalMovies.length,
    missingPosterCount,
  };
}
