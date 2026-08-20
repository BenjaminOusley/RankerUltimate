import fs from 'node:fs/promises';
import path from 'node:path';

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

const token = process.env.TMDB_READ_ACCESS_TOKEN;

if (!token) {
  console.error('TMDB_READ_ACCESS_TOKEN is missing.');
  console.error('Add it to your .env file.');
  process.exit(1);
}

const inputArgument = process.argv[2];

if (!inputArgument) {
  console.error('Missing collection name.');
  console.error('Example: npm run import:tmdb -- mcu');
  process.exit(1);
}

const collectionId = inputArgument.toLowerCase();

const inputPath = path.resolve('imports', `${collectionId}.txt`);
const outputDirectory = path.resolve('src', 'data', 'generated');
const outputPath = path.join(outputDirectory, `${collectionId}.ts`);

function normalizeTitle(title) {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getReleaseYear(movie) {
  return movie.release_date?.slice(0, 4) || undefined;
}

function createItemId(title, tmdbId) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug}-${tmdbId}`;
}

async function tmdbRequest(endpoint, searchParams = {}) {
  const url = new URL(`${TMDB_API_BASE}${endpoint}`);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB returned ${response.status} ${response.statusText} for ${endpoint}`);
  }

  return response.json();
}

async function searchMovie(title, year) {
  const data = await tmdbRequest('/search/movie', {
    query: title,
    language: 'en-US',
    include_adult: 'false',
    primary_release_year: year,
  });

  return data.results ?? [];
}

async function getMovieById(tmdbId) {
  return tmdbRequest(`/movie/${tmdbId}`, {
    language: 'en-US',
  });
}

function parseLine(line) {
  const [titlePart, yearPart, idPart] = line.split('|');

  const explicitId = idPart?.trim();

  let tmdbId;

  if (explicitId) {
    const match = explicitId.match(/^(?:tmdb:)?(\d+)$/i);

    if (!match) {
      throw new Error(
        `Invalid TMDB ID "${explicitId}" in line:\n${line}\n` + 'Use a value like tmdb:1726.',
      );
    }

    tmdbId = Number(match[1]);
  }

  return {
    title: titlePart.trim(),
    year: yearPart?.trim() || undefined,
    tmdbId,
  };
}

function findExactMatches(results, request) {
  const requestedTitle = normalizeTitle(request.title);

  return results.filter((movie) => {
    const titles = [movie.title, movie.original_title].filter(Boolean).map(normalizeTitle);

    const titleMatches = titles.includes(requestedTitle);

    if (!titleMatches) {
      return false;
    }

    if (!request.year) {
      return true;
    }

    return getReleaseYear(movie) === request.year;
  });
}

function createRankItem(movie) {
  const releaseYear = getReleaseYear(movie);

  return {
    id: createItemId(movie.title, movie.id),
    name: movie.title,
    subtitle: releaseYear,
    image: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : undefined,
    tmdbId: movie.id,
  };
}

function printSuggestions(results) {
  if (results.length === 0) {
    console.log('  No TMDB results were returned.');
    return;
  }

  console.log('  Possible matches:');

  for (const movie of results.slice(0, 5)) {
    console.log(`    - ${movie.title} (${getReleaseYear(movie) ?? 'unknown'}) [TMDB ${movie.id}]`);
  }
}

const source = await fs.readFile(inputPath, 'utf8');

const lines = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

const requests = lines.map(parseLine);

const items = [];
const failures = [];
const warnings = [];

console.log(`Validating ${requests.length} movies with TMDB...\n`);

for (const request of requests) {
  console.log(`Requested: ${request.title}${request.year ? ` (${request.year})` : ''}`);

  if (request.tmdbId) {
    try {
      const movie = await getMovieById(request.tmdbId);

      console.log(
        `  ✓ Explicit TMDB ID: ${movie.title} (${getReleaseYear(movie) ?? 'unknown'}) [TMDB ${movie.id}]`,
      );

      if (!movie.poster_path) {
        warnings.push(`${movie.title} [TMDB ${movie.id}] has no poster.`);
      }

      items.push(createRankItem(movie));
    } catch (error) {
      console.log(`  ✗ Could not load TMDB ${request.tmdbId}`);

      failures.push({
        request,
        reason: error.message,
      });
    }

    console.log();
    continue;
  }

  const results = await searchMovie(request.title, request.year);

  const exactMatches = findExactMatches(results, request);

  if (exactMatches.length === 1) {
    const movie = exactMatches[0];

    console.log(
      `  ✓ Exact match: ${movie.title} (${getReleaseYear(movie) ?? 'unknown'}) [TMDB ${movie.id}]`,
    );

    if (!movie.poster_path) {
      warnings.push(`${movie.title} [TMDB ${movie.id}] has no poster.`);
    }

    items.push(createRankItem(movie));

    console.log();
    continue;
  }

  if (exactMatches.length > 1) {
    console.log('  ✗ Multiple exact matches were found. Use an explicit TMDB ID.');

    printSuggestions(exactMatches);

    failures.push({
      request,
      reason: 'Multiple exact matches',
    });

    console.log();
    continue;
  }

  console.log('  ✗ No safe exact match found.');

  printSuggestions(results);

  failures.push({
    request,
    reason: 'No exact title/year match',
  });

  console.log();
}

console.log('----------------------------------------');
console.log(`Validated: ${items.length}/${requests.length}`);
console.log(`Warnings:  ${warnings.length}`);
console.log(`Failures:  ${failures.length}`);
console.log('----------------------------------------');

if (warnings.length > 0) {
  console.log('\nWarnings:');

  for (const warning of warnings) {
    console.log(`  ⚠ ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('\nImport cancelled. The existing generated collection was NOT changed.');

  console.error('\nFix the failed entries or specify an explicit TMDB ID:');

  console.error('Title|Year|tmdb:12345');

  process.exit(1);
}

await fs.mkdir(outputDirectory, {
  recursive: true,
});

const collectionName = collectionId === 'mcu' ? 'MCU Movies' : collectionId;

const output = `import type { RankCollection } from '../../types';

export const ${collectionId}Movies: RankCollection = ${JSON.stringify(
  {
    id: `${collectionId}-movies`,
    name: collectionName,
    description: `Rank the ${collectionName}.`,
    items,
  },
  null,
  2,
)};
`;

await fs.writeFile(outputPath, output, 'utf8');

console.log('\n✓ Import successful.');
console.log(`Created: ${outputPath}`);
