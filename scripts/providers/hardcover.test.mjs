import { describe, expect, it, vi } from 'vitest';

import { createHardcoverProvider, normalizeHardcoverText } from './hardcover.mjs';

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function compactGraphql(query) {
  return String(query).replace(/\s+/gu, '');
}

describe('Hardcover provider', () => {
  it('normalizes comparison text without coupling it to another provider', () => {
    expect(normalizeHardcoverText('  C. S. Lewis — Sci-Fi  ')).toBe('c s lewis sci fi');
  });

  it('searches first-class Series entities and normalizes their IDs', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);

      expect(body.variables).toMatchObject({
        query: 'Dune',
        queryType: 'Series',
        perPage: 10,
      });

      return jsonResponse({
        data: {
          search: {
            results: {
              hits: [
                {
                  document: {
                    id: '1150',
                    name: 'Dune',
                    readers_count: 18214,
                  },
                },
              ],
            },
          },
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(provider.searchSeries('Dune')).resolves.toEqual([
      {
        id: 1150,
        name: 'Dune',
        readers_count: 18214,
      },
    ]);
  });

  it('retries a rate-limited request using Retry-After', async () => {
    const sleepImpl = vi.fn(async () => undefined);
    let call = 0;

    const provider = createHardcoverProvider({
      token: 'token',
      minimumRequestIntervalMs: 0,
      sleepImpl,
      async fetchImpl() {
        call += 1;

        if (call === 1) {
          return jsonResponse({ error: 'rate limited' }, 429, { 'Retry-After': '1' });
        }

        return jsonResponse({
          data: {
            tags: [],
          },
        });
      },
    });

    await provider.findTagsBySlugs(['fantasy']);

    expect(call).toBe(2);
    expect(sleepImpl).toHaveBeenCalledWith(1000);
  });

  it('loads tag candidates first, then enriches relevance profiles in a separate query', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (_url, init) => {
      call += 1;
      const body = JSON.parse(init.body);

      if (call === 1) {
        expect(body.variables).toEqual({
          tagId: 123,
          limit: 100,
          offset: 0,
        });
        const query = compactGraphql(body.query);

        expect(query).toContain('tag_id:{_eq:$tagId}');
        expect(query).toContain('offset:$offset');
        expect(query).not.toContain('slug:{_eq:$categorySlug}');

        return jsonResponse({
          data: {
            taggable_counts: [
              {
                count: 4,
                book: {
                  id: 10,
                  title: 'Example',
                  users_read_count: 100,
                  featured_book_series: {
                    series: {
                      id: 20,
                      name: 'Example Series',
                    },
                  },
                },
              },
            ],
          },
        });
      }

      expect(body.variables).toEqual({
        bookIds: [10],
        categorySlug: 'genre',
      });
      const query = compactGraphql(body.query);

      expect(query).toContain('books(where:{id:{_in:$bookIds}})');
      expect(query).toContain('slug:{_eq:$categorySlug}');
      expect(query).toContain('limit:1');
      expect(query).toContain('book_series');

      return jsonResponse({
        data: {
          books: [
            {
              id: 10,
              taggable_counts: [{ count: 8 }],
              book_series: [
                {
                  series: {
                    id: 20,
                    name: 'Example Series',
                    primary_books_count: 3,
                  },
                },
              ],
            },
          ],
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(
      provider.getBooksByTag({
        tagId: 123,
        categorySlug: 'genre',
        limit: 100,
      }),
    ).resolves.toEqual([
      {
        count: 4,
        book: {
          id: 10,
          title: 'Example',
          users_read_count: 100,
          featured_book_series: {
            series: {
              id: 20,
              name: 'Example Series',
            },
          },
          taggable_counts: [{ count: 8 }],
          book_series: [
            {
              series: {
                id: 20,
                name: 'Example Series',
                primary_books_count: 3,
              },
            },
          ],
        },
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps author contribution pages lightweight so normal author-book generation is not coupled to series lookup', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);

      expect(body.variables).toEqual({
        id: 204214,
        limit: 100,
        offset: 0,
      });
      expect(body.query).not.toContain('featured_book_series');
      expect(body.query).toContain('contributor_role_category_id');

      return jsonResponse({
        data: {
          authors_by_pk: {
            id: 204214,
            name: 'Brandon Sanderson',
            contributions: [
              {
                id: 1,
                contributor_role: { contributor_role_category_id: 1 },
                book: {
                  id: 10,
                  title: 'The Way of Kings',
                  users_read_count: 1000,
                },
              },
            ],
          },
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(
      provider.getAuthorContributionsPage({ id: 204214, limit: 100, offset: 0 }),
    ).resolves.toMatchObject({
      author: { id: 204214, name: 'Brandon Sanderson' },
      contributions: [
        {
          book: {
            id: 10,
            title: 'The Way of Kings',
          },
        },
      ],
    });
  });

  it('loads author-series memberships with contributions in one paged request', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);

      expect(body.variables).toEqual({
        id: 204214,
        limit: 100,
        offset: 0,
      });

      const query = compactGraphql(body.query);

      expect(query).toContain('RankerUltimateHardcoverAuthorSeriesBooks');
      expect(query.match(/book_series\(/gu)).toHaveLength(2);

      return jsonResponse({
        data: {
          authors_by_pk: {
            id: 204214,
            name: 'Brandon Sanderson',
            contributions: [
              {
                id: 1,
                contributor_role: {
                  contributor_role_category_id: 1,
                },
                book: {
                  id: 1010,
                  canonical_id: 10,
                  title: 'Translated Alias',
                  canonical: {
                    id: 10,
                    title: 'The Way of Kings',
                    compilation: false,
                    is_partial_book: false,
                    users_read_count: 1000,
                    ratings_count: 800,
                    image: {
                      url: 'stormlight.jpg',
                    },
                    book_series: [
                      {
                        position: 1,
                        featured: true,
                        compilation: false,
                        series: {
                          id: 20,
                          name: 'The Stormlight Archive',
                          primary_books_count: 10,
                          author: {
                            id: 204214,
                            name: 'Brandon Sanderson',
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(
      provider.getAuthorSeriesContributionsPage({
        id: 204214,
        limit: 100,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      author: {
        id: 204214,
        name: 'Brandon Sanderson',
      },
      contributions: [
        {
          book: {
            canonical: {
              id: 10,
              title: 'The Way of Kings',
              book_series: [
                {
                  position: 1,
                  series: {
                    id: 20,
                    name: 'The Stormlight Archive',
                  },
                },
              ],
            },
          },
        },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('loads series owned by an author with a representative popular book', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);

      expect(body.variables).toEqual({
        id: 204214,
        limit: 100,
        offset: 0,
      });
      const query = compactGraphql(body.query);

      expect(query).toContain('author_id:{_eq:$id}');
      expect(query).toContain('canonical_id:{_eq:$id}');
      expect(query).toContain('users_read_count:desc');
      return jsonResponse({
        data: {
          series: [
            {
              id: 20,
              name: 'The Stormlight Archive',
              primary_books_count: 10,
              author: { id: 204214, name: 'Brandon Sanderson' },
              book_series: [
                {
                  book: {
                    id: 10,
                    title: 'The Way of Kings',
                    users_read_count: 10000,
                    ratings_count: 5000,
                    image: { url: 'stormlight.jpg' },
                  },
                },
              ],
            },
          ],
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(
      provider.getSeriesByAuthorId({ id: 204214, limit: 100, offset: 0 }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 20,
        name: 'The Stormlight Archive',
        book_series: [
          expect.objectContaining({
            book: expect.objectContaining({
              title: 'The Way of Kings',
            }),
          }),
        ],
      }),
    ]);
  });

  it('loads series memberships from exact books and aliases canonicalized to them', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);

      expect(body.variables).toEqual({
        bookIds: [10, 11],
        limit: 500,
        offset: 0,
      });
      const query = compactGraphql(body.query);

      expect(query).toContain('book_series(');
      expect(query).toContain('{book_id:{_in:$bookIds}}');
      expect(query).toContain('{book:{canonical_id:{_in:$bookIds}}}');
      return jsonResponse({
        data: {
          book_series: [
            {
              book_id: 1010,
              position: 1,
              book: { id: 1010, canonical_id: 10 },
              series: {
                id: 20,
                name: 'The Stormlight Archive',
                primary_books_count: 10,
              },
            },
            {
              book_id: 11,
              position: 1,
              book: { id: 11, canonical_id: null },
              series: {
                id: 30,
                name: 'Mistborn',
                primary_books_count: 7,
              },
            },
          ],
        },
      });
    });

    const provider = createHardcoverProvider({
      token: 'token',
      fetchImpl,
      minimumRequestIntervalMs: 0,
    });

    await expect(provider.getBookSeriesMembershipsByBookIds([10, 11])).resolves.toEqual([
      expect.objectContaining({
        id: 1010,
        canonical_id: 10,
        book_series: [
          expect.objectContaining({
            series: expect.objectContaining({
              id: 20,
              name: 'The Stormlight Archive',
            }),
          }),
        ],
      }),
      expect.objectContaining({
        id: 11,
        book_series: [
          expect.objectContaining({
            series: expect.objectContaining({
              id: 30,
              name: 'Mistborn',
            }),
          }),
        ],
      }),
    ]);
  });
});
