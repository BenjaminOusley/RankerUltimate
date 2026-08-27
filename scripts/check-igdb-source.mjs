import process from 'node:process';

import { generateIgdbCollection } from './generation/igdb-generator.mjs';
import { createIgdbProvider } from './providers/igdb.mjs';
import { refreshIgdbCollectionSource } from './sources/providers/igdb-source.mjs';

const clientId = process.env.IGDB_CLIENT_ID;
const clientSecret = process.env.IGDB_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing IGDB_CLIENT_ID or IGDB_CLIENT_SECRET in .env.');
  process.exitCode = 1;
} else {
  const igdb = createIgdbProvider({
    clientId,
    clientSecret,
  });

  try {
    const genreMatches = await igdb.searchGenres('Shooter', 20);
    const shooter = genreMatches.find(
      (genre) => String(genre.name).toLowerCase() === 'shooter',
    );

    if (!shooter) {
      throw new Error('Could not resolve the IGDB Shooter genre.');
    }

    const generated = await generateIgdbCollection({
      request: {
        mode: 'genre',
        query: 'Shooter',
        collectionId: 'igdb-source-check',
        igdbId: shooter.id,
        limit: 5,
        sort: 'rating',
      },
      igdb,
      logger: {
        log() {},
      },
    });

    const refreshed = await refreshIgdbCollectionSource({
      collectionId: generated.collection.id,
      source: generated.collection.candidateSource,
      igdb,
      logger: {
        log() {},
      },
    });

    console.log(
      `IGDB source generation OK. Generated ${generated.collection.items.length} Shooter game(s).`,
    );
    console.table(
      generated.collection.items.map((item) => ({
        name: item.name,
        year: item.subtitle ?? '—',
        source: `${item.source.provider}:${item.source.type}:${item.source.id}`,
      })),
    );
    console.log(
      `IGDB source refresh OK. Refreshed ${refreshed.collection.items.length} candidate(s) using saved source definition.`,
    );
  } catch (error) {
    console.error('IGDB source check failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
