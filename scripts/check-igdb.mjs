import process from 'node:process';

import { createIgdbProvider, createIgdbRankItem } from './providers/igdb.mjs';

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
    const games = await igdb.searchGames('Halo', 5);
    const items = games.map(createIgdbRankItem);

    console.log(`IGDB connection OK. Returned ${items.length} Halo result(s).`);
    console.table(
      items.map((item) => ({
        name: item.name,
        year: item.subtitle ?? '—',
        source: `${item.source.provider}:${item.source.type}:${item.source.id}`,
      })),
    );
  } catch (error) {
    console.error('IGDB connection failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
