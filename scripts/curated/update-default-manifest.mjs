import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { cacheManifestImages } from '../assets/image-cache.mjs';
import { generateTmdbCollection } from '../generation/tmdb-generator.mjs';
import { createIgdbProvider, createIgdbRankItem } from '../providers/igdb.mjs';
import {
  createRankItem,
  createTmdbProvider,
  getReleaseYear,
  normalizeTitle as normalizeTmdbTitle,
} from '../providers/tmdb.mjs';
import {
  BEST_SELLING_GAMES_URL,
  CURATED_POLICY_VERSION,
  DEFAULT_COLLECTION_DEFINITIONS,
  DEFAULT_MANIFEST_SCHEMA_VERSION,
  DISNEY_PRINCESS_EXCLUDED_TITLE_PATTERNS,
  DISNEY_PRINCESS_REMAKE_QUERY_OVERRIDES,
  DISNEY_PRINCESS_URL,
  DISNEY_WALT_DISNEY_PICTURES_COMPANY_ID,
  MCU_MOVIE_POLICY,
  MCU_TV_POLICY,
  NOLAN_POLICY,
  PIXAR_POLICY,
  REPO_IGNORE_ENTRIES,
  STAR_WARS_GUIDE_URL,
  STEPHEN_KING_SOURCE_PAGES,
} from './default-manifest-policy.mjs';
import {
  currentIsoDate,
  dedupeBy,
  fetchText,
  itemIdentityKey,
  normalizeTitle,
  releasedByToday,
  slugify,
} from './curated-utils.mjs';
import {
  assertValidDefaultManifest,
  semanticManifestPayload,
} from './default-manifest-validator.mjs';
import {
  filterStephenKingBooks,
  parseBestSellingGames,
  getStarWarsTmdbSearchTitles,
  parseDisneyPrincessFilms,
  parseStarWarsGuide,
  parseStephenKingWorksPage,
} from './official-source-parsers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'src/data/curated/default-manifest.json');
const GITIGNORE_PATH = path.join(PROJECT_ROOT, '.gitignore');

const TODAY = currentIsoDate();
const IGDB_ARTWORK_REQUEST_DELAY_MS = 300;
const IGDB_ARTWORK_MAX_ATTEMPTS = 3;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readEnv(name, { optional = false } = {}) {
  const value = process.env[name]?.trim();

  if (!value && !optional) {
    throw new Error(`${name} is required to update curated defaults.`);
  }

  return value ?? null;
}

async function readExistingManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function ensureRepoIgnores() {
  let existing = '';

  try {
    existing = await fs.readFile(GITIGNORE_PATH, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const missing = REPO_IGNORE_ENTRIES.filter(
    (entry) => !existing.split(/\r?\n/).some((line) => line.trim() === entry),
  );

  if (missing.length === 0) {
    return false;
  }

  const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n');
  const block = ['# Local RankerUltimate snapshots and provider diagnostics', ...missing].join(
    '\n',
  );

  await fs.writeFile(
    GITIGNORE_PATH,
    `${existing}${needsLeadingNewline ? '\n' : ''}${existing ? '\n' : ''}${block}\n`,
    'utf8',
  );

  return true;
}

function collection(id, items) {
  const definition = DEFAULT_COLLECTION_DEFINITIONS[id];

  if (!definition) {
    throw new Error(`Unknown curated collection: ${id}`);
  }

  return {
    id,
    ...definition,
    items,
  };
}

function tmdbMovieItem(movie) {
  return createRankItem(movie, 'movie');
}

function tmdbTvItem(show) {
  return createRankItem(show, 'tv');
}

function releaseYearForTmdb(item, mediaType) {
  return Number(getReleaseYear(item, mediaType)) || null;
}

function isExactTitle(candidate, requested, mediaType) {
  const candidateTitle = mediaType === 'tv' ? candidate?.name : candidate?.title;
  return normalizeTmdbTitle(candidateTitle ?? '') === normalizeTmdbTitle(requested);
}

function scoreYear(candidate, year, mediaType) {
  if (!year) {
    return 0;
  }

  const candidateYear = releaseYearForTmdb(candidate, mediaType);
  return candidateYear === year
    ? 100
    : candidateYear
      ? Math.max(0, 20 - Math.abs(candidateYear - year))
      : 0;
}

async function resolveTmdbMovie(tmdb, title, year = null, { preferAnimation = null } = {}) {
  const results = await tmdb.searchMovie(title, year ?? undefined);
  let candidates = results.filter((item) => isExactTitle(item, title, 'movie'));

  if (candidates.length === 0 && year) {
    const fallback = await tmdb.searchMovie(title, undefined);
    candidates = fallback.filter((item) => isExactTitle(item, title, 'movie'));
  }

  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((candidate) => {
    const animation = Array.isArray(candidate.genre_ids) && candidate.genre_ids.includes(16);
    const animationScore = preferAnimation === null ? 0 : animation === preferAnimation ? 30 : -30;
    return {
      candidate,
      score:
        scoreYear(candidate, year, 'movie') +
        animationScore +
        Number(candidate.popularity ?? 0) / 100,
    };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.candidate ?? null;
}

async function resolveTmdbTv(tmdb, title, year = null) {
  const results = await tmdb.searchTv(title, year ?? undefined);
  let candidates = results.filter((item) => isExactTitle(item, title, 'tv'));

  if (candidates.length === 0 && year) {
    const fallback = await tmdb.searchTv(title, undefined);
    candidates = fallback.filter((item) => isExactTitle(item, title, 'tv'));
  }

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    return (
      scoreYear(right, year, 'tv') - scoreYear(left, year, 'tv') ||
      Number(right.popularity ?? 0) - Number(left.popularity ?? 0)
    );
  })[0];
}

function rankItemStartYear(item) {
  const match = String(item?.subtitle ?? '').match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : 9999;
}

async function buildMcuMovies(tmdb) {
  const movies = await tmdb.discoverMovies(
    {
      include_adult: 'false',
      include_video: 'false',
      language: 'en-US',
      sort_by: 'primary_release_date.asc',
      with_companies: String(MCU_MOVIE_POLICY.marvelStudiosCompanyId),
      'primary_release_date.gte': MCU_MOVIE_POLICY.firstReleaseDate,
      'primary_release_date.lte': TODAY,
      'with_runtime.gte': String(MCU_MOVIE_POLICY.minimumRuntime),
      without_genres: '99',
      region: 'US',
      with_release_type: '2|3',
    },
    250,
  );

  const filteredMovies = movies.filter((movie) => {
    const tmdbId = Number(movie?.id);
    const title = movie?.title ?? movie?.name ?? '';

    return (
      !MCU_MOVIE_POLICY.excludedTmdbIds.includes(tmdbId) &&
      !MCU_MOVIE_POLICY.blockedTitlePatterns.some((pattern) => pattern.test(title))
    );
  });

  const pinnedMovies = [];

  for (const definition of MCU_MOVIE_POLICY.pinnedTitles) {
    let movie = null;

    try {
      movie = await tmdb.getMovieById(definition.tmdbId);
    } catch {
      movie = null;
    }

    if (!movie) {
      throw new Error(
        `Could not resolve pinned MCU movie/special: ${definition.title} [TMDB ${definition.tmdbId}].`,
      );
    }

    const resolvedYear = releaseYearForTmdb(movie, 'movie');
    const resolvedTitle = normalizeTitle(movie.title ?? movie.name ?? '');
    const expectedTitle = normalizeTitle(definition.title);

    if (resolvedYear !== definition.year || !resolvedTitle.includes(expectedTitle)) {
      throw new Error(
        `Pinned MCU movie identity mismatch for ${definition.title}: resolved ${movie.title ?? movie.name ?? 'unknown title'} (${resolvedYear ?? 'unknown year'}) [TMDB ${definition.tmdbId}].`,
      );
    }

    pinnedMovies.push(movie);
  }

  const items = dedupeBy(
    [...filteredMovies, ...pinnedMovies].map(tmdbMovieItem),
    itemIdentityKey,
  ).sort(
    (left, right) =>
      Number(left.subtitle ?? 9999) - Number(right.subtitle ?? 9999) ||
      left.name.localeCompare(right.name),
  );

  if (items.length < 30) {
    throw new Error(
      `Marvel Studios movie discovery returned only ${items.length} feature films/specials after MCU filtering.`,
    );
  }

  return collection('mcu-movies', items);
}

async function buildMcuTv(tmdb) {
  const modern = await tmdb.discoverTv(
    {
      include_adult: 'false',
      language: 'en-US',
      sort_by: 'first_air_date.asc',
      with_companies: String(MCU_TV_POLICY.marvelStudiosCompanyId),
      'first_air_date.gte': MCU_TV_POLICY.modernFirstAirDate,
      'first_air_date.lte': TODAY,
      without_genres: '99',
    },
    250,
  );

  const filteredModern = modern.filter((show) => {
    const tmdbId = Number(show?.id);
    const title = show?.name ?? '';

    return (
      !MCU_TV_POLICY.excludedTmdbIds.includes(tmdbId) &&
      !MCU_TV_POLICY.excludedTitlePatterns.some((pattern) => pattern.test(title)) &&
      !MCU_TV_POLICY.blockedTitlePatterns.some((pattern) => pattern.test(title))
    );
  });

  const modernDetails = [];

  for (const show of filteredModern) {
    modernDetails.push(await tmdb.getTvById(show.id));
  }

  const legacy = [];

  for (const definition of MCU_TV_POLICY.legacyCanonTitles) {
    let show = null;

    if (Number.isInteger(definition.tmdbId)) {
      try {
        show = await tmdb.getTvById(definition.tmdbId);
      } catch {
        show = null;
      }
    }

    if (!show) {
      show = await resolveTmdbTv(tmdb, definition.title, definition.year);
    }

    if (!show) {
      throw new Error(
        `Could not resolve canonical MCU TV title: ${definition.title} (${definition.year}).`,
      );
    }

    const resolvedYear = releaseYearForTmdb(show, 'tv');

    if (resolvedYear !== definition.year) {
      throw new Error(
        `Canonical MCU TV identity mismatch for ${definition.title}: expected ${definition.year}, resolved ${show.name ?? 'unknown title'} (${resolvedYear ?? 'unknown year'}).`,
      );
    }

    legacy.push(show);
  }

  const items = dedupeBy([...legacy, ...modernDetails].map(tmdbTvItem), itemIdentityKey).sort(
    (left, right) =>
      rankItemStartYear(left) - rankItemStartYear(right) || left.name.localeCompare(right.name),
  );

  return collection('mcu-tv-shows', items);
}

function buildCombinedMcu(movies, tv) {
  const items = dedupeBy([...movies.items, ...tv.items], itemIdentityKey).sort(
    (left, right) =>
      rankItemStartYear(left) - rankItemStartYear(right) || left.name.localeCompare(right.name),
  );

  return collection('marvel-cinematic-universe', items);
}

async function buildNolan(tmdb) {
  const generated = await generateTmdbCollection({
    request: {
      mediaType: 'movie',
      mode: 'director',
      query: 'Christopher Nolan',
      collectionId: 'curated-christopher-nolan',
      limit: 250,
      tmdbId: NOLAN_POLICY.tmdbPersonId,
      fromYear: null,
      toYear: null,
      sort: 'release-asc',
      minRuntime: NOLAN_POLICY.minimumRuntime,
      excludeDocumentaries: true,
      includeAdult: false,
      language: 'en-US',
    },
    tmdb,
    today: TODAY,
  });

  return collection('christopher-nolan-movies', generated.collection.items);
}

async function buildPixar(tmdb) {
  const generated = await generateTmdbCollection({
    request: {
      mediaType: 'movie',
      mode: 'company-features',
      query: 'Pixar Animation Studios',
      collectionId: 'curated-pixar',
      limit: 250,
      tmdbId: PIXAR_POLICY.tmdbCompanyId,
      fromYear: null,
      toYear: null,
      sort: 'release-asc',
      minRuntime: null,
      excludeDocumentaries: false,
      includeAdult: false,
      language: 'en-US',
    },
    tmdb,
    today: TODAY,
  });

  return collection('pixar-feature-films', generated.collection.items);
}

function normalizeStarWarsIdentityTitle(value) {
  return normalizeTitle(String(value ?? ''))
    .replace(/^star wars\s+/u, '')
    .replace(/\bepisode\s+(?:[ivx]+|\d+)\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

async function resolveStarWarsMedia(tmdb, entry, mediaType) {
  const searchTitles = getStarWarsTmdbSearchTitles(entry.title);

  const search = mediaType === 'movie' ? tmdb.searchMovie.bind(tmdb) : tmdb.searchTv.bind(tmdb);

  const hydrate = mediaType === 'movie' ? tmdb.getMovieById.bind(tmdb) : tmdb.getTvById.bind(tmdb);

  /*
   * StarWars.com and TMDB sometimes use substantially different canonical
   * titles for the same work. The 1977 film is the important example:
   * StarWars.com calls it "Star Wars: A New Hope (Episode IV)", while TMDB
   * calls it simply "Star Wars".
   *
   * When StarWars.com supplies a release year, use that as the strongest
   * identity constraint before attempting normalized-title matching.
   */
  if (entry.year) {
    for (const searchTitle of searchTitles) {
      const results = await search(searchTitle, entry.year);

      const sameYear = results.filter(
        (candidate) => releaseYearForTmdb(candidate, mediaType) === entry.year,
      );

      if (sameYear.length === 0) {
        continue;
      }

      sameYear.sort(
        (left, right) =>
          Number(Boolean(right.poster_path)) - Number(Boolean(left.poster_path)) ||
          Number(right.popularity ?? 0) - Number(left.popularity ?? 0),
      );

      return hydrate(sameYear[0].id);
    }
  }

  /*
   * Fallback for entries where the provider's year-specific search does not
   * return anything useful.
   */
  const targetIdentity = normalizeStarWarsIdentityTitle(entry.title);

  for (const searchTitle of searchTitles) {
    const results = await search(searchTitle, undefined);

    const matches = results.filter((candidate) => {
      const candidateTitle = mediaType === 'movie' ? candidate?.title : candidate?.name;

      return normalizeStarWarsIdentityTitle(candidateTitle) === targetIdentity;
    });

    if (matches.length === 0) {
      continue;
    }

    matches.sort(
      (left, right) =>
        Number(Boolean(right.poster_path)) - Number(Boolean(left.poster_path)) ||
        Number(right.popularity ?? 0) - Number(left.popularity ?? 0),
    );

    return hydrate(matches[0].id);
  }

  return null;
}

async function resolveStarWarsEntry(tmdb, entry) {
  const preferred =
    entry.explicitType === 'movie'
      ? ['movie']
      : entry.explicitType === 'series'
        ? ['tv']
        : ['movie', 'tv'];
  const candidates = [];

  if (preferred.includes('movie')) {
    const movie = await resolveStarWarsMedia(tmdb, entry, 'movie');
    if (movie) candidates.push({ mediaType: 'movie', raw: movie });
  }

  if (preferred.includes('tv')) {
    const show = await resolveStarWarsMedia(tmdb, entry, 'tv');
    if (show) candidates.push({ mediaType: 'tv', raw: show });
  }

  if (candidates.length === 0 && preferred.length === 1) {
    const fallbackType = preferred[0] === 'movie' ? 'tv' : 'movie';
    const raw = await resolveStarWarsMedia(tmdb, entry, fallbackType);
    if (raw) candidates.push({ mediaType: fallbackType, raw });
  }

  if (candidates.length === 0) {
    throw new Error(
      `Could not resolve Star Wars title in TMDB: ${entry.title}${entry.year ? ` (${entry.year})` : ''}.`,
    );
  }

  candidates.sort((left, right) => {
    const leftYear = releaseYearForTmdb(left.raw, left.mediaType);
    const rightYear = releaseYearForTmdb(right.raw, right.mediaType);
    const leftScore =
      (entry.year && leftYear === entry.year ? 100 : 0) + Number(left.raw.popularity ?? 0);
    const rightScore =
      (entry.year && rightYear === entry.year ? 100 : 0) + Number(right.raw.popularity ?? 0);
    return rightScore - leftScore;
  });

  const winner = candidates[0];
  const dateValue =
    winner.mediaType === 'movie' ? winner.raw.release_date : winner.raw.first_air_date;

  if (!dateValue || !releasedByToday(dateValue, TODAY)) {
    return null;
  }

  const detail =
    winner.mediaType === 'movie'
      ? await tmdb.getMovieById(winner.raw.id)
      : await tmdb.getTvById(winner.raw.id);

  return winner.mediaType === 'movie' ? tmdbMovieItem(detail) : tmdbTvItem(detail);
}

async function buildStarWars(tmdb) {
  const html = await fetchText(STAR_WARS_GUIDE_URL);
  const entries = parseStarWarsGuide(html);
  const items = [];

  for (const entry of entries) {
    const item = await resolveStarWarsEntry(tmdb, entry);
    if (item) items.push(item);
  }

  return collection(
    'star-wars-movies-tv',
    dedupeBy(items, itemIdentityKey).sort(
      (left, right) =>
        rankItemStartYear(left) - rankItemStartYear(right) || left.name.localeCompare(right.name),
    ),
  );
}

function cleanDisneyBaseTitle(title) {
  return title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

const DISNEY_PRINCESS_EXTRA_MOVIES = Object.freeze([
  {
    title: 'Frozen',
    year: 2013,
  },
  {
    title: 'Frozen II',
    year: 2019,
  },
]);

function isDisneyPrincessStudioProduction(movie) {
  return (
    movie.production_companies?.some((company) =>
      /\b(?:disney|pixar)\b/i.test(String(company?.name ?? '')),
    ) ?? false
  );
}

async function resolveDisneyOriginal(tmdb, entry) {
  const title = cleanDisneyBaseTitle(entry.title);
  const candidatesById = new Map();

  const searchYears = entry.year ? [entry.year, undefined] : [undefined];

  for (const year of searchYears) {
    const results = await tmdb.searchMovie(title, year);

    for (const candidate of results) {
      if (!isExactTitle(candidate, title, 'movie')) {
        continue;
      }

      if (!candidate.release_date || !releasedByToday(candidate.release_date, TODAY)) {
        continue;
      }

      if (entry.year && releaseYearForTmdb(candidate, 'movie') !== entry.year) {
        continue;
      }

      candidatesById.set(candidate.id, candidate);
    }
  }

  const detailedCandidates = await Promise.all(
    [...candidatesById.values()].map((candidate) => tmdb.getMovieById(candidate.id)),
  );

  const eligible = detailedCandidates.filter((movie) => {
    const isAnimation = movie.genres?.some((genre) => genre.id === 16) ?? false;

    const yearMatches = !entry.year || releaseYearForTmdb(movie, 'movie') === entry.year;

    return isAnimation && isDisneyPrincessStudioProduction(movie) && yearMatches;
  });

  if (eligible.length === 0) {
    throw new Error(
      `Could not resolve official Disney Princess animated film: ${entry.title}${entry.year ? ` (${entry.year})` : ''}.`,
    );
  }

  /*
   * Do not silently guess between multiple Disney-produced animated
   * movies with the same canonical title. If the source is ever truly
   * ambiguous, fail the updater so the resolver can be improved.
   */
  if (eligible.length > 1) {
    throw new Error(
      `Ambiguous Disney Princess TMDB resolution for ${entry.title}: ${eligible
        .map(
          (movie) =>
            `${movie.title} (${releaseYearForTmdb(movie, 'movie') ?? 'unknown year'}) [TMDB ${movie.id}]`,
        )
        .join(', ')}.`,
    );
  }

  return eligible[0];
}

async function findDisneyLiveActionRemakes(tmdb, baseEntry, originalMovie) {
  const baseTitle = cleanDisneyBaseTitle(baseEntry.title);
  const query =
    DISNEY_PRINCESS_REMAKE_QUERY_OVERRIDES[baseTitle] ?? baseTitle.replace(/\s+2$/i, '');
  const results = await tmdb.searchMovie(query, undefined);
  const originalYear = releaseYearForTmdb(originalMovie, 'movie') ?? 0;
  const remakes = [];

  for (const candidate of results.slice(0, 20)) {
    const candidateTitle = candidate?.title ?? '';
    const normalizedCandidate = normalizeTitle(candidateTitle);
    const normalizedQuery = normalizeTitle(query);
    const candidateYear = releaseYearForTmdb(candidate, 'movie') ?? 0;

    if (normalizedCandidate !== normalizedQuery || candidateYear <= originalYear) {
      continue;
    }

    if (!candidate.release_date || !releasedByToday(candidate.release_date, TODAY)) {
      continue;
    }

    const detail = await tmdb.getMovieById(candidate.id);
    const isAnimation = detail.genres?.some((genre) => genre.id === 16);
    const isDisney = detail.production_companies?.some(
      (company) => company.id === DISNEY_WALT_DISNEY_PICTURES_COMPANY_ID,
    );

    if (
      !isAnimation &&
      isDisney &&
      !DISNEY_PRINCESS_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(detail.title ?? ''))
    ) {
      remakes.push(detail);
    }
  }

  return remakes;
}

async function buildDisneyPrincess(tmdb) {
  const html = await fetchText(DISNEY_PRINCESS_URL);
  const baseEntries = parseDisneyPrincessFilms(html);
  const items = [];

  for (const entry of baseEntries) {
    const original = await resolveDisneyOriginal(tmdb, entry);
    items.push(tmdbMovieItem(original));

    // Sequels that the official Disney Princess film section explicitly lists are already
    // represented by their own base entry. Remake discovery only expands the base film.
    if (/\s+\d+$/i.test(entry.title)) {
      continue;
    }

    const remakes = await findDisneyLiveActionRemakes(tmdb, entry, original);
    items.push(...remakes.map(tmdbMovieItem));
  }

  for (const entry of DISNEY_PRINCESS_EXTRA_MOVIES) {
    const movie = await resolveDisneyOriginal(tmdb, entry);

    if (movie.release_date && releasedByToday(movie.release_date, TODAY)) {
      items.push(tmdbMovieItem(movie));
    }
  }

  return collection(
    'disney-princess-movies',
    dedupeBy(items, itemIdentityKey).sort(
      (left, right) =>
        Number(left.subtitle ?? 9999) - Number(right.subtitle ?? 9999) ||
        left.name.localeCompare(right.name),
    ),
  );
}

function legacyStephenKingDisplayName(work) {
  return normalizeTitle(
    [work.title, work.context ?? work.type, work.dateText ?? work.date].filter(Boolean).join(' '),
  );
}

function findPreviousStephenKingItem(previousItems, work, usedPreviousKeys) {
  const available = previousItems.filter((item) => {
    if (item?.source?.provider !== 'stephenking.com' || item?.source?.type !== 'book') {
      return false;
    }

    return !usedPreviousKeys.has(itemIdentityKey(item));
  });

  /*
   * First choice: an already-canonical source slug.
   * This handles future updater runs after a newly discovered book has been
   * written with its proper StephenKing.com slug.
   */
  if (work.slug) {
    const sourceMatches = available.filter((item) => item.source.id === work.slug);

    if (sourceMatches.length === 1) {
      return sourceMatches[0];
    }

    if (sourceMatches.length > 1) {
      throw new Error(`Multiple previous Stephen King items use source slug ${work.slug}.`);
    }
  }

  /*
   * Second choice: a previously cleaned manifest.
   */
  const cleanTitle = normalizeTitle(work.title);

  const cleanMatches = available.filter((item) => normalizeTitle(item.name) === cleanTitle);

  if (cleanMatches.length === 1) {
    return cleanMatches[0];
  }

  if (cleanMatches.length > 1) {
    throw new Error(`Multiple previous Stephen King items have the canonical title ${work.title}.`);
  }

  /*
   * Migration path for the old parser bug.
   *
   * The old parser accidentally made names such as:
   *
   *   Carrie Novel April 5th, 1974
   *
   * from the same title/type/date fields that the fixed parser now exposes
   * separately. Reconstruct that old label exactly instead of using prefix
   * matching or title-specific exceptions.
   */
  const legacyName = legacyStephenKingDisplayName(work);

  const legacyMatches = available.filter((item) => normalizeTitle(item.name) === legacyName);

  if (legacyMatches.length === 1) {
    return legacyMatches[0];
  }

  if (legacyMatches.length > 1) {
    throw new Error(
      `Multiple previous Stephen King items matched legacy identity for ${work.title}.`,
    );
  }

  return null;
}

function buildStephenKingItem(work, previousItem = null) {
  const canonicalSlug = work.slug || slugify(work.title);

  return {
    /*
     * Preserve the existing item ID when this is an existing book so saved
     * rankings/recovery data continue to recognize it.
     *
     * New books receive the clean canonical ID.
     */
    id: previousItem?.id ?? `stephen-king-${slugify(work.title)}`,

    name: work.title,

    ...(work.year ? { subtitle: String(work.year) } : {}),

    ...(work.image ? { image: work.image } : {}),

    source: {
      provider: 'stephenking.com',

      /*
       * Existing books keep their historical source identity. This prevents
       * a parser/display cleanup from invalidating stored ratings.
       *
       * Newly discovered books use the actual StephenKing.com work slug.
       */
      id: previousItem?.source?.id ?? canonicalSlug,

      type: 'book',
    },
  };
}

async function buildStephenKing(previousManifest) {
  const works = [];
  const sourceMeta = [];

  for (const source of STEPHEN_KING_SOURCE_PAGES) {
    const html = await fetchText(source.url);

    works.push(...parseStephenKingWorksPage(html, source.category));

    sourceMeta.push({
      id: `stephen-king-${source.category}`,
      url: source.url,
    });
  }

  const books = filterStephenKingBooks(works).filter((work) => {
    if (work.releaseDate) {
      return work.releaseDate <= TODAY;
    }

    return !work.year || work.year <= Number(TODAY.slice(0, 4));
  });

  if (books.length < 40) {
    throw new Error(`Stephen King discovery returned only ${books.length} book-level works.`);
  }

  const previousItems =
    previousManifest?.collections?.find((entry) => entry.id === 'stephen-king-books')?.items ?? [];

  const usedPreviousKeys = new Set();
  let migratedPreviousCount = 0;

  const items = books.map((work) => {
    const previousItem = findPreviousStephenKingItem(previousItems, work, usedPreviousKeys);

    if (previousItem) {
      usedPreviousKeys.add(itemIdentityKey(previousItem));

      migratedPreviousCount += 1;
    }

    return buildStephenKingItem(work, previousItem);
  });

  if (previousItems.length > 0 && previousManifest?.generatedAt !== 'bootstrap') {
    console.log(
      `Preserved ${migratedPreviousCount}/${previousItems.length} previous Stephen King item identities.`,
    );
  }

  return {
    collection: collection('stephen-king-books', items),
    sources: sourceMeta,
  };
}

function representativeIgdbSearchTitle(title) {
  const firstVariant =
    String(title)
      .split(/\s*\/\s*/u)
      .map((part) => part.trim())
      .find(Boolean) ?? '';

  return firstVariant
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .trim();
}

function normalizeRepresentativeGameTitle(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/\s+version$/u, '');
}

async function getRepresentativeGameImage(igdb, salesEntry) {
  if (!igdb) {
    return null;
  }

  const query = representativeIgdbSearchTitle(salesEntry.title);
  const normalizedQuery = normalizeRepresentativeGameTitle(query);

  for (let attempt = 1; attempt <= IGDB_ARTWORK_MAX_ATTEMPTS; attempt += 1) {
    try {
      const candidates = await igdb.searchGames(query, 10);

      const rankedCandidates = candidates
        .map((candidate) => ({
          candidate,
          rankItem: createIgdbRankItem(candidate),
        }))
        .filter(({ rankItem }) => Boolean(rankItem.image))
        .sort((left, right) => {
          const leftName = normalizeRepresentativeGameTitle(left.candidate.name);
          const rightName = normalizeRepresentativeGameTitle(right.candidate.name);

          const leftScore =
            (leftName === normalizedQuery ? 100 : 0) +
            (leftName.startsWith(`${normalizedQuery} `) ? 50 : 0) +
            (salesEntry.year && Number(left.rankItem.subtitle) === Number(salesEntry.year)
              ? 20
              : 0);

          const rightScore =
            (rightName === normalizedQuery ? 100 : 0) +
            (rightName.startsWith(`${normalizedQuery} `) ? 50 : 0) +
            (salesEntry.year && Number(right.rankItem.subtitle) === Number(salesEntry.year)
              ? 20
              : 0);

          return rightScore - leftScore;
        });

      return rankedCandidates[0]?.rankItem.image ?? null;
    } catch (error) {
      const isRateLimited = /\b429\b/.test(error instanceof Error ? error.message : String(error));

      if (!isRateLimited || attempt === IGDB_ARTWORK_MAX_ATTEMPTS) {
        throw error;
      }

      await sleep(1000 * attempt);
    }
  }

  return null;
}

async function buildTopSellingGames(igdb, previousManifest) {
  const html = await fetchText(BEST_SELLING_GAMES_URL);
  const salesEntries = parseBestSellingGames(html);
  const previous = new Map(
    (previousManifest?.collections ?? [])
      .find((collectionEntry) => collectionEntry.id === 'top-50-best-selling-video-games')
      ?.items?.map((item) => [normalizeTitle(item.name), item]) ?? [],
  );
  const items = [];

  for (const entry of salesEntries) {
    const oldItem = previous.get(normalizeTitle(entry.title));
    let image = oldItem?.image ?? null;

    if (!image && igdb) {
      if (items.length > 0) {
        await sleep(IGDB_ARTWORK_REQUEST_DELAY_MS);
      }

      try {
        image = await getRepresentativeGameImage(igdb, entry);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`IGDB artwork lookup failed for ${entry.title}: ${message}`);
      }
    }

    items.push({
      id: `best-selling-${slugify(entry.title)}`,
      name: entry.title,
      subtitle: `${entry.salesMillions}M sold${entry.year ? ` • ${entry.year}` : ''}`,
      ...(image ? { image } : {}),
      source: {
        provider: 'reported-sales',
        id: slugify(entry.title),
        type: 'game',
      },
    });
  }

  return collection('top-50-best-selling-video-games', items);
}

function sourceRecord(id, url) {
  return {
    id,
    url,
    checkedAt: new Date().toISOString(),
  };
}

async function buildManifest(previousManifest) {
  const tmdbToken = readEnv('TMDB_READ_ACCESS_TOKEN');
  const igdbClientId = readEnv('IGDB_CLIENT_ID', { optional: true });
  const igdbClientSecret = readEnv('IGDB_CLIENT_SECRET', { optional: true });
  const tmdb = createTmdbProvider(tmdbToken);
  const igdb =
    igdbClientId && igdbClientSecret
      ? createIgdbProvider({ clientId: igdbClientId, clientSecret: igdbClientSecret })
      : null;

  function rankItemStartYear(item) {
    const match = String(item?.subtitle ?? '').match(/\b(\d{4})\b/);
    return match ? Number(match[1]) : 9999;
  }

  const mcuMovies = await buildMcuMovies(tmdb);
  const mcuTv = await buildMcuTv(tmdb);
  const combinedMcu = buildCombinedMcu(mcuMovies, mcuTv);
  const nolan = await buildNolan(tmdb);
  const pixar = await buildPixar(tmdb);
  const starWars = await buildStarWars(tmdb);
  const disneyPrincess = await buildDisneyPrincess(tmdb);
  const topSellingGames = await buildTopSellingGames(igdb, previousManifest);
  const stephenKing = await buildStephenKing(previousManifest);

  return {
    schemaVersion: DEFAULT_MANIFEST_SCHEMA_VERSION,
    policyVersion: CURATED_POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    sources: [
      sourceRecord('tmdb', 'https://www.themoviedb.org/'),
      sourceRecord('star-wars-guide', STAR_WARS_GUIDE_URL),
      sourceRecord('disney-princess', DISNEY_PRINCESS_URL),
      sourceRecord('best-selling-games', BEST_SELLING_GAMES_URL),
      ...stephenKing.sources.map((source) => sourceRecord(source.id, source.url)),
      ...(igdb ? [sourceRecord('igdb', 'https://www.igdb.com/')] : []),
    ],
    collections: [
      mcuMovies,
      mcuTv,
      combinedMcu,
      nolan,
      pixar,
      starWars,
      disneyPrincess,
      topSellingGames,
      stephenKing.collection,
    ],
  };
}

async function main() {
  const ignoreChanged = await ensureRepoIgnores();
  const previousManifest = await readExistingManifest();
  const generatedManifest = await buildManifest(previousManifest);
  const nextManifest = await cacheManifestImages(generatedManifest);

  assertValidDefaultManifest(nextManifest, { previousManifest });

  const previousSemantic = previousManifest ? semanticManifestPayload(previousManifest) : null;
  const nextSemantic = semanticManifestPayload(nextManifest);
  const semanticChanged = JSON.stringify(previousSemantic) !== JSON.stringify(nextSemantic);

  if (!semanticChanged) {
    console.log('Curated defaults are already current; manifest unchanged.');
    if (ignoreChanged) {
      console.log('Updated .gitignore with local snapshot/provider diagnostic patterns.');
    }
    return;
  }

  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');

  console.log('Updated curated default manifest:');
  for (const collectionEntry of nextManifest.collections) {
    console.log(`- ${collectionEntry.name}: ${collectionEntry.items.length}`);
  }

  if (ignoreChanged) {
    console.log('Updated .gitignore with local snapshot/provider diagnostic patterns.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
