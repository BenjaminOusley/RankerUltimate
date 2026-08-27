import fs from 'node:fs/promises';
import path from 'node:path';

import { parseGenerationRequest } from './generation/request.mjs';

import { generateTmdbCollection } from './generation/tmdb-generator.mjs';

import { createTmdbProvider } from './providers/tmdb.mjs';

const token = process.env.TMDB_READ_ACCESS_TOKEN;

function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/gi, (_, character) => character.toUpperCase());
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

  const request = parsedRequest.request;

  const tmdb = createTmdbProvider(token);

  const result = await generateTmdbCollection({
    request,
    tmdb,
  });

  const outputDirectory = path.resolve('src', 'data', 'generated');

  const outputPath = path.join(outputDirectory, `${request.collectionId}.ts`);

  const exportName = `${toCamelCase(request.collectionId)}${request.mediaType === 'tv' ? 'TvShows' : 'Movies'}`;

  const output = `import type { RankCollection } from '../../domain/models';

export const ${exportName}: RankCollection = ${JSON.stringify(result.collection, null, 2)};
`;

  await fs.mkdir(outputDirectory, {
    recursive: true,
  });

  await fs.writeFile(outputPath, output, 'utf8');

  console.log('\n✓ Generation complete.');

  console.log(`Created: ${outputPath}`);

  console.log(`Generated: ${result.validatedCount} items`);

  return true;
}

try {
  const succeeded = await main();

  if (!succeeded) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('\nGeneration failed:');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
