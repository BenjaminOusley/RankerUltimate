import {
  DEFAULT_BOOK_COLLECTION_LIMIT,
  DEFAULT_BOOK_TAG_CANDIDATE_LIMIT,
  MAX_BOOK_COLLECTION_LIMIT,
  MAX_BOOK_TAG_CANDIDATE_LIMIT,
} from './book-defaults.mjs';

const AUTHORSHIP_ROLE_CATEGORY_ID = 1;
const AUTHOR_PAGE_SIZE = 100;
const MAX_AUTHOR_PAGES = 10;
const TAG_PAGE_SIZE = 100;
const MIN_TAG_PAGE_SIZE = 25;
const MODES = new Set(['series', 'author', 'tag-books', 'tag-series']);
const SORTS = new Set([
  'series-order',
  'popular',
  'rating',
  'release-asc',
  'release-desc',
  'name',
]);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value, label, maximum = 300) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > maximum
  ) {
    throw new Error(`${label} must contain between 1 and ${maximum} characters.`);
  }

  return value.trim();
}

function normalizePositiveId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function normalizeReleaseYear(book) {
  const year = Number(book?.release_year);

  if (Number.isInteger(year) && year >= 1000 && year <= 9999) {
    return String(year);
  }

  const releaseDate = typeof book?.release_date === 'string' ? book.release_date : '';
  const match = releaseDate.match(/^(\d{4})-/u);

  if (!match) {
    return undefined;
  }

  const parsed = Number(match[1]);

  return parsed >= 1000 && parsed <= 9999 ? match[1] : undefined;
}

function normalizeBookConcept(rowBook, relationship = null) {
  if (!rowBook || !Number.isSafeInteger(Number(rowBook.id))) {
    return null;
  }

  const canonical = isObject(rowBook.canonical) ? rowBook.canonical : null;
  const book = canonical ?? rowBook;
  const conceptId = Number(canonical?.id ?? rowBook.canonical_id ?? rowBook.id);

  if (!Number.isSafeInteger(conceptId) || conceptId < 1) {
    return null;
  }

  const title = typeof book.title === 'string' && book.title.trim()
    ? book.title.trim()
    : typeof rowBook.title === 'string' && rowBook.title.trim()
      ? rowBook.title.trim()
      : null;

  if (!title) {
    return null;
  }

  return {
    id: conceptId,
    title,
    slug:
      typeof book.slug === 'string' && book.slug.trim()
        ? book.slug.trim()
        : typeof rowBook.slug === 'string' && rowBook.slug.trim()
          ? rowBook.slug.trim()
          : slugify(title),
    release_date: book.release_date ?? rowBook.release_date ?? null,
    release_year: book.release_year ?? rowBook.release_year ?? null,
    compilation: Boolean(
      book.compilation ?? rowBook.compilation ?? relationship?.compilation ?? false,
    ),
    is_partial_book: Boolean(
      book.is_partial_book ?? rowBook.is_partial_book ?? false,
    ),
    users_read_count: Number(
      book.users_read_count ?? rowBook.users_read_count ?? 0,
    ),
    ratings_count: Number(book.ratings_count ?? rowBook.ratings_count ?? 0),
    rating: Number(book.rating ?? rowBook.rating ?? 0),
    image: book.image?.url ?? rowBook.image?.url ?? null,
    rowBookId: Number(rowBook.id),
    canonicalized: canonical !== null || rowBook.canonical_id != null,
  };
}

function compareBookQuality(left, right) {
  const compilationDifference = Number(left.compilation) - Number(right.compilation);

  if (compilationDifference !== 0) {
    return compilationDifference;
  }

  const partialDifference = Number(left.is_partial_book) - Number(right.is_partial_book);

  if (partialDifference !== 0) {
    return partialDifference;
  }

  const readersDifference = right.users_read_count - left.users_read_count;

  if (readersDifference !== 0) {
    return readersDifference;
  }

  const ratingsDifference = right.ratings_count - left.ratings_count;

  if (ratingsDifference !== 0) {
    return ratingsDifference;
  }

  const canonicalDifference = Number(right.canonicalized) - Number(left.canonicalized);

  if (canonicalDifference !== 0) {
    return canonicalDifference;
  }

  return left.id - right.id;
}

function createBookRankItem(book) {
  const year = normalizeReleaseYear(book);
  const itemSlug = book.slug || slugify(book.title);

  return {
    id: `${itemSlug}-${book.id}`,
    name: book.title,
    ...(year ? { subtitle: year } : {}),
    ...(book.image ? { image: book.image } : {}),
    source: {
      provider: 'hardcover',
      id: String(book.id),
      type: 'book',
    },
  };
}

function createSeriesRankItem(series) {
  const id = Number(series.canonical_id ?? series.id);
  const name = requireNonEmptyString(series.name, 'Hardcover series name');
  const authorName =
    typeof series.author?.name === 'string' && series.author.name.trim()
      ? series.author.name.trim()
      : null;

  return {
    id: `${slugify(name)}-${id}`,
    name,
    ...(authorName ? { subtitle: authorName } : {}),
    ...(series.image ? { image: series.image } : {}),
    source: {
      provider: 'hardcover',
      id: String(id),
      type: 'book-series',
    },
  };
}

function normalizeSemanticTagSources(value) {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new Error('Book semantic tag sources must contain between 1 and 10 entries.');
  }

  const seen = new Set();
  const sources = [];

  for (const entry of value) {
    if (!isObject(entry)) {
      throw new Error('Book semantic tag sources must be objects.');
    }

    const id = normalizePositiveId(entry.id, 'Hardcover semantic tag ID');
    const slug = requireNonEmptyString(entry.slug, 'Hardcover semantic tag slug', 100);
    const categorySlug = requireNonEmptyString(
      entry.categorySlug,
      'Hardcover semantic tag category slug',
      100,
    );
    const weight = Number(entry.weight ?? 1);
    const qualifies = entry.qualifies !== false;

    if (!Number.isFinite(weight) || weight <= 0 || weight > 1) {
      throw new Error('Book semantic tag weight must be greater than 0 and at most 1.');
    }

    if (entry.qualifies != null && typeof entry.qualifies !== 'boolean') {
      throw new Error('Book semantic tag qualification flag must be boolean.');
    }

    const key = `${id}:${categorySlug}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    sources.push({ id, slug, categorySlug, weight, qualifies });
  }

  return sources;
}

function validateRequest(request) {
  if (!isObject(request)) {
    throw new Error('Book generation request must be an object.');
  }

  if (!MODES.has(request.mode)) {
    throw new Error(`Unsupported book generation mode: ${request.mode}`);
  }

  const query = requireNonEmptyString(request.query, 'Book generation query');
  const collectionId = requireNonEmptyString(
    request.collectionId,
    'Book collection ID',
    100,
  );

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(collectionId)) {
    throw new Error('Book collection ID must be a lowercase slug.');
  }

  const hardcoverId = normalizePositiveId(
    request.hardcoverId,
    'Hardcover resolved ID',
  );
  const resolvedName = requireNonEmptyString(
    request.resolvedName,
    'Resolved Hardcover name',
  );
  const limit = request.limit ?? DEFAULT_BOOK_COLLECTION_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BOOK_COLLECTION_LIMIT) {
    throw new Error(
      `Book collection limit must be between 1 and ${MAX_BOOK_COLLECTION_LIMIT}.`,
    );
  }

  const defaultSort =
    request.mode === 'series'
      ? 'series-order'
      : 'popular';
  const sort = request.sort ?? defaultSort;

  if (!SORTS.has(sort)) {
    throw new Error(`Unsupported book collection sort: ${sort}`);
  }

  if (request.mode === 'series' && sort !== 'series-order') {
    throw new Error('Book series generation must preserve series order.');
  }

  if ((request.mode === 'tag-books' || request.mode === 'tag-series') && sort !== 'popular') {
    throw new Error('Book tag generation currently supports popularity sort only.');
  }

  const isTagMode = request.mode === 'tag-books' || request.mode === 'tag-series';
  const tagSlug =
    isTagMode
      ? requireNonEmptyString(request.tagSlug, 'Hardcover tag slug', 100)
      : null;
  const tagCategorySlug =
    isTagMode
      ? requireNonEmptyString(
          request.tagCategorySlug,
          'Hardcover tag category slug',
          100,
        )
      : null;
  const semanticCategory =
    isTagMode && request.semanticCategory != null
      ? requireNonEmptyString(request.semanticCategory, 'Book semantic category', 100)
      : null;
  const tagSources =
    isTagMode ? normalizeSemanticTagSources(request.tagSources) : null;

  let candidateLimit = null;

  if (isTagMode) {
    const requestedCandidateLimit =
      request.candidateLimit ?? DEFAULT_BOOK_TAG_CANDIDATE_LIMIT;

    if (
      !Number.isInteger(requestedCandidateLimit) ||
      requestedCandidateLimit < 1 ||
      requestedCandidateLimit > MAX_BOOK_TAG_CANDIDATE_LIMIT
    ) {
      throw new Error(
        `Book tag candidate limit must be between 1 and ${MAX_BOOK_TAG_CANDIDATE_LIMIT}.`,
      );
    }

    candidateLimit = Math.max(requestedCandidateLimit, Math.min(limit, MAX_BOOK_TAG_CANDIDATE_LIMIT));
  }

  return {
    mediaType: 'book',
    mode: request.mode,
    query,
    collectionId,
    hardcoverId,
    resolvedName,
    limit,
    sort,
    tagSlug,
    tagCategorySlug,
    ...(semanticCategory ? { semanticCategory } : {}),
    ...(Array.isArray(tagSources) && tagSources.length > 0 ? { tagSources } : {}),
    candidateLimit,
  };
}

function selectPrimarySeriesBooks(series, limit) {
  const rows = Array.isArray(series?.book_series) ? series.book_series : [];
  const primaryCount = Number(series?.primary_books_count ?? 0);
  const targetCount = Math.min(
    limit,
    Number.isInteger(primaryCount) && primaryCount > 0 ? primaryCount : limit,
  );
  const positions = new Map();

  for (const relationship of rows) {
    const position = Number(relationship?.position);

    if (!Number.isInteger(position) || position < 1 || !relationship?.book) {
      continue;
    }

    const book = normalizeBookConcept(relationship.book, relationship);

    if (!book) {
      continue;
    }

    const candidates = positions.get(position) ?? [];
    candidates.push(book);
    positions.set(position, candidates);
  }

  const selected = [];
  const seenConcepts = new Set();

  for (const [position, rawCandidates] of [...positions.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    const candidatesByConcept = new Map();

    for (const candidate of rawCandidates) {
      const existing = candidatesByConcept.get(candidate.id);

      if (!existing || compareBookQuality(candidate, existing) < 0) {
        candidatesByConcept.set(candidate.id, candidate);
      }
    }

    const candidates = [...candidatesByConcept.values()].sort(compareBookQuality);
    const chosen = candidates.find((candidate) => !seenConcepts.has(candidate.id));

    if (!chosen) {
      continue;
    }

    seenConcepts.add(chosen.id);
    selected.push({
      ...chosen,
      seriesPosition: position,
    });

    if (selected.length >= targetCount) {
      break;
    }
  }

  return selected;
}

function sortAuthorBooks(books, sort) {
  const copy = [...books];

  if (sort === 'name') {
    return copy.sort((left, right) => left.title.localeCompare(right.title));
  }

  if (sort === 'release-asc' || sort === 'release-desc') {
    const direction = sort === 'release-asc' ? 1 : -1;

    return copy.sort((left, right) => {
      const leftDate = left.release_date ?? '';
      const rightDate = right.release_date ?? '';

      if (!leftDate && !rightDate) return 0;
      if (!leftDate) return 1;
      if (!rightDate) return -1;

      return leftDate.localeCompare(rightDate) * direction;
    });
  }

  if (sort === 'rating') {
    return copy.sort(
      (left, right) =>
        right.rating - left.rating ||
        right.ratings_count - left.ratings_count ||
        right.users_read_count - left.users_read_count,
    );
  }

  return copy.sort(
    (left, right) =>
      right.users_read_count - left.users_read_count ||
      right.ratings_count - left.ratings_count ||
      right.rating - left.rating,
  );
}

async function loadAuthorBooks(hardcover, request) {
  const booksByConcept = new Map();
  let author = null;
  let rawContributionCount = 0;

  for (let pageIndex = 0; pageIndex < MAX_AUTHOR_PAGES; pageIndex += 1) {
    const offset = pageIndex * AUTHOR_PAGE_SIZE;
    const page = await hardcover.getAuthorContributionsPage({
      id: request.hardcoverId,
      limit: AUTHOR_PAGE_SIZE,
      offset,
    });

    author = page.author ?? author;
    const contributions = Array.isArray(page.contributions) ? page.contributions : [];
    rawContributionCount += contributions.length;

    for (const contribution of contributions) {
      if (
        contribution?.contributor_role?.contributor_role_category_id !==
        AUTHORSHIP_ROLE_CATEGORY_ID
      ) {
        continue;
      }

      const book = normalizeBookConcept(contribution.book);

      if (!book) {
        continue;
      }

      const existing = booksByConcept.get(book.id);

      if (!existing || compareBookQuality(book, existing) < 0) {
        booksByConcept.set(book.id, book);
      }
    }

    const hasEnoughPopularCandidates =
      request.sort === 'popular' && booksByConcept.size >= request.limit;

    if (hasEnoughPopularCandidates || contributions.length < AUTHOR_PAGE_SIZE) {
      break;
    }
  }

  if (!author) {
    throw new Error(`Hardcover author ${request.hardcoverId} was not found.`);
  }

  const books = sortAuthorBooks([...booksByConcept.values()], request.sort).slice(
    0,
    request.limit,
  );

  return {
    author: author.canonical ?? author,
    books,
    candidateCount: booksByConcept.size,
    rawContributionCount,
  };
}

function getSeriesSize(series) {
  const primaryCount = Number(series?.primary_books_count ?? 0);

  if (Number.isInteger(primaryCount) && primaryCount > 0) {
    return primaryCount;
  }

  const booksCount = Number(series?.books_count ?? 0);

  return Number.isInteger(booksCount) && booksCount > 0 ? booksCount : 0;
}

function isRankableSeriesCandidate(series) {
  const size = getSeriesSize(series);

  // Unknown size metadata should not make an otherwise valid series disappear,
  // but an explicit one-book grouping is not useful for a series-ranking request.
  if (size !== 0 && size < 2) {
    return false;
  }

  // Semantic support tags can help rank a genuinely qualifying series, but they
  // should never make a series qualify by themselves. This prevents broad helper
  // signals such as Literary Fiction from turning unrelated popular series into
  // Drama results.
  if (
    Number.isInteger(series.qualifyingMatchedBooks) &&
    series.qualifyingMatchedBooks < 1
  ) {
    return false;
  }

  // A large grouping represented by only one matching book is usually a loose
  // umbrella, adaptation bucket, or one-off catalog grouping rather than a strong
  // result for a broad genre/subject request. Small duologies/trilogies remain
  // eligible because sparse provider coverage is more plausible there.
  if (size >= 4 && Number(series.matchedBooks ?? 0) < 2) {
    return false;
  }

  return true;
}

function normalizedSeriesIdentity(series) {
  const name = slugify(series?.name ?? '').replace(/^the-/u, '');
  const author = slugify(series?.author?.name ?? '');

  return `${name}:${author}`;
}

function sameKnownSeriesAuthor(left, right) {
  const leftId = Number(left?.author?.id ?? 0);
  const rightId = Number(right?.author?.id ?? 0);

  if (leftId > 0 && rightId > 0) {
    return leftId === rightId;
  }

  const leftName = slugify(left?.author?.name ?? '');
  const rightName = slugify(right?.author?.name ?? '');

  return !leftName || !rightName || leftName === rightName;
}

function getMembershipOverlap(left, right) {
  const leftMembers = left?.memberConceptIds;
  const rightMembers = right?.memberConceptIds;

  if (!(leftMembers instanceof Set) || !(rightMembers instanceof Set)) {
    return null;
  }

  if (leftMembers.size === 0 || rightMembers.size === 0) {
    return null;
  }

  const smaller = leftMembers.size <= rightMembers.size ? leftMembers : rightMembers;
  const larger = smaller === leftMembers ? rightMembers : leftMembers;
  let intersection = 0;

  for (const conceptId of smaller) {
    if (larger.has(conceptId)) {
      intersection += 1;
    }
  }

  if (intersection < 2) {
    return null;
  }

  return {
    intersection,
    containment: intersection / Math.min(leftMembers.size, rightMembers.size),
  };
}

function getDirectionalMembershipContainment(child, broader) {
  const childFeatured = child?.featuredMemberConceptIds;
  const broaderMembers = broader?.memberConceptIds;

  if (!(childFeatured instanceof Set) || !(broaderMembers instanceof Set)) {
    return null;
  }

  if (childFeatured.size === 0 || broaderMembers.size === 0) {
    return null;
  }

  let intersection = 0;

  for (const conceptId of childFeatured) {
    if (broaderMembers.has(conceptId)) {
      intersection += 1;
    }
  }

  if (intersection === 0) {
    return null;
  }

  return {
    intersection,
    sampleSize: childFeatured.size,
    containment: intersection / childFeatured.size,
  };
}

function chooseBroaderOverlappingSeries(left, right) {
  if (!sameKnownSeriesAuthor(left, right)) {
    return null;
  }

  const leftSize = getSeriesSize(left);
  const rightSize = getSeriesSize(right);

  if (leftSize > 0 && rightSize > 0 && leftSize !== rightSize) {
    const broader = leftSize > rightSize ? left : right;
    const child = broader === left ? right : left;
    const broaderSize = Math.max(leftSize, rightSize);
    const childSize = Math.min(leftSize, rightSize);

    if (broaderSize >= childSize * 1.5) {
      const directional = getDirectionalMembershipContainment(child, broader);

      if (directional) {
        if (directional.sampleSize >= 2 && directional.containment >= 0.75) {
          return broader;
        }

        // With only one sampled child book, require a much stronger size gap.
        // This catches obvious umbrella relationships such as Middle-earth vs.
        // The Lord of the Rings without treating any single shared book as proof.
        if (
          directional.sampleSize === 1 &&
          directional.containment === 1 &&
          broaderSize >= childSize * 3
        ) {
          return broader;
        }
      }
    }
  }

  const overlap = getMembershipOverlap(left, right);

  if (!overlap || overlap.containment < 0.75) {
    return null;
  }

  if (leftSize > 0 && rightSize > 0 && leftSize !== rightSize) {
    const largerSize = Math.max(leftSize, rightSize);
    const smallerSize = Math.min(leftSize, rightSize);

    if (largerSize >= smallerSize * 1.5) {
      return leftSize > rightSize ? left : right;
    }
  }

  const leftSampleSize = left.memberConceptIds?.size ?? 0;
  const rightSampleSize = right.memberConceptIds?.size ?? 0;

  if (leftSampleSize !== rightSampleSize) {
    const largerSample = Math.max(leftSampleSize, rightSampleSize);
    const smallerSample = Math.min(leftSampleSize, rightSampleSize);

    if (smallerSample > 0 && largerSample >= smallerSample * 1.5) {
      return leftSampleSize > rightSampleSize ? left : right;
    }
  }

  return null;
}

function refineRankedSeries(series) {
  const deduped = [];
  const seenIdentities = new Set();

  for (const entry of series) {
    if (!isRankableSeriesCandidate(entry)) {
      continue;
    }

    const identity = normalizedSeriesIdentity(entry);

    if (identity !== ':' && seenIdentities.has(identity)) {
      continue;
    }

    if (identity !== ':') {
      seenIdentities.add(identity);
    }

    deduped.push(entry);
  }

  const suppressedIds = new Set();

  for (let leftIndex = 0; leftIndex < deduped.length; leftIndex += 1) {
    const left = deduped[leftIndex];

    for (let rightIndex = leftIndex + 1; rightIndex < deduped.length; rightIndex += 1) {
      const right = deduped[rightIndex];
      const broader = chooseBroaderOverlappingSeries(left, right);

      if (broader) {
        suppressedIds.add(broader.id);
      }
    }
  }

  return deduped.filter((entry) => !suppressedIds.has(entry.id));
}

function aggregateTagBooks(rows) {
  const booksByConcept = new Map();

  for (const row of rows) {
    const book = normalizeBookConcept(row?.book);

    if (!book) {
      continue;
    }

    const categoryCounts = Array.isArray(row?.book?.taggable_counts)
      ? row.book.taggable_counts.map((entry) => Number(entry?.count ?? 0))
      : [];
    const strongestCategoryVotes = Math.max(0, ...categoryCounts);
    const targetVotes = Number(row?.count ?? 0);
    const strength =
      strongestCategoryVotes > 0 ? targetVotes / strongestCategoryVotes : 0;
    const semanticWeight = Number(row?.semanticWeight ?? 1);
    const boundedSemanticWeight = Number.isFinite(semanticWeight)
      ? Math.min(1, Math.max(0, semanticWeight))
      : 1;
    const evidence = Math.min(
      1,
      Math.max(0, strength * strength * boundedSemanticWeight),
    );
    const qualifyingEvidence = row?.semanticQualifies === false ? 0 : evidence;
    let aggregate = booksByConcept.get(book.id);

    if (!aggregate) {
      aggregate = {
        book,
        evidence: 0,
        qualifyingEvidence: 0,
        targetVotes: 0,
      };
      booksByConcept.set(book.id, aggregate);
    } else if (compareBookQuality(book, aggregate.book) < 0) {
      aggregate.book = book;
    }

    aggregate.evidence = 1 - (1 - aggregate.evidence) * (1 - evidence);
    aggregate.qualifyingEvidence =
      1 - (1 - aggregate.qualifyingEvidence) * (1 - qualifyingEvidence);
    aggregate.targetVotes += targetVotes;
  }

  return [...booksByConcept.values()]
    .filter((entry) => entry.qualifyingEvidence > 0)
    .map((entry) => ({
      ...entry.book,
      weightedReaders: entry.book.users_read_count * entry.evidence,
      targetVotes: entry.targetVotes,
    }))
    .sort(
      (left, right) =>
        right.weightedReaders - left.weightedReaders ||
        right.users_read_count - left.users_read_count ||
        right.ratings_count - left.ratings_count ||
        right.targetVotes - left.targetVotes ||
        left.id - right.id,
    );
}

function aggregateTagSeries(rows) {
  const booksByConcept = new Map();

  for (const row of rows) {
    const book = row?.book;
    const series = book?.featured_book_series?.series;

    if (!book || !series) {
      continue;
    }

    const bookConceptId = Number(book.canonical_id ?? book.id);
    const seriesId = Number(series.canonical_id ?? series.id);

    if (
      !Number.isSafeInteger(bookConceptId) ||
      bookConceptId < 1 ||
      !Number.isSafeInteger(seriesId) ||
      seriesId < 1
    ) {
      continue;
    }

    const targetVotes = Number(row.count ?? 0);
    const membershipSeriesIds = new Set([seriesId]);

    for (const relationship of Array.isArray(book.book_series) ? book.book_series : []) {
      const membershipSeries = relationship?.series;
      const membershipId = Number(
        membershipSeries?.canonical_id ?? membershipSeries?.id ?? 0,
      );

      if (Number.isSafeInteger(membershipId) && membershipId > 0) {
        membershipSeriesIds.add(membershipId);
      }
    }

    const categoryCounts = Array.isArray(book.taggable_counts)
      ? book.taggable_counts.map((entry) => Number(entry?.count ?? 0))
      : [];
    const strongestCategoryVotes = Math.max(0, ...categoryCounts);
    const strength =
      strongestCategoryVotes > 0 ? targetVotes / strongestCategoryVotes : 0;
    const semanticWeight = Number(row.semanticWeight ?? 1);
    const boundedSemanticWeight = Number.isFinite(semanticWeight)
      ? Math.min(1, Math.max(0, semanticWeight))
      : 1;
    const evidence = Math.min(
      1,
      Math.max(0, strength * strength * boundedSemanticWeight),
    );
    const qualifyingEvidence = row.semanticQualifies === false ? 0 : evidence;
    const readers = Number(book.users_read_count ?? 0);

    let concept = booksByConcept.get(bookConceptId);

    if (!concept) {
      concept = {
        id: bookConceptId,
        readers,
        evidence: 0,
        qualifyingEvidence: 0,
        targetVotes: 0,
        series: {
          id: seriesId,
          canonical_id: series.canonical_id ?? null,
          name: series.name,
          slug: series.slug,
          books_count: series.books_count,
          primary_books_count: series.primary_books_count,
          is_completed: series.is_completed,
          author: series.author ?? null,
        },
        image: book.image?.url ?? null,
        strongestEvidence: -1,
        membershipSeriesIds,
      };
      booksByConcept.set(bookConceptId, concept);
    }

    // Multiple semantic signals for the same conceptual book should reinforce
    // each other without allowing duplicate tags to multiply readership.
    concept.evidence = 1 - (1 - concept.evidence) * (1 - evidence);
    concept.qualifyingEvidence =
      1 - (1 - concept.qualifyingEvidence) * (1 - qualifyingEvidence);
    concept.targetVotes += targetVotes;
    concept.readers = Math.max(concept.readers, readers);

    for (const membershipId of membershipSeriesIds) {
      concept.membershipSeriesIds.add(membershipId);
    }

    if (evidence > concept.strongestEvidence) {
      concept.strongestEvidence = evidence;
      concept.series = {
        id: seriesId,
        canonical_id: series.canonical_id ?? null,
        name: series.name,
        slug: series.slug,
        books_count: series.books_count,
        primary_books_count: series.primary_books_count,
        is_completed: series.is_completed,
        author: series.author ?? null,
      };

      if (book.image?.url) {
        concept.image = book.image.url;
      }
    }
  }

  const seriesById = new Map();

  for (const concept of booksByConcept.values()) {
    const weightedReaders = concept.readers * concept.evidence;
    const seriesId = concept.series.id;
    let aggregate = seriesById.get(seriesId);

    if (!aggregate) {
      aggregate = {
        ...concept.series,
        matchedBooks: 0,
        qualifyingMatchedBooks: 0,
        peakReaders: 0,
        peakWeightedReaders: 0,
        totalWeightedReaders: 0,
        totalTargetVotes: 0,
        image: null,
        representativeWeight: -1,
        memberConceptIds: new Set(),
        featuredMemberConceptIds: new Set(),
      };
      seriesById.set(seriesId, aggregate);
    }

    aggregate.matchedBooks += 1;

    if (concept.qualifyingEvidence > 0) {
      aggregate.qualifyingMatchedBooks += 1;
    }

    aggregate.featuredMemberConceptIds.add(concept.id);
    aggregate.peakReaders = Math.max(aggregate.peakReaders, concept.readers);
    aggregate.peakWeightedReaders = Math.max(
      aggregate.peakWeightedReaders,
      weightedReaders,
    );
    aggregate.totalWeightedReaders += weightedReaders;
    aggregate.totalTargetVotes += concept.targetVotes;

    if (weightedReaders > aggregate.representativeWeight && concept.image) {
      aggregate.image = concept.image;
      aggregate.representativeWeight = weightedReaders;
    }
  }

  for (const concept of booksByConcept.values()) {
    for (const membershipId of concept.membershipSeriesIds) {
      seriesById.get(membershipId)?.memberConceptIds.add(concept.id);
    }
  }

  const ranked = [...seriesById.values()].sort(
    (left, right) =>
      right.peakWeightedReaders - left.peakWeightedReaders ||
      right.totalWeightedReaders - left.totalWeightedReaders ||
      right.peakReaders - left.peakReaders ||
      right.totalTargetVotes - left.totalTargetVotes,
  );

  return refineRankedSeries(ranked);
}

function nextTagCandidateLimit(current) {
  if (current < 300) {
    return Math.min(300, MAX_BOOK_TAG_CANDIDATE_LIMIT);
  }

  if (current < MAX_BOOK_TAG_CANDIDATE_LIMIT) {
    return MAX_BOOK_TAG_CANDIDATE_LIMIT;
  }

  return null;
}

function isHardcoverTimeout(error) {
  return (
    error?.status === 408 ||
    (error instanceof Error && error.message.startsWith('Hardcover HTTP 408:'))
  );
}

async function loadSingleTagBooks(hardcover, request) {
  let candidateLimit = Math.max(
    request.candidateLimit,
    Math.min(request.limit * 2, MAX_BOOK_TAG_CANDIDATE_LIMIT),
  );
  let pageSize = Math.min(TAG_PAGE_SIZE, candidateLimit);
  let offset = 0;
  let exhausted = false;
  const rows = [];
  let rankedBooks = [];

  while (candidateLimit !== null) {
    while (offset < candidateLimit && !exhausted) {
      const requestedPageSize = Math.min(pageSize, candidateLimit - offset);
      let pageRows;

      try {
        pageRows = await hardcover.getBooksByTag({
          tagId: request.hardcoverId,
          categorySlug: request.tagCategorySlug,
          limit: requestedPageSize,
          offset,
        });
      } catch (error) {
        if (isHardcoverTimeout(error) && pageSize > MIN_TAG_PAGE_SIZE) {
          pageSize = Math.max(MIN_TAG_PAGE_SIZE, Math.floor(pageSize / 2));
          continue;
        }

        throw error;
      }

      const normalizedPageRows = Array.isArray(pageRows) ? pageRows : [];
      rows.push(...normalizedPageRows);
      offset += normalizedPageRows.length;
      rankedBooks = aggregateTagBooks(rows);

      if (rankedBooks.length >= request.limit) {
        return {
          books: rankedBooks.slice(0, request.limit),
          candidateCount: rows.length,
          candidateLimit: offset,
        };
      }

      if (normalizedPageRows.length < requestedPageSize) {
        exhausted = true;
        break;
      }
    }

    if (exhausted) {
      break;
    }

    const nextLimit = nextTagCandidateLimit(candidateLimit);

    if (nextLimit === null || nextLimit === candidateLimit) {
      break;
    }

    candidateLimit = nextLimit;
  }

  return {
    books: rankedBooks.slice(0, request.limit),
    candidateCount: rows.length,
    candidateLimit: Math.min(offset, candidateLimit ?? MAX_BOOK_TAG_CANDIDATE_LIMIT),
  };
}

async function loadSemanticTagBooks(hardcover, request) {
  let candidateLimit = Math.max(
    request.candidateLimit,
    Math.min(request.limit * 2, MAX_BOOK_TAG_CANDIDATE_LIMIT),
  );
  const states = request.tagSources.map((source) => ({
    source,
    rows: [],
    pageSize: Math.min(TAG_PAGE_SIZE, candidateLimit),
    offset: 0,
    exhausted: false,
  }));
  let rankedBooks = [];

  while (candidateLimit !== null) {
    for (const state of states) {
      while (state.offset < candidateLimit && !state.exhausted) {
        const requestedPageSize = Math.min(
          state.pageSize,
          candidateLimit - state.offset,
        );
        let pageRows;

        try {
          pageRows = await hardcover.getBooksByTag({
            tagId: state.source.id,
            categorySlug: state.source.categorySlug,
            limit: requestedPageSize,
            offset: state.offset,
          });
        } catch (error) {
          if (isHardcoverTimeout(error) && state.pageSize > MIN_TAG_PAGE_SIZE) {
            state.pageSize = Math.max(
              MIN_TAG_PAGE_SIZE,
              Math.floor(state.pageSize / 2),
            );
            continue;
          }

          throw error;
        }

        const normalizedPageRows = Array.isArray(pageRows) ? pageRows : [];
        state.rows.push(
          ...normalizedPageRows.map((row) => ({
            ...row,
            semanticWeight: state.source.weight,
            semanticQualifies: state.source.qualifies !== false,
          })),
        );
        state.offset += normalizedPageRows.length;

        if (normalizedPageRows.length < requestedPageSize) {
          state.exhausted = true;
          break;
        }
      }
    }

    rankedBooks = aggregateTagBooks(states.flatMap((state) => state.rows));

    if (rankedBooks.length >= request.limit || states.every((state) => state.exhausted)) {
      break;
    }

    const nextLimit = nextTagCandidateLimit(candidateLimit);

    if (nextLimit === null || nextLimit === candidateLimit) {
      break;
    }

    candidateLimit = nextLimit;
  }

  return {
    books: rankedBooks.slice(0, request.limit),
    candidateCount: states.reduce((total, state) => total + state.rows.length, 0),
    candidateLimit: Math.max(0, ...states.map((state) => state.offset)),
  };
}

async function loadTagBooks(hardcover, request) {
  if (Array.isArray(request.tagSources) && request.tagSources.length > 1) {
    return loadSemanticTagBooks(hardcover, request);
  }

  return loadSingleTagBooks(hardcover, request);
}

async function loadSingleTagSeries(hardcover, request) {
  let candidateLimit = Math.max(
    request.candidateLimit,
    Math.min(request.limit * 2, MAX_BOOK_TAG_CANDIDATE_LIMIT),
  );
  let pageSize = Math.min(TAG_PAGE_SIZE, candidateLimit);
  let offset = 0;
  let exhausted = false;
  const rows = [];
  let rankedSeries = [];

  while (candidateLimit !== null) {
    while (offset < candidateLimit && !exhausted) {
      const requestedPageSize = Math.min(pageSize, candidateLimit - offset);
      let pageRows;

      try {
        pageRows = await hardcover.getBooksByTag({
          tagId: request.hardcoverId,
          categorySlug: request.tagCategorySlug,
          limit: requestedPageSize,
          offset,
        });
      } catch (error) {
        if (isHardcoverTimeout(error) && pageSize > MIN_TAG_PAGE_SIZE) {
          pageSize = Math.max(MIN_TAG_PAGE_SIZE, Math.floor(pageSize / 2));
          continue;
        }

        throw error;
      }

      const normalizedPageRows = Array.isArray(pageRows) ? pageRows : [];
      rows.push(...normalizedPageRows);
      offset += normalizedPageRows.length;
      rankedSeries = aggregateTagSeries(rows);

      if (rankedSeries.length >= request.limit) {
        return {
          series: rankedSeries.slice(0, request.limit),
          candidateCount: rows.length,
          candidateLimit: offset,
        };
      }

      if (normalizedPageRows.length < requestedPageSize) {
        exhausted = true;
        break;
      }
    }

    if (exhausted) {
      break;
    }

    const nextLimit = nextTagCandidateLimit(candidateLimit);

    if (nextLimit === null || nextLimit === candidateLimit) {
      break;
    }

    candidateLimit = nextLimit;
  }

  return {
    series: rankedSeries.slice(0, request.limit),
    candidateCount: rows.length,
    candidateLimit: Math.min(offset, candidateLimit ?? MAX_BOOK_TAG_CANDIDATE_LIMIT),
  };
}

async function loadSemanticTagSeries(hardcover, request) {
  let candidateLimit = Math.max(
    request.candidateLimit,
    Math.min(request.limit * 2, MAX_BOOK_TAG_CANDIDATE_LIMIT),
  );
  const states = request.tagSources.map((source) => ({
    source,
    rows: [],
    pageSize: Math.min(TAG_PAGE_SIZE, candidateLimit),
    offset: 0,
    exhausted: false,
  }));
  let rankedSeries = [];

  while (candidateLimit !== null) {
    for (const state of states) {
      while (state.offset < candidateLimit && !state.exhausted) {
        const requestedPageSize = Math.min(
          state.pageSize,
          candidateLimit - state.offset,
        );
        let pageRows;

        try {
          pageRows = await hardcover.getBooksByTag({
            tagId: state.source.id,
            categorySlug: state.source.categorySlug,
            limit: requestedPageSize,
            offset: state.offset,
          });
        } catch (error) {
          if (isHardcoverTimeout(error) && state.pageSize > MIN_TAG_PAGE_SIZE) {
            state.pageSize = Math.max(
              MIN_TAG_PAGE_SIZE,
              Math.floor(state.pageSize / 2),
            );
            continue;
          }

          throw error;
        }

        const normalizedPageRows = Array.isArray(pageRows) ? pageRows : [];
        state.rows.push(
          ...normalizedPageRows.map((row) => ({
            ...row,
            semanticWeight: state.source.weight,
            semanticQualifies: state.source.qualifies !== false,
            semanticSource: {
              id: state.source.id,
              slug: state.source.slug,
              categorySlug: state.source.categorySlug,
            },
          })),
        );
        state.offset += normalizedPageRows.length;

        if (normalizedPageRows.length < requestedPageSize) {
          state.exhausted = true;
          break;
        }
      }
    }

    rankedSeries = aggregateTagSeries(states.flatMap((state) => state.rows));

    if (rankedSeries.length >= request.limit) {
      break;
    }

    if (states.every((state) => state.exhausted)) {
      break;
    }

    const nextLimit = nextTagCandidateLimit(candidateLimit);

    if (nextLimit === null || nextLimit === candidateLimit) {
      break;
    }

    candidateLimit = nextLimit;
  }

  return {
    series: rankedSeries.slice(0, request.limit),
    candidateCount: states.reduce((total, state) => total + state.rows.length, 0),
    candidateLimit: Math.max(0, ...states.map((state) => state.offset)),
    sourceCandidateCounts: states.map((state) => ({
      id: state.source.id,
      slug: state.source.slug,
      categorySlug: state.source.categorySlug,
      count: state.rows.length,
    })),
  };
}

async function loadTagSeries(hardcover, request) {
  if (Array.isArray(request.tagSources) && request.tagSources.length > 1) {
    return loadSemanticTagSeries(hardcover, request);
  }

  return loadSingleTagSeries(hardcover, request);
}

function createCollection(request, resolvedEntity, items, extraDefinition = {}) {
  const resolvedName = resolvedEntity?.name ?? request.resolvedName;
  let name;
  let description;
  let suffix;

  if (request.mode === 'tag-books') {
    name = `${resolvedName} Books`;
    description = request.semanticCategory
      ? `Popular individual books associated with ${resolvedName}.`
      : `Popular individual books associated with ${resolvedName} on Hardcover.`;
    suffix = 'books';
  } else if (request.mode === 'tag-series') {
    name = `${resolvedName} Book Series`;
    description = request.semanticCategory
      ? `Popular book series associated with ${resolvedName}.`
      : `Popular book series associated with ${resolvedName} on Hardcover.`;
    suffix = 'book-series';
  } else if (request.mode === 'author') {
    name = `${resolvedName} Books`;
    description = `Books authored by ${resolvedName}.`;
    suffix = 'books';
  } else {
    name = `${resolvedName} Books`;
    description = `Primary books in the ${resolvedName} series.`;
    suffix = 'books';
  }

  return {
    id: `${request.collectionId}-${suffix}`,
    name,
    description,
    candidateSource: {
      kind: 'generated',
      provider: 'hardcover',
      originalRequest: request.query,
      definition: {
        schemaVersion: 1,
        collectionId: request.collectionId,
        mediaType: 'book',
        mode: request.mode,
        query: request.query,
        hardcoverId: request.hardcoverId,
        resolvedName,
        limit: request.limit,
        sort: request.sort,
        ...((request.mode === 'tag-books' || request.mode === 'tag-series')
          ? {
              tagSlug: request.tagSlug,
              tagCategorySlug: request.tagCategorySlug,
              candidateLimit: request.candidateLimit,
              ...(request.semanticCategory
                ? { semanticCategory: request.semanticCategory }
                : {}),
              ...(Array.isArray(request.tagSources) && request.tagSources.length > 0
                ? { tagSources: request.tagSources }
                : {}),
            }
          : {}),
        ...extraDefinition,
      },
    },
    items,
  };
}

export async function generateBookCollection({
  request,
  hardcover,
  logger = console,
}) {
  if (!hardcover) {
    throw new Error('Hardcover provider is not configured.');
  }

  const normalizedRequest = validateRequest(request);

  if (normalizedRequest.mode === 'series') {
    const rawSeries = await hardcover.getSeriesById(normalizedRequest.hardcoverId);

    if (!rawSeries) {
      throw new Error(`Hardcover series ${normalizedRequest.hardcoverId} was not found.`);
    }

    const series = rawSeries.canonical ?? rawSeries;
    const books = selectPrimarySeriesBooks(rawSeries, normalizedRequest.limit);

    if (books.length === 0) {
      throw new Error(`No primary books were found for ${series.name}.`);
    }

    const items = books.map(createBookRankItem);
    const missingPosterCount = items.filter((item) => !item.image).length;

    logger.log(`Found ${items.length} primary book(s) in ${series.name}.`);

    return {
      collection: createCollection(normalizedRequest, series, items),
      resolvedEntity: series,
      candidateCount: books.length,
      validatedCount: items.length,
      missingPosterCount,
    };
  }

  if (normalizedRequest.mode === 'author') {
    const result = await loadAuthorBooks(hardcover, normalizedRequest);

    if (result.books.length === 0) {
      throw new Error(`No authored books were found for ${result.author.name}.`);
    }

    const items = result.books.map(createBookRankItem);
    const missingPosterCount = items.filter((item) => !item.image).length;

    logger.log(`Found ${items.length} authored book(s) for ${result.author.name}.`);

    return {
      collection: createCollection(normalizedRequest, result.author, items),
      resolvedEntity: result.author,
      candidateCount: result.candidateCount,
      validatedCount: items.length,
      missingPosterCount,
    };
  }

  if (normalizedRequest.mode === 'tag-books') {
    const tagResult = await loadTagBooks(hardcover, normalizedRequest);

    if (tagResult.books.length === 0) {
      throw new Error(`No individual books were found for ${normalizedRequest.resolvedName}.`);
    }

    const items = tagResult.books.map(createBookRankItem);
    const missingPosterCount = items.filter((item) => !item.image).length;
    const resolvedEntity = {
      id: normalizedRequest.hardcoverId,
      name: normalizedRequest.resolvedName,
      slug: normalizedRequest.tagSlug,
      categorySlug: normalizedRequest.tagCategorySlug,
    };

    logger.log(
      `Found ${items.length} popular individual book(s) for ${normalizedRequest.resolvedName}.`,
    );

    return {
      collection: createCollection(normalizedRequest, resolvedEntity, items, {
        effectiveCandidateLimit: tagResult.candidateLimit,
      }),
      resolvedEntity,
      candidateCount: tagResult.candidateCount,
      validatedCount: items.length,
      missingPosterCount,
    };
  }

  const tagResult = await loadTagSeries(hardcover, normalizedRequest);

  if (tagResult.series.length === 0) {
    throw new Error(`No book series were found for ${normalizedRequest.resolvedName}.`);
  }

  const items = tagResult.series.map(createSeriesRankItem);
  const missingPosterCount = items.filter((item) => !item.image).length;
  const resolvedEntity = {
    id: normalizedRequest.hardcoverId,
    name: normalizedRequest.resolvedName,
    slug: normalizedRequest.tagSlug,
    categorySlug: normalizedRequest.tagCategorySlug,
  };

  logger.log(
    `Found ${items.length} popular book series for ${normalizedRequest.resolvedName}.`,
  );

  return {
    collection: createCollection(normalizedRequest, resolvedEntity, items, {
      effectiveCandidateLimit: tagResult.candidateLimit,
      ...(Array.isArray(tagResult.sourceCandidateCounts)
        ? { sourceCandidateCounts: tagResult.sourceCandidateCounts }
        : {}),
    }),
    resolvedEntity,
    candidateCount: tagResult.candidateCount,
    validatedCount: items.length,
    missingPosterCount,
  };
}

export function validateBookGenerationRequest(request) {
  try {
    return {
      ok: true,
      request: validateRequest(request),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid book generation request.',
    };
  }
}
