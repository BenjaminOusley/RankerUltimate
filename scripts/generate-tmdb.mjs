import fs from 'node:fs/promises';
import path from 'node:path';

import { parseGenerationRequest } from './generation/request.mjs';

import { createRankItem, createTmdbProvider, normalizeTitle } from './providers/tmdb.mjs';

const token = process.env.TMDB_READ_ACCESS_TOKEN;

function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/gi, (_, letter) => letter.toUpperCase());
}

function printCompanySuggestions(companies) {
  if (companies.length === 0) {
    console.log('No companies found.');
    return;
  }

  console.log('Possible companies:');

  for (const company of companies.slice(0, 10)) {
    console.log(`  - ${company.name} [TMDB ${company.id}]`);
  }
}

async function resolveCompany(tmdb, name) {
  console.log(`Searching for company: ${name}...\n`);

  const companies = await tmdb.searchCompany(name);
  const requestedName = normalizeTitle(name);

  const exactMatches = companies.filter(
    (company) => normalizeTitle(company.name) === requestedName,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    console.error('Multiple companies with that exact name were found.');
    printCompanySuggestions(exactMatches);
    return null;
  }

  /*
   * TMDB sometimes uses a shorter canonical company name.
   *
   * Example:
   * Requested: "Pixar Animation Studios"
   * TMDB:      "Pixar"
   *
   * We allow a containment match only when exactly one search result
   * qualifies. This keeps the automatic matching conservative.
   */
  const aliasMatches = companies.filter((company) => {
    const candidateName = normalizeTitle(company.name);

    return requestedName.includes(candidateName) || candidateName.includes(requestedName);
  });

  if (aliasMatches.length === 1) {
    const company = aliasMatches[0];

    console.log(`ℹ Matched "${name}" to TMDB's canonical name "${company.name}".\n`);

    return company;
  }

  console.error('No safe company match was found.');
  printCompanySuggestions(companies);

  return null;
}

function printPersonSuggestions(people) {
  if (people.length === 0) {
    console.log('No people found.');
    return;
  }

  console.log('Possible people:');

  for (const person of people.slice(0, 10)) {
    const department = person.known_for_department ?? 'Unknown department';

    console.log(`  - ${person.name} — ${department} [TMDB ${person.id}]`);
  }
}

async function resolvePerson(tmdb, name, expectedDepartment) {
  console.log(`Searching for person: ${name}...\n`);

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
      console.error(`Multiple exact matches were found in ${expectedDepartment}.`);

      printPersonSuggestions(departmentMatches);
      return null;
    }
  }

  if (exactMatches.length > 1) {
    console.error('Multiple people with that exact name were found.');

    printPersonSuggestions(exactMatches);
    return null;
  }

  console.error('No safe exact person match was found.');
  printPersonSuggestions(people);

  return null;
}

async function resolveGenre(tmdb, name) {
  const genres = await tmdb.getMovieGenres();

  const requestedName = normalizeTitle(name);

  const matches = genres.filter((genre) => normalizeTitle(genre.name) === requestedName);

  if (matches.length === 1) {
    return matches[0];
  }

  console.error(`No exact movie genre found for "${name}".`);

  console.log('\nAvailable genres:');

  for (const genre of genres) {
    console.log(`  - ${genre.name} [TMDB ${genre.id}]`);
  }

  return null;
}

async function main() {
  if (!token) {
    console.error('TMDB_READ_ACCESS_TOKEN is missing.');
    console.error('Add it to your .env file.');
    return false;
  }

  const parsedRequest = parseGenerationRequest(process.argv.slice(2));

  if (!parsedRequest.ok) {
    console.error(parsedRequest.error);
    return false;
  }

  const {
    mode,
    query,
    collectionId,
    limit,
    tmdbId: explicitTmdbId,
    fromYear,
    toYear,
    sort: sortOption,
    minRuntime,
    excludeDocumentaries,
    includeAdult,
    language,
  } = parsedRequest.request;

  const discoverSortBy = {
    'release-asc': 'primary_release_date.asc',
    'release-desc': 'primary_release_date.desc',
    popularity: 'popularity.desc',
  }[sortOption];

  const tmdb = createTmdbProvider(token);

  let resolvedEntity = null;

  /** @type {Record<string, string>} */
  const filters = {
    include_adult: String(includeAdult),
    include_video: 'false',
    language,
    sort_by: discoverSortBy,
  };

  if (mode === 'company' || mode === 'company-features') {
    const company = await resolveCompany(tmdb, query);

    if (!company) {
      console.error('\nGeneration cancelled.');
      return false;
    }

    resolvedEntity = company;

    console.log(`✓ Company: ${company.name} [TMDB ${company.id}]`);

    filters.with_companies = String(company.id);
  }

  if (mode === 'director' || mode === 'actor') {
    const expectedDepartment = mode === 'director' ? 'Directing' : 'Acting';

    let person;

    if (explicitTmdbId !== null) {
      console.log(`Loading person by TMDB ID ${explicitTmdbId}...\n`);

      person = await tmdb.getPersonById(explicitTmdbId);

      console.log(
        `✓ Person: ${person.name} — ${
          person.known_for_department ?? 'Unknown department'
        } [TMDB ${person.id}]`,
      );
    } else {
      person = await resolvePerson(tmdb, query, expectedDepartment);

      if (!person) {
        console.error('\nGeneration cancelled.');
        return false;
      }

      console.log(`✓ Person: ${person.name} [TMDB ${person.id}]`);
    }

    resolvedEntity = person;
  }

  if (mode === 'genre') {
    const genre = await resolveGenre(tmdb, query);

    if (!genre) {
      console.error('\nGeneration cancelled.');
      return false;
    }

    resolvedEntity = genre;

    console.log(`✓ Genre: ${genre.name} [TMDB ${genre.id}]`);

    filters.with_genres = String(genre.id);
  }

  const today = new Date().toISOString().slice(0, 10);

  if (fromYear !== null) {
    filters['primary_release_date.gte'] = `${fromYear}-01-01`;
  }

  const requestedEndDate = toYear === null ? today : `${toYear}-12-31`;

  filters['primary_release_date.lte'] = requestedEndDate < today ? requestedEndDate : today;

  if (minRuntime !== null) {
    filters['with_runtime.gte'] = String(minRuntime);
  }

  if (excludeDocumentaries) {
    filters.without_genres = '99';
  }

  if (mode === 'company-features') {
    Object.assign(filters, {
      region: 'US',
      with_release_type: '3|2',
    });

    if (minRuntime === null) {
      filters['with_runtime.gte'] = '75';
    }

    if (!excludeDocumentaries) {
      filters.without_genres = '99';
    }
  }

  let movies;

  if (mode === 'director' || mode === 'actor') {
    const yearRange =
      fromYear !== null || toYear !== null
        ? `, years ${fromYear ?? 'earliest'}–${toYear ?? 'present'}`
        : '';

    const runtimeText = minRuntime !== null ? `, minimum runtime ${minRuntime} min` : '';

    const documentaryText = excludeDocumentaries ? ', documentaries excluded' : '';

    const adultText = includeAdult ? ', adult titles included' : ', adult titles excluded';

    console.log(
      `\nLoading ${resolvedEntity.name}'s movie credits (${sortOption}${yearRange}${runtimeText}${documentaryText}${adultText})...\n`,
    );

    const credits = await tmdb.getPersonMovieCredits(resolvedEntity.id);

    let candidateCredits;

    if (mode === 'director') {
      candidateCredits = (credits.crew ?? []).filter((credit) => credit.job === 'Director');
    } else {
      candidateCredits = credits.cast ?? [];
    }

    const uniqueMovies = new Map();

    for (const movie of candidateCredits) {
      if (!includeAdult && movie.adult === true) {
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

      if (fromYear !== null && movie.release_date < `${fromYear}-01-01`) {
        continue;
      }

      if (toYear !== null && movie.release_date > `${toYear}-12-31`) {
        continue;
      }

      uniqueMovies.set(movie.id, movie);
    }

    movies = [...uniqueMovies.values()];

    if (sortOption === 'release-asc') {
      movies.sort((a, b) => a.release_date.localeCompare(b.release_date));
    } else if (sortOption === 'release-desc') {
      movies.sort((a, b) => b.release_date.localeCompare(a.release_date));
    } else if (sortOption === 'popularity') {
      movies.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }
  } else {
    const yearRange =
      fromYear !== null || toYear !== null
        ? `, years ${fromYear ?? 'earliest'}–${toYear ?? 'present'}`
        : '';

    const runtimeText = minRuntime !== null ? `, minimum runtime ${minRuntime} min` : '';

    const documentaryText = excludeDocumentaries ? ', documentaries excluded' : '';

    const adultText = includeAdult ? ', adult titles included' : ', adult titles excluded';

    console.log(
      `\nDiscovering released movies through ${today}${yearRange}${runtimeText}${documentaryText}${adultText} (maximum ${limit}, sort ${sortOption})...\n`,
    );
    movies = await tmdb.discoverMovies(filters, limit);
  }

  const uniqueMovies = [...new Map(movies.map((movie) => [movie.id, movie])).values()];

  console.log(`Found ${uniqueMovies.length} candidate movies.`);

  console.log('\nLoading canonical movie metadata...\n');

  const canonicalMovies = [];

  for (const movie of uniqueMovies) {
    const details = await tmdb.getMovieById(movie.id);

    if (
      minRuntime !== null &&
      (details.runtime === null || details.runtime === undefined || details.runtime < minRuntime)
    ) {
      continue;
    }

    if (excludeDocumentaries && details.genres?.some((genre) => genre.id === 99)) {
      continue;
    }

    canonicalMovies.push(details);

    if (canonicalMovies.length >= limit) {
      break;
    }
  }

  if (canonicalMovies.length === 0) {
    console.error('No movies passed validation.');

    return false;
  }

  console.log(`\nValidated ${canonicalMovies.length} movies:\n`);

  for (const movie of canonicalMovies) {
    const year = movie.release_date?.slice(0, 4) ?? 'unknown';

    console.log(`  ${year} - ${movie.title} [TMDB ${movie.id}]`);
  }

  const items = canonicalMovies.map(createRankItem);

  const missingPosters = items.filter((item) => !item.image);

  if (missingPosters.length > 0) {
    console.log(`\n⚠ ${missingPosters.length} item(s) have no poster.`);
  }

  const outputDirectory = path.resolve('src', 'data', 'generated');

  const outputPath = path.join(outputDirectory, `${collectionId}.ts`);

  const exportName = `${toCamelCase(collectionId)}Movies`;

  let collectionName;
  let description;

  if (mode === 'company') {
    collectionName = `${resolvedEntity.name} Movies`;

    description = `Movies produced by ${resolvedEntity.name}.`;
  } else if (mode === 'company-features') {
    collectionName = `${resolvedEntity.name} Feature Films`;

    description = `Feature films produced by ${resolvedEntity.name}.`;
  } else if (mode === 'director') {
    collectionName = `${resolvedEntity.name} Movies`;

    description = `Movies associated with director ${resolvedEntity.name}.`;
  } else if (mode === 'actor') {
    collectionName = `${resolvedEntity.name} Movies`;

    description = `Movies featuring ${resolvedEntity.name}.`;
  } else {
    collectionName = `${resolvedEntity.name} Movies`;

    description = `${resolvedEntity.name} movies from TMDB.`;
  }

  const collection = {
    id: `${collectionId}-movies`,
    name: collectionName,
    description,
    items,
  };

  const output = `import type { RankCollection } from '../../models';

export const ${exportName}: RankCollection = ${JSON.stringify(collection, null, 2)};
`;

  await fs.mkdir(outputDirectory, {
    recursive: true,
  });

  await fs.writeFile(outputPath, output, 'utf8');

  console.log('\n✓ Generation complete.');
  console.log(`Created: ${outputPath}`);
  console.log(`Generated: ${items.length} items`);

  return true;
}

try {
  const succeeded = await main();

  if (!succeeded) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('\nUnexpected generation error:');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
