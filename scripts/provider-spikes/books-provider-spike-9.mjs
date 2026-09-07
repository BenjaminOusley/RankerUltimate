import fs from 'node:fs/promises';
import process from 'node:process';

import { createHardcoverProvider, normalizeHardcoverText } from '../providers/hardcover.mjs';

const INPUT_PATH = 'book-provider-spike-8-results.json';
const OUTPUT_PATH = 'book-provider-spike-9-results.json';

const token = process.env.HARDCOVER_API_TOKEN?.trim() ?? '';

if (!token) {
  throw new Error('HARDCOVER_API_TOKEN is missing from .env.');
}

const hardcover = createHardcoverProvider({
  token,
});

function positiveId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeName(value) {
  return normalizeHardcoverText(value)
    .replace(/^the\s+/u, '')
    .trim();
}

function seriesAuthorId(series) {
  const author = series?.author;

  return positiveId(author?.canonical_id ?? author?.id);
}

function normalizeRelationshipBook(rowBook, relationship) {
  if (!rowBook) {
    return null;
  }

  const canonical =
    rowBook.canonical && typeof rowBook.canonical === 'object' ? rowBook.canonical : null;

  const book = canonical ?? rowBook;

  const id = positiveId(canonical?.id ?? rowBook.canonical_id ?? rowBook.id);

  if (id === null) {
    return null;
  }

  return {
    id,

    rowBookId: positiveId(rowBook.id),

    title: String(book.title ?? rowBook.title ?? '').trim(),

    root: rowBook.canonical_id == null,

    partial: Boolean(book.is_partial_book ?? rowBook.is_partial_book ?? false),

    bookCompilation: Boolean(book.compilation ?? rowBook.compilation ?? false),

    relationCompilation: Boolean(relationship?.compilation ?? false),

    usersReadCount: Number(book.users_read_count ?? rowBook.users_read_count ?? 0),

    ratingsCount: Number(book.ratings_count ?? rowBook.ratings_count ?? 0),
  };
}

function analyzeMembership(rawSeries) {
  const series = rawSeries?.canonical ?? rawSeries;

  const primaryCount = Number(series?.primary_books_count ?? rawSeries?.primary_books_count ?? 0);

  const rows = Array.isArray(rawSeries?.book_series) ? rawSeries.book_series : [];

  const rootPositive = new Set();
  const rootPrimary = new Set();

  const rootWholePositive = new Set();

  const rootWholePrimary = new Set();

  const rootWholeFeatured = new Set();

  const rootNonPartialPositive = new Set();

  const rootNonCompilationPositive = new Set();

  const sampleByConcept = new Map();

  let positiveRelationshipRows = 0;
  let rootRelationshipRows = 0;

  let partialRelationshipRows = 0;
  let bookCompilationRows = 0;
  let relationCompilationRows = 0;

  for (const relationship of rows) {
    const position = Number(relationship?.position);

    if (!Number.isInteger(position) || position < 1) {
      continue;
    }

    positiveRelationshipRows += 1;

    const book = normalizeRelationshipBook(relationship.book, relationship);

    if (!book) {
      continue;
    }

    if (book.partial) {
      partialRelationshipRows += 1;
    }

    if (book.bookCompilation) {
      bookCompilationRows += 1;
    }

    if (book.relationCompilation) {
      relationCompilationRows += 1;
    }

    if (!book.root) {
      continue;
    }

    rootRelationshipRows += 1;

    const withinPrimaryRange =
      Number.isInteger(primaryCount) && primaryCount > 0 ? position <= primaryCount : true;

    const whole = !book.partial && !book.bookCompilation && !book.relationCompilation;

    rootPositive.add(book.id);

    if (!book.partial) {
      rootNonPartialPositive.add(book.id);
    }

    if (!book.bookCompilation && !book.relationCompilation) {
      rootNonCompilationPositive.add(book.id);
    }

    if (withinPrimaryRange) {
      rootPrimary.add(book.id);
    }

    if (whole) {
      rootWholePositive.add(book.id);

      if (withinPrimaryRange) {
        rootWholePrimary.add(book.id);
      }

      if (relationship.featured === true) {
        rootWholeFeatured.add(book.id);
      }
    }

    let sample = sampleByConcept.get(book.id);

    if (!sample) {
      sample = {
        id: book.id,
        title: book.title,
        usersReadCount: book.usersReadCount,
        ratingsCount: book.ratingsCount,
        partial: book.partial,
        bookCompilation: book.bookCompilation,
        relationCompilation: book.relationCompilation,
        positions: new Set(),
        featured: false,
      };

      sampleByConcept.set(book.id, sample);
    }

    sample.positions.add(position);
    sample.featured ||= relationship.featured === true;
  }

  return {
    primaryCount: Number.isInteger(primaryCount) && primaryCount > 0 ? primaryCount : null,

    relationshipRows: rows.length,

    positiveRelationshipRows,

    rootRelationshipRows,

    partialRelationshipRows,
    bookCompilationRows,
    relationCompilationRows,

    rootPositiveBooks: rootPositive.size,

    rootPrimaryBooks: rootPrimary.size,

    rootNonPartialPositiveBooks: rootNonPartialPositive.size,

    rootNonCompilationPositiveBooks: rootNonCompilationPositive.size,

    rootWholePositiveBooks: rootWholePositive.size,

    rootWholePrimaryBooks: rootWholePrimary.size,

    rootWholeFeaturedBooks: rootWholeFeatured.size,

    sampleBooks: [...sampleByConcept.values()]
      .sort(
        (left, right) =>
          right.usersReadCount - left.usersReadCount ||
          right.ratingsCount - left.ratingsCount ||
          left.id - right.id,
      )
      .slice(0, 30)
      .map((book) => ({
        ...book,

        positions: [...book.positions].sort((a, b) => a - b),
      })),
  };
}

function chooseSearchHit(documents, candidate, requestedAuthorId) {
  const byId = documents.find(
    (document) =>
      positiveId(document.id) === candidate.id ||
      positiveId(document.canonical_id) === candidate.id,
  );

  if (byId) {
    return byId;
  }

  const candidateName = normalizeName(candidate.name);

  const exactNames = documents.filter((document) => normalizeName(document.name) === candidateName);

  if (exactNames.length === 0) {
    return null;
  }

  return [...exactNames].sort((left, right) => {
    const leftAuthorMatch = positiveId(left?.author?.id) === requestedAuthorId;

    const rightAuthorMatch = positiveId(right?.author?.id) === requestedAuthorId;

    if (leftAuthorMatch !== rightAuthorMatch) {
      return leftAuthorMatch ? -1 : 1;
    }

    return (
      Number(right.readers_count ?? 0) - Number(left.readers_count ?? 0) ||
      Number(right.primary_books_count ?? 0) - Number(left.primary_books_count ?? 0)
    );
  })[0];
}

async function inspectCandidate(candidate, author) {
  const rawSeries = await hardcover.getSeriesById(candidate.id);

  if (!rawSeries) {
    return {
      ...candidate,
      error: `Hardcover series ${candidate.id} was not found.`,
    };
  }

  const series = rawSeries.canonical ?? rawSeries;

  const membership = analyzeMembership(rawSeries);

  const searchDocuments = await hardcover.searchSeries(candidate.name, 50);

  const searchHit = chooseSearchHit(searchDocuments, candidate, author.id);

  const authorId = seriesAuthorId(series);

  const authorMatch = authorId === author.id;

  const readersCount = searchHit ? Number(searchHit.readers_count ?? 0) : null;

  return {
    id: positiveId(series.id ?? candidate.id) ?? candidate.id,

    name: series.name ?? candidate.name,

    requestedAuthor: author,

    seriesAuthor: series.author
      ? {
          id: positiveId(series.author.canonical_id ?? series.author.id),

          name: series.author.name ?? null,
        }
      : null,

    authorMatch,

    booksCount: Number(series.books_count ?? candidate.booksCount ?? 0),

    primaryBooksCount: Number(series.primary_books_count ?? candidate.primaryBooksCount ?? 0),

    search: {
      matched: searchHit !== null,

      id: searchHit ? positiveId(searchHit.id) : null,

      name: searchHit?.name ?? null,

      author: searchHit?.author?.name ?? searchHit?.author_name ?? null,

      readersCount,

      booksCount: searchHit ? Number(searchHit.books_count ?? 0) : null,

      primaryBooksCount: searchHit ? Number(searchHit.primary_books_count ?? 0) : null,
    },

    membership,

    rules: {
      rootPositive2: membership.rootPositiveBooks >= 2,

      rootWhole2: membership.rootWholePositiveBooks >= 2,

      rootWholePrimary2: membership.rootWholePrimaryBooks >= 2,

      rootWholeFeatured2: membership.rootWholeFeaturedBooks >= 2,

      authorRootWholePrimary2: authorMatch && membership.rootWholePrimaryBooks >= 2,
    },
  };
}

function thresholdSummary(series) {
  const measurable = series.filter((entry) => Number.isFinite(entry?.search?.readersCount));

  const maximum = Math.max(0, ...measurable.map((entry) => entry.search.readersCount));

  const absoluteThresholds = [1, 2, 5, 10, 25, 50, 100];

  const relativeThresholds = [0.001, 0.0025, 0.005, 0.01, 0.02, 0.05];

  return {
    maximumReadersCount: maximum,

    absolute: Object.fromEntries(
      absoluteThresholds.map((threshold) => [
        String(threshold),

        series
          .filter(
            (entry) =>
              entry.rules.rootWholePrimary2 &&
              Number(entry?.search?.readersCount ?? -1) >= threshold,
          )
          .map((entry) => entry.name),
      ]),
    ),

    relative: Object.fromEntries(
      relativeThresholds.map((ratio) => {
        const threshold = maximum * ratio;

        return [
          String(ratio),

          {
            threshold,

            series: series
              .filter(
                (entry) =>
                  entry.rules.rootWholePrimary2 &&
                  Number(entry?.search?.readersCount ?? -1) >= threshold,
              )
              .map((entry) => entry.name),
          },
        ];
      }),
    ),
  };
}

function ruleCounts(series) {
  const names = [
    'rootPositive2',
    'rootWhole2',
    'rootWholePrimary2',
    'rootWholeFeatured2',
    'authorRootWholePrimary2',
  ];

  return Object.fromEntries(
    names.map((rule) => [rule, series.filter((entry) => entry.rules?.[rule]).length]),
  );
}

async function inspectAuthor(authorName, spike8Author) {
  const author = spike8Author.author;

  const candidates = Array.isArray(spike8Author.rootPositiveCandidates)
    ? spike8Author.rootPositiveCandidates
    : [];

  const inspected = [];

  for (const candidate of candidates) {
    console.log(`${authorName}: ${candidate.name}`);

    try {
      inspected.push(await inspectCandidate(candidate, author));
    } catch (error) {
      inspected.push({
        id: candidate.id,
        name: candidate.name,

        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successful = inspected.filter((entry) => !entry.error);

  return {
    author,

    inputCandidates: candidates.length,

    inspectedCandidates: successful.length,

    ruleCounts: ruleCounts(successful),

    readerThresholds: thresholdSummary(successful),

    candidates: successful.sort(
      (left, right) =>
        Number(right.search.readersCount ?? -1) - Number(left.search.readersCount ?? -1) ||
        right.membership.rootWholePrimaryBooks - left.membership.rootWholePrimaryBooks ||
        left.name.localeCompare(right.name),
    ),

    errors: inspected.filter((entry) => entry.error),
  };
}

async function main() {
  const spike8 = JSON.parse(await fs.readFile(INPUT_PATH, 'utf8'));

  const results = {
    generatedAt: new Date().toISOString(),

    purpose:
      'Enrich spike #8 author-series survivors with whole-book metadata and Hardcover Series-search readership.',

    hypotheses: {
      structural:
        'Real author series should have at least two canonical/root, positive-position, non-partial, non-compilation primary books.',

      popularity:
        'Hardcover Series search readers_count may distinguish established rankable series from split-volume, adaptation, and catalog-noise groupings.',
    },

    authors: {},

    errors: [],
  };

  for (const [authorName, spike8Author] of Object.entries(spike8.authors ?? {})) {
    console.log(`\nInspecting ${authorName}...`);

    try {
      const result = await inspectAuthor(authorName, spike8Author);

      results.authors[authorName] = result;

      console.table([
        {
          author: authorName,

          input: result.inputCandidates,

          rootPositive2: result.ruleCounts.rootPositive2,

          rootWhole2: result.ruleCounts.rootWhole2,

          rootWholePrimary2: result.ruleCounts.rootWholePrimary2,

          rootWholeFeatured2: result.ruleCounts.rootWholeFeatured2,

          authorRootWholePrimary2: result.ruleCounts.authorRootWholePrimary2,

          maxSeriesReaders: result.readerThresholds.maximumReadersCount,
        },
      ]);

      console.log('\nCandidate readership:');

      console.table(
        result.candidates.map((entry) => ({
          id: entry.id,

          name: entry.name,

          author: entry.seriesAuthor?.name ?? '',

          authorMatch: entry.authorMatch,

          readers: entry.search.readersCount,

          rootPositive: entry.membership.rootPositiveBooks,

          wholePrimary: entry.membership.rootWholePrimaryBooks,

          partialRows: entry.membership.partialRelationshipRows,

          bookCompilationRows: entry.membership.bookCompilationRows,

          relationCompilationRows: entry.membership.relationCompilationRows,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      results.errors.push({
        author: authorName,

        error: message,
      });

      console.error(`${authorName}: ${message}`);
    }
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf8');

  console.log(`\nWrote ${OUTPUT_PATH}`);

  console.log('Upload that JSON here. It contains no API token.');
}

await main();
