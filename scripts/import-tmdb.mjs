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

function createItemId(title, tmdbId) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug}-${tmdbId}`;
}

async function searchMovie(title, year) {
  const url = new URL(`${TMDB_API_BASE}/search/movie`);

  url.searchParams.set('query', title);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('include_adult', 'false');

  if (year) {
    url.searchParams.set('primary_release_year', year);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB returned ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return data.results ?? [];
}

function parseLine(line) {
  const [titlePart, yearPart] = line.split('|');

  return {
    title: titlePart.trim(),
    year: yearPart?.trim() || undefined,
  };
}

const source = await fs.readFile(inputPath, 'utf8');

const requests = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'))
  .map(parseLine);

const items = [];

console.log(`Importing ${requests.length} movies from TMDB...\n`);

for (const request of requests) {
  process.stdout.write(`Searching: ${request.title}`);

  if (request.year) {
    process.stdout.write(` (${request.year})`);
  }

  process.stdout.write('... ');

  const results = await searchMovie(request.title, request.year);

  if (results.length === 0) {
    console.log('NOT FOUND');
    continue;
  }

  const movie = results[0];

  const releaseYear = movie.release_date?.slice(0, 4) || request.year;

  const image = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : undefined;

  items.push({
    id: createItemId(movie.title, movie.id),
    name: movie.title,
    subtitle: releaseYear,
    image,
    tmdbId: movie.id,
  });

  console.log(`FOUND: ${movie.title} (${releaseYear ?? 'unknown'})`);
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

console.log('\nImport complete.');
console.log(`Created: ${outputPath}`);
console.log(`Imported: ${items.length}/${requests.length}`);
