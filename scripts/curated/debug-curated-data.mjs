import process from 'node:process';

import { createTmdbProvider } from '../providers/tmdb.mjs';
import {
  createIgdbProvider,
  createIgdbRankItem,
} from '../providers/igdb.mjs';
import { createHardcoverProvider } from '../providers/hardcover.mjs';

import { parseStarWarsGuide } from './official-source-parsers.mjs';
import { STAR_WARS_GUIDE_URL } from './default-manifest-policy.mjs';

function heading(text) {
  console.log(`\n\n=== ${text} ===`);
}

const tmdbToken = process.env.TMDB_READ_ACCESS_TOKEN;
const igdbClientId = process.env.IGDB_CLIENT_ID;
const igdbClientSecret = process.env.IGDB_CLIENT_SECRET;
const hardcoverToken = process.env.HARDCOVER_API_TOKEN;

if (!tmdbToken) {
  throw new Error('TMDB_READ_ACCESS_TOKEN is missing.');
}

const tmdb = createTmdbProvider(tmdbToken);

heading('STAR WARS SOURCE ENTRY');

const starWarsHtml = await fetch(STAR_WARS_GUIDE_URL).then((response) => {
  if (!response.ok) {
    throw new Error(`StarWars.com returned ${response.status}.`);
  }

  return response.text();
});

const starWarsEntries = parseStarWarsGuide(starWarsHtml);

console.dir(
  starWarsEntries.filter((entry) =>
    String(entry.title).toLowerCase().includes('phantom menace'),
  ),
  { depth: null },
);

heading('TMDB: THE PHANTOM MENACE');

for (const query of [
  'The Phantom Menace',
  'Star Wars: The Phantom Menace',
]) {
  console.log(`\nQuery: ${query}`);

  const results = await tmdb.searchMovie(query, undefined);

  console.table(
    results.slice(0, 10).map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseDate: movie.release_date,
      popularity: movie.popularity,
      poster: movie.poster_path ?? null,
    })),
  );
}

heading('IGDB: POKEMON RED');

if (!igdbClientId || !igdbClientSecret) {
  console.log('IGDB credentials are missing.');
} else {
  const igdb = createIgdbProvider({
    clientId: igdbClientId,
    clientSecret: igdbClientSecret,
  });

  for (const query of [
    'Pokemon Red',
    'Pokémon Red',
    'Pokemon Red Version',
  ]) {
    console.log(`\nQuery: ${query}`);

    const games = await igdb.searchGames(query, 10);

    console.table(
      games.map((game) => {
        const item = createIgdbRankItem(game);

        return {
          id: game.id,
          name: game.name,
          year: item.subtitle ?? null,
          type: game.game_type?.type ?? null,
          coverId: game.cover?.image_id ?? null,
          image: item.image ?? null,
        };
      }),
    );
  }
}

heading('HARDCOVER: STEPHEN KING');

if (!hardcoverToken) {
  console.log('HARDCOVER_API_TOKEN is missing.');
} else {
  const hardcover = createHardcoverProvider({
    token: hardcoverToken,
  });

  const authors = await hardcover.searchAuthors('Stephen King', 10);

  console.table(
    authors.map((author) => ({
      id: author.id,
      canonicalId: author.canonical_id ?? null,
      name: author.name,
      booksCount: author.books_count ?? null,
    })),
  );

  const author = authors.find(
    (candidate) =>
      String(candidate.name).trim().toLowerCase() === 'stephen king',
  );

  if (!author) {
    throw new Error('Could not resolve Stephen King in Hardcover.');
  }

  const page = await hardcover.getAuthorContributionsPage({
    id: author.canonical_id ?? author.id,
    limit: 100,
    offset: 0,
  });

  console.table(
    (page.contributions ?? [])
      .filter(
        (row) =>
          row?.contributor_role?.contributor_role_category_id === 1,
      )
      .slice(0, 30)
      .map((row) => {
        const raw = row.book;
        const book = raw?.canonical ?? raw;

        return {
          id: book?.id ?? null,
          title: book?.title ?? null,
          year:
            book?.release_year ??
            book?.release_date?.slice?.(0, 4) ??
            null,
          image: book?.image?.url ?? null,
        };
      }),
  );
}

heading('LIVE STEPHEN KING GRID MARKUP AROUND CARRIE');

const kingHtml = await fetch(
  'https://stephenking.com/works/novel/grid.html',
).then((response) => {
  if (!response.ok) {
    throw new Error(`StephenKing.com returned ${response.status}.`);
  }

  return response.text();
});

const carrieIndex = kingHtml.toLowerCase().indexOf('carrie');

console.log(
  carrieIndex >= 0
    ? kingHtml.slice(
        Math.max(0, carrieIndex - 800),
        carrieIndex + 1200,
      )
    : 'Could not find Carrie in HTML.',
);
