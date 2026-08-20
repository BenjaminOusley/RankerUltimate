import fs from 'node:fs/promises';
import path from 'node:path';

import { createRankItem, createTmdbProvider, normalizeTitle } from './providers/tmdb.mjs';

const token = process.env.TMDB_READ_ACCESS_TOKEN;

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
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

async function main() {
  if (!token) {
    console.error('TMDB_READ_ACCESS_TOKEN is missing.');
    console.error('Add it to your .env file.');
    return false;
  }

  const mode = process.argv[2];
  const query = process.argv[3];
  const collectionId = process.argv[4];

  if (!mode || !query || !collectionId) {
    console.error('Missing arguments.');
    console.error('Example: npm run generate:tmdb -- company "Pixar Animation Studios" pixar');
    return false;
  }

  const supportedModes = ['company', 'company-features'];

  if (!supportedModes.includes(mode)) {
    console.error(`Unsupported generation mode: ${mode}`);
    console.error(`Currently supported: ${supportedModes.join(', ')}`);
    return false;
  }

  const tmdb = createTmdbProvider(token);

  const company = await resolveCompany(tmdb, query);

  if (!company) {
    console.error('\nGeneration cancelled.');
    return false;
  }

  console.log(`✓ Company: ${company.name} [TMDB ${company.id}]`);

  const today = new Date().toISOString().slice(0, 10);

  console.log(`\nDiscovering released movies through ${today}...\n`);

  const filters = {
    with_companies: String(company.id),
    'primary_release_date.lte': today,
    include_adult: 'false',
    include_video: 'false',
    language: 'en-US',
    sort_by: 'primary_release_date.asc',
  };

  if (mode === 'company-features') {
    Object.assign(filters, {
      region: 'US',

      // TMDB release types:
      // 2 = Limited theatrical
      // 3 = Theatrical
      with_release_type: '3|2',

      // Remove shorts and most specials.
      'with_runtime.gte': '75',

      // TMDB genre 99 = Documentary.
      without_genres: '99',
    });
  }

  const movies = await tmdb.discoverMovies(filters);

  const uniqueMovies = [...new Map(movies.map((movie) => [movie.id, movie])).values()];

  console.log(`Found ${uniqueMovies.length} candidate movies.`);

  console.log('\nLoading canonical movie metadata...\n');

  const canonicalMovies = [];

  for (const movie of uniqueMovies) {
    const details = await tmdb.getMovieById(movie.id);

    canonicalMovies.push(details);
  }

  if (uniqueMovies.length === 0) {
    console.error('No movies were found.');
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

  const isFeatureCollection = mode === 'company-features';

  const collection = {
    id: `${collectionId}-movies`,
    name: isFeatureCollection ? `${company.name} Feature Films` : `${company.name} Movies`,
    description: isFeatureCollection
      ? `Feature films produced by ${company.name}.`
      : `Movies produced by ${company.name}.`,
    items,
  };

  const output = `import type { RankCollection } from '../../types';

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
