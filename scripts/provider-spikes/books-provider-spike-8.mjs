import fs from 'node:fs/promises';
import process from 'node:process';

import { createHardcoverProvider } from '../providers/hardcover.mjs';

const AUTHORSHIP_ROLE_CATEGORY_ID = 1;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const COLLECTION_LIMIT = 50;

const AUTHORS = [
  {
    id: 204214,
    name: 'Brandon Sanderson',
  },
  {
    id: 154441,
    name: 'Stephen King',
  },
];

const token = process.env.HARDCOVER_API_TOKEN?.trim() ?? '';

if (!token) {
  throw new Error('HARDCOVER_API_TOKEN is missing from .env.');
}

const hardcover = createHardcoverProvider({
  token,
});

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeBookConcept(rowBook) {
  if (!rowBook) {
    return null;
  }

  const canonical = isObject(rowBook.canonical) ? rowBook.canonical : null;
  const book = canonical ?? rowBook;

  const id = positiveId(canonical?.id ?? rowBook.canonical_id ?? rowBook.id);

  if (id === null) {
    return null;
  }

  const title = String(book.title ?? rowBook.title ?? '').trim();

  if (!title) {
    return null;
  }

  return {
    id,
    title,
    usersReadCount: Number(book.users_read_count ?? rowBook.users_read_count ?? 0),
    ratingsCount: Number(book.ratings_count ?? rowBook.ratings_count ?? 0),
  };
}

function normalizeSeries(rawSeries) {
  if (!rawSeries) {
    return null;
  }

  const canonical = isObject(rawSeries.canonical) ? rawSeries.canonical : null;

  const series = canonical ?? rawSeries;

  const id = positiveId(series.id ?? rawSeries.canonical_id ?? rawSeries.id);

  const rawId = positiveId(rawSeries.id);

  const name = String(series.name ?? rawSeries.name ?? '').trim();

  if (id === null || !name) {
    return null;
  }

  const rawAuthor = series.author ?? rawSeries.author ?? null;

  const canonicalAuthor = isObject(rawAuthor?.canonical) ? rawAuthor.canonical : null;

  const author = canonicalAuthor ?? rawAuthor;

  return {
    id,
    rawId,
    name,
    rawName: String(rawSeries.name ?? name).trim(),
    booksCount: series.books_count ?? rawSeries.books_count ?? null,
    primaryBooksCount: series.primary_books_count ?? rawSeries.primary_books_count ?? null,
    authorId: positiveId(author?.id ?? rawAuthor?.canonical_id ?? rawAuthor?.id),
    authorName: String(author?.name ?? rawAuthor?.name ?? '').trim() || null,
  };
}

function getSeriesSize(series) {
  const primary = Number(series.primaryBooksCount ?? 0);

  if (Number.isInteger(primary) && primary > 0) {
    return primary;
  }

  const books = Number(series.booksCount ?? 0);

  return Number.isInteger(books) && books > 0 ? books : 0;
}

function ensureCandidate(map, series) {
  let candidate = map.get(series.id);

  if (!candidate) {
    candidate = {
      id: series.id,
      name: series.name,
      booksCount: series.booksCount,
      primaryBooksCount: series.primaryBooksCount,

      authorIds: new Set(),
      authorNames: new Set(),

      rawSeries: new Map(),

      direct: false,

      matchedConcepts: new Set(),
      positivePositionConcepts: new Set(),

      rootConcepts: new Set(),
      rootPositiveConcepts: new Set(),
      rootPrimaryConcepts: new Set(),
      rootFeaturedConcepts: new Set(),

      aliasRelationshipCount: 0,
      rootRelationshipCount: 0,

      books: new Map(),
    };

    map.set(series.id, candidate);
  }

  if (series.authorId !== null) {
    candidate.authorIds.add(series.authorId);
  }

  if (series.authorName) {
    candidate.authorNames.add(series.authorName);
  }

  if (series.rawId !== null) {
    candidate.rawSeries.set(series.rawId, {
      id: series.rawId,
      name: series.rawName,
    });
  }

  return candidate;
}

function addBookEvidence(candidate, book, membershipBook, relationship) {
  const position = Number(relationship.position);

  const positivePosition = Number.isInteger(position) && position >= 1;

  /*
   * This distinction is the main thing this spike is testing.
   *
   * A book row with canonical_id === null is the canonical/root Work.
   * A book row with canonical_id populated is an alias/translation/
   * alternate representation of that Work.
   */
  const rootBook = membershipBook.canonical_id == null;

  const primaryCount = Number(candidate.primaryBooksCount ?? 0);

  const primaryPosition =
    rootBook &&
    positivePosition &&
    Number.isInteger(primaryCount) &&
    primaryCount > 0 &&
    position <= primaryCount;

  candidate.matchedConcepts.add(book.id);

  if (positivePosition) {
    candidate.positivePositionConcepts.add(book.id);
  }

  if (rootBook) {
    candidate.rootRelationshipCount += 1;
    candidate.rootConcepts.add(book.id);

    if (positivePosition) {
      candidate.rootPositiveConcepts.add(book.id);
    }

    if (primaryPosition) {
      candidate.rootPrimaryConcepts.add(book.id);
    }

    if (relationship.featured === true) {
      candidate.rootFeaturedConcepts.add(book.id);
    }
  } else {
    candidate.aliasRelationshipCount += 1;
  }

  let evidence = candidate.books.get(book.id);

  if (!evidence) {
    evidence = {
      id: book.id,
      title: book.title,
      readers: book.usersReadCount,
      positions: new Set(),
      rootPositions: new Set(),
      featured: false,
      root: false,
    };

    candidate.books.set(book.id, evidence);
  }

  if (positivePosition) {
    evidence.positions.add(position);
  }

  if (rootBook && positivePosition) {
    evidence.rootPositions.add(position);
  }

  evidence.root ||= rootBook;
  evidence.featured ||= relationship.featured === true;
}

async function loadDirectSeries(author, candidates) {
  const rawIds = new Set();
  const rankableCanonicalIds = new Set();
  const pageSizes = [];

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const rows = await hardcover.getSeriesByAuthorId({
      id: author.id,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });

    const page = Array.isArray(rows) ? rows : [];

    pageSizes.push(page.length);

    for (const rawSeries of page) {
      const series = normalizeSeries(rawSeries);

      if (!series) {
        continue;
      }

      if (series.rawId !== null) {
        rawIds.add(series.rawId);
      }

      const candidate = ensureCandidate(candidates, series);

      candidate.direct = true;

      const size = getSeriesSize(series);

      /*
       * Match production's existing one-book exclusion.
       */
      if (size === 0 || size >= 2) {
        rankableCanonicalIds.add(series.id);
      }
    }

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return {
    rawCount: rawIds.size,
    canonicalRankableCount: rankableCanonicalIds.size,
    pageSizes,
  };
}

async function loadAuthoredBooks(author) {
  const authoredBooks = new Map();
  const lookupIdToConcept = new Map();

  const contributionIds = new Set();

  const pageSizes = [];

  let rawContributionCount = 0;
  let authorshipContributionCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const page = await hardcover.getAuthorContributionsPage({
      id: author.id,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    });

    const contributions = Array.isArray(page.contributions) ? page.contributions : [];

    pageSizes.push(contributions.length);
    rawContributionCount += contributions.length;

    for (const contribution of contributions) {
      const contributionId = positiveId(contribution.id);

      if (contributionId !== null && contributionIds.has(contributionId)) {
        continue;
      }

      if (contributionId !== null) {
        contributionIds.add(contributionId);
      }

      if (
        contribution?.contributor_role?.contributor_role_category_id !== AUTHORSHIP_ROLE_CATEGORY_ID
      ) {
        continue;
      }

      authorshipContributionCount += 1;

      const book = normalizeBookConcept(contribution.book);

      if (!book) {
        continue;
      }

      const existing = authoredBooks.get(book.id);

      if (
        !existing ||
        book.usersReadCount > existing.usersReadCount ||
        (book.usersReadCount === existing.usersReadCount &&
          book.ratingsCount > existing.ratingsCount)
      ) {
        authoredBooks.set(book.id, book);
      }

      /*
       * These are the exact IDs production currently passes into
       * getBookSeriesMembershipsByBookIds().
       */
      const lookupIds = [
        positiveId(contribution.book?.id),
        positiveId(contribution.book?.canonical_id),
        positiveId(book.id),
      ];

      for (const lookupId of lookupIds) {
        if (lookupId !== null) {
          lookupIdToConcept.set(lookupId, book.id);
        }
      }
    }

    if (contributions.length < PAGE_SIZE) {
      break;
    }
  }

  return {
    authoredBooks,
    lookupIdToConcept,
    pageSizes,
    rawContributionCount,
    authorshipContributionCount,
  };
}

async function loadMembershipSeries(authored, candidates) {
  const lookupIds = [...authored.lookupIdToConcept.keys()];

  const membershipBooks =
    lookupIds.length > 0 ? await hardcover.getBookSeriesMembershipsByBookIds(lookupIds) : [];

  let relationshipCount = 0;

  for (const membershipBook of membershipBooks) {
    const rowId = positiveId(membershipBook.id);

    const canonicalId = positiveId(membershipBook.canonical_id);

    const conceptId =
      (rowId !== null ? authored.lookupIdToConcept.get(rowId) : null) ??
      (canonicalId !== null ? authored.lookupIdToConcept.get(canonicalId) : null) ??
      null;

    if (conceptId === null) {
      continue;
    }

    const book = authored.authoredBooks.get(conceptId);

    if (!book) {
      continue;
    }

    const relationships = Array.isArray(membershipBook.book_series)
      ? membershipBook.book_series
      : [];

    for (const relationship of relationships) {
      const series = normalizeSeries(relationship.series);

      if (!series) {
        continue;
      }

      relationshipCount += 1;

      const candidate = ensureCandidate(candidates, series);

      addBookEvidence(candidate, book, membershipBook, relationship);
    }
  }

  return {
    membershipBookRows: membershipBooks.length,
    relationshipCount,
  };
}

function summarizeCandidate(candidate, author, fallbackEnabled) {
  const size = getSeriesSize(candidate);

  const rankable = size === 0 || size >= 2;

  const authorMatch = candidate.authorIds.has(author.id);

  const matchedBooks = candidate.matchedConcepts.size;

  const rootBooks = candidate.rootConcepts.size;

  const rootPositiveBooks = candidate.rootPositiveConcepts.size;

  const rootPrimaryBooks = candidate.rootPrimaryConcepts.size;

  const rootFeaturedBooks = candidate.rootFeaturedConcepts.size;

  /*
   * This reproduces the qualification behavior in production:
   *
   * Direct author-series rows automatically qualify.
   * Membership evidence is only used when the direct set is sparse.
   */
  const currentProduction =
    rankable && (candidate.direct || (fallbackEnabled && (authorMatch || matchedBooks >= 2)));

  return {
    id: candidate.id,
    name: candidate.name,

    authorIds: [...candidate.authorIds],

    authorNames: [...candidate.authorNames],

    authorMatch,

    booksCount: candidate.booksCount,

    primaryBooksCount: candidate.primaryBooksCount,

    size,

    direct: candidate.direct,

    rawSeries: [...candidate.rawSeries.values()],

    matchedBooks,

    positivePositionBooks: candidate.positivePositionConcepts.size,

    rootBooks,

    rootPositiveBooks,

    rootPrimaryBooks,

    rootFeaturedBooks,

    rootRelationshipCount: candidate.rootRelationshipCount,

    aliasRelationshipCount: candidate.aliasRelationshipCount,

    rules: {
      currentProduction,

      /*
       * Too broad on purpose:
       * tells us whether aliases alone are enough to reproduce
       * the noisy Stephen King behavior.
       */
      anyMembership2: rankable && matchedBooks >= 2,

      /*
       * Candidate replacement rule.
       */
      rootPositive2: rankable && rootPositiveBooks >= 2,

      /*
       * Stricter variants, in case rootPositive2 is still noisy.
       */
      rootPrimary2: rankable && rootPrimaryBooks >= 2,

      rootFeatured2: rankable && rootFeaturedBooks >= 2,
    },

    sampleBooks: [...candidate.books.values()]
      .sort((left, right) => right.readers - left.readers || left.id - right.id)
      .slice(0, 15)
      .map((book) => ({
        id: book.id,
        title: book.title,
        readers: book.readers,

        positions: [...book.positions].sort((a, b) => a - b),

        rootPositions: [...book.rootPositions].sort((a, b) => a - b),

        root: book.root,
        featured: book.featured,
      })),
  };
}

function countRules(series) {
  return {
    currentProduction: series.filter((entry) => entry.rules.currentProduction).length,

    anyMembership2: series.filter((entry) => entry.rules.anyMembership2).length,

    rootPositive2: series.filter((entry) => entry.rules.rootPositive2).length,

    rootPrimary2: series.filter((entry) => entry.rules.rootPrimary2).length,

    rootFeatured2: series.filter((entry) => entry.rules.rootFeatured2).length,
  };
}

function sortSeries(left, right) {
  return (
    right.rootPositiveBooks - left.rootPositiveBooks ||
    right.matchedBooks - left.matchedBooks ||
    right.size - left.size ||
    left.name.localeCompare(right.name)
  );
}

async function inspectAuthor(author) {
  const candidates = new Map();

  const direct = await loadDirectSeries(author, candidates);

  /*
   * Production currently only enters the membership fallback
   * when fewer than five direct series survive.
   */
  const fallbackEnabled = direct.canonicalRankableCount < Math.min(COLLECTION_LIMIT, 5);

  const authored = await loadAuthoredBooks(author);

  const memberships = await loadMembershipSeries(authored, candidates);

  const series = [...candidates.values()]
    .map((candidate) => summarizeCandidate(candidate, author, fallbackEnabled))
    .sort(sortSeries);

  return {
    author,

    direct: {
      ...direct,
      fallbackEnabled,
    },

    authoredBooks: {
      pageSizes: authored.pageSizes,

      rawContributionCount: authored.rawContributionCount,

      authorshipContributionCount: authored.authorshipContributionCount,

      conceptualBooks: authored.authoredBooks.size,

      lookupIds: authored.lookupIdToConcept.size,
    },

    memberships,

    candidateSeriesCount: series.length,

    ruleCounts: countRules(series),

    /*
     * These two deltas are what I care about most.
     */
    currentButNotRootPositive: series.filter(
      (entry) => entry.rules.currentProduction && !entry.rules.rootPositive2,
    ),

    rootPositiveButNotCurrent: series.filter(
      (entry) => entry.rules.rootPositive2 && !entry.rules.currentProduction,
    ),

    rootPositiveCandidates: series.filter((entry) => entry.rules.rootPositive2),

    allCandidates: series,
  };
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),

    purpose:
      'Diagnose Hardcover author-series qualification using the exact current provider methods.',

    ruleUnderTest:
      'Require at least two distinct authored canonical book concepts with positive integer positions on canonical/root Hardcover book rows. Direct series.author metadata is evidence, not automatic qualification.',

    authors: {},

    errors: [],
  };

  for (const author of AUTHORS) {
    console.log(`\nInspecting ${author.name}...`);

    try {
      const result = await inspectAuthor(author);

      results.authors[author.name] = result;

      console.table([
        {
          author: author.name,

          directRaw: result.direct.rawCount,

          directCanonical: result.direct.canonicalRankableCount,

          fallback: result.direct.fallbackEnabled,

          authoredBooks: result.authoredBooks.conceptualBooks,

          candidates: result.candidateSeriesCount,

          current: result.ruleCounts.currentProduction,

          anyMembership2: result.ruleCounts.anyMembership2,

          rootPositive2: result.ruleCounts.rootPositive2,

          rootPrimary2: result.ruleCounts.rootPrimary2,

          rootFeatured2: result.ruleCounts.rootFeatured2,
        },
      ]);

      console.log('\nRoot + positive-position candidates:');

      console.table(
        result.rootPositiveCandidates.slice(0, 40).map((entry) => ({
          id: entry.id,

          name: entry.name,

          direct: entry.direct,

          matched: entry.matchedBooks,

          rootPositive: entry.rootPositiveBooks,

          rootPrimary: entry.rootPrimaryBooks,

          rootFeatured: entry.rootFeaturedBooks,

          aliases: entry.aliasRelationshipCount,

          size: entry.size,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      results.errors.push({
        author: author.name,
        error: message,
      });

      console.error(`${author.name}: ${message}`);
    }
  }

  const outputPath = 'book-provider-spike-8-results.json';

  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');

  console.log(`\nWrote ${outputPath}`);

  console.log('Upload that JSON here. It contains no API token.');
}

await main();
