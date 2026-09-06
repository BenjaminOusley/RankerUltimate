const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
const DEFAULT_REQUEST_INTERVAL_MS = 1050;
const MAX_SEARCH_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MAX_TAG_PAGE_LIMIT = 100;
const TAG_PROFILE_CHUNK_SIZE = 25;
const MAX_RETRIES = 3;

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function normalizePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function normalizeLimit(value, maximum, name) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}.`);
  }

  return value;
}

function normalizeOffset(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Hardcover offset must be a non-negative integer.');
  }

  return value;
}

function normalizeId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeSearchDocuments(results) {
  const hits = Array.isArray(results?.hits) ? results.hits : [];

  return hits
    .map((hit) => hit?.document)
    .filter((document) => document && normalizeId(document.id) !== null)
    .map((document) => ({
      ...document,
      id: normalizeId(document.id),
      ...(document.canonical_id != null
        ? { canonical_id: normalizeId(document.canonical_id) }
        : {}),
    }));
}

export function normalizeHardcoverText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function createHardcoverProvider({
  token,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleepImpl = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  minimumRequestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS,
} = {}) {
  const normalizedToken = requireNonEmptyString(token, 'Hardcover API token');

  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for Hardcover.');
  }

  if (typeof now !== 'function' || typeof sleepImpl !== 'function') {
    throw new Error('Hardcover timing helpers must be functions.');
  }

  if (
    !Number.isFinite(minimumRequestIntervalMs) ||
    minimumRequestIntervalMs < 0
  ) {
    throw new Error('Hardcover request interval must be zero or greater.');
  }

  let lastRequestAt = 0;
  let requestQueue = Promise.resolve();

  function enqueue(task) {
    const current = requestQueue.then(task, task);
    requestQueue = current.catch(() => undefined);
    return current;
  }

  async function waitForRequestSlot() {
    const waitMs = minimumRequestIntervalMs - (now() - lastRequestAt);

    if (waitMs > 0) {
      await sleepImpl(waitMs);
    }

    lastRequestAt = now();
  }

  async function graphql(query, variables = {}) {
    const normalizedQuery = requireNonEmptyString(query, 'Hardcover GraphQL query');

    return enqueue(async () => {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        await waitForRequestSlot();

        const response = await fetchImpl(HARDCOVER_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${normalizedToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query: normalizedQuery,
            variables,
          }),
        });

        const text = await response.text();
        let body = null;

        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = text;
        }

        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfterSeconds = Number(response.headers.get('retry-after'));
          const retryDelay = Number.isFinite(retryAfterSeconds)
            ? Math.max(1000, retryAfterSeconds * 1000)
            : 1500;

          await sleepImpl(retryDelay);
          continue;
        }

        if (!response.ok) {
          const error = new Error(
            `Hardcover HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`,
          );
          error.status = response.status;
          throw error;
        }

        if (Array.isArray(body?.errors) && body.errors.length > 0) {
          throw new Error(
            `Hardcover GraphQL: ${body.errors
              .map((entry) => entry?.message ?? 'Unknown GraphQL error')
              .join(' | ')}`,
          );
        }

        return body?.data ?? null;
      }

      throw new Error('Hardcover request failed after retrying.');
    });
  }

  async function searchEntities(query, queryType, limit = 10) {
    const normalizedQuery = requireNonEmptyString(query, 'Hardcover search query');
    const normalizedLimit = normalizeLimit(
      limit,
      MAX_SEARCH_LIMIT,
      'Hardcover search limit',
    );

    const data = await graphql(
      `
        query RankerUltimateHardcoverSearch(
          $query: String!,
          $queryType: String!,
          $perPage: Int!
        ) {
          search(
            query: $query,
            query_type: $queryType,
            page: 1,
            per_page: $perPage
          ) {
            results
          }
        }
      `,
      {
        query: normalizedQuery,
        queryType,
        perPage: normalizedLimit,
      },
    );

    return normalizeSearchDocuments(data?.search?.results);
  }

  async function searchSeries(query, limit = 10) {
    return searchEntities(query, 'Series', limit);
  }

  async function searchAuthors(query, limit = 10) {
    return searchEntities(query, 'Author', limit);
  }

  async function findTagsBySlugs(slugs) {
    if (!Array.isArray(slugs) || slugs.length === 0) {
      throw new Error('Hardcover tag lookup requires at least one slug.');
    }

    const normalizedSlugs = [
      ...new Set(
        slugs
          .map((slug) => String(slug ?? '').trim().toLowerCase())
          .filter(Boolean),
      ),
    ];

    if (normalizedSlugs.length === 0 || normalizedSlugs.length > 20) {
      throw new Error('Hardcover tag lookup requires between 1 and 20 slugs.');
    }

    const data = await graphql(
      `
        query RankerUltimateHardcoverTags($slugs: [String!]!) {
          tags(
            where: {slug: {_in: $slugs}},
            order_by: {count: desc}
          ) {
            id
            tag
            slug
            count
            tag_category {
              id
              category
              slug
            }
          }
        }
      `,
      { slugs: normalizedSlugs },
    );

    return (data?.tags ?? [])
      .map((tag) => ({
        ...tag,
        id: normalizeId(tag?.id),
      }))
      .filter((tag) => tag.id !== null);
  }

  async function getSeriesById(id) {
    const normalizedId = normalizePositiveInteger(id, 'Hardcover series ID');

    const data = await graphql(
      `
        query RankerUltimateHardcoverSeries($id: Int!) {
          series_by_pk(id: $id) {
            id
            canonical_id
            name
            slug
            books_count
            primary_books_count
            is_completed
            author {
              id
              name
              slug
            }
            canonical {
              id
              name
              slug
              books_count
              primary_books_count
              is_completed
              author {
                id
                name
                slug
              }
            }
            book_series(
              order_by: [
                {position: asc},
                {book_id: asc}
              ]
            ) {
              id
              position
              featured
              compilation
              details
              book {
                id
                canonical_id
                title
                slug
                release_date
                release_year
                compilation
                is_partial_book
                users_read_count
                ratings_count
                rating
                image {
                  id
                  url
                }
                canonical {
                  id
                  title
                  slug
                  release_date
                  release_year
                  compilation
                  is_partial_book
                  users_read_count
                  ratings_count
                  rating
                  image {
                    id
                    url
                  }
                }
              }
            }
          }
        }
      `,
      { id: normalizedId },
    );

    return data?.series_by_pk ?? null;
  }

  async function getAuthorContributionsPage({ id, limit = 100, offset = 0 }) {
    const normalizedId = normalizePositiveInteger(id, 'Hardcover author ID');
    const normalizedLimit = normalizeLimit(
      limit,
      MAX_PAGE_LIMIT,
      'Hardcover author page limit',
    );
    const normalizedOffset = normalizeOffset(offset);

    const data = await graphql(
      `
        query RankerUltimateHardcoverAuthorBooks(
          $id: Int!,
          $limit: Int!,
          $offset: Int!
        ) {
          authors_by_pk(id: $id) {
            id
            canonical_id
            name
            slug
            books_count
            users_count
            canonical {
              id
              name
              slug
              books_count
              users_count
            }
            contributions(
              where: {
                book: {id: {_is_null: false}}
              },
              order_by: [
                {book: {users_read_count: desc}},
                {id: asc}
              ],
              limit: $limit,
              offset: $offset
            ) {
              id
              contribution
              contributor_role_id
              contributor_role {
                id
                name
                slug
                primary
                important
                contributor_role_category_id
              }
              book {
                id
                canonical_id
                title
                slug
                release_date
                release_year
                compilation
                is_partial_book
                users_read_count
                ratings_count
                rating
                image {
                  id
                  url
                }
                canonical {
                  id
                  title
                  slug
                  release_date
                  release_year
                  compilation
                  is_partial_book
                  users_read_count
                  ratings_count
                  rating
                  image {
                    id
                    url
                  }
                }
              }
            }
          }
        }
      `,
      {
        id: normalizedId,
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    );

    const author = data?.authors_by_pk ?? null;

    return {
      author,
      contributions: author?.contributions ?? [],
    };
  }

  async function getBooksByTag({ tagId, categorySlug, limit = 100, offset = 0 }) {
    const normalizedTagId = normalizePositiveInteger(tagId, 'Hardcover tag ID');
    const normalizedCategorySlug = requireNonEmptyString(
      categorySlug,
      'Hardcover tag category slug',
    );
    const normalizedLimit = normalizeLimit(
      limit,
      MAX_TAG_PAGE_LIMIT,
      'Hardcover tag page limit',
    );
    const normalizedOffset = normalizeOffset(offset);

    // Keep the expensive per-book relevance lookup out of the candidate query.
    // Hardcover can time out when taggable_counts is asked to both rank a large
    // tag result set and resolve nested taggable_counts for every returned book.
    const candidateData = await graphql(
      `
        query RankerUltimateHardcoverTagBooks(
          $tagId: Int!,
          $limit: Int!,
          $offset: Int!
        ) {
          taggable_counts(
            where: {
              tag_id: {_eq: $tagId},
              book: {id: {_is_null: false}}
            },
            order_by: [
              {book: {users_read_count: desc}},
              {count: desc}
            ],
            limit: $limit,
            offset: $offset
          ) {
            count
            hardcover_tagged
            book {
              id
              canonical_id
              title
              users_read_count
              ratings_count
              image {
                id
                url
              }
              featured_book_series {
                position
                series {
                  id
                  canonical_id
                  name
                  slug
                  books_count
                  primary_books_count
                  is_completed
                  author {
                    id
                    name
                    slug
                  }
                }
              }
            }
          }
        }
      `,
      {
        tagId: normalizedTagId,
        limit: normalizedLimit,
        offset: normalizedOffset,
      },
    );

    const rows = Array.isArray(candidateData?.taggable_counts)
      ? candidateData.taggable_counts
      : [];
    const bookIds = [
      ...new Set(
        rows
          .map((row) => normalizeId(row?.book?.id))
          .filter((id) => id !== null),
      ),
    ];

    if (bookIds.length === 0) {
      return rows;
    }

    const profilesByBookId = new Map();

    async function loadProfileChunk(chunk) {
      try {
        const profileData = await graphql(
          `
            query RankerUltimateHardcoverBookTagProfiles(
              $bookIds: [Int!]!,
              $categorySlug: String!
            ) {
              books(where: {id: {_in: $bookIds}}) {
                id
                taggable_counts(
                  where: {
                    tag: {
                      tag_category: {
                        slug: {_eq: $categorySlug}
                      }
                    }
                  },
                  order_by: {count: desc},
                  limit: 1
                ) {
                  count
                }
              }
            }
          `,
          {
            bookIds: chunk,
            categorySlug: normalizedCategorySlug,
          },
        );

        return profileData?.books ?? [];
      } catch (error) {
        if (error?.status !== 408 || chunk.length <= 1) {
          throw error;
        }

        const midpoint = Math.ceil(chunk.length / 2);
        const left = await loadProfileChunk(chunk.slice(0, midpoint));
        const right = await loadProfileChunk(chunk.slice(midpoint));

        return [...left, ...right];
      }
    }

    for (let index = 0; index < bookIds.length; index += TAG_PROFILE_CHUNK_SIZE) {
      const chunk = bookIds.slice(index, index + TAG_PROFILE_CHUNK_SIZE);
      const profileBooks = await loadProfileChunk(chunk);

      for (const book of profileBooks) {
        const id = normalizeId(book?.id);

        if (id !== null) {
          profilesByBookId.set(
            id,
            Array.isArray(book?.taggable_counts) ? book.taggable_counts : [],
          );
        }
      }
    }

    return rows.map((row) => {
      const bookId = normalizeId(row?.book?.id);

      if (bookId === null || !row?.book) {
        return row;
      }

      return {
        ...row,
        book: {
          ...row.book,
          taggable_counts: profilesByBookId.get(bookId) ?? [],
        },
      };
    });
  }

  return {
    searchSeries,
    searchAuthors,
    findTagsBySlugs,
    getSeriesById,
    getAuthorContributionsPage,
    getBooksByTag,
  };
}
