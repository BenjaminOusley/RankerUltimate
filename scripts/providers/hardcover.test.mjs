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

describe('Hardcover provider', () => {
  it('normalizes comparison text without coupling it to another provider', () => {
    expect(normalizeHardcoverText('  C. S. Lewis — Sci-Fi  ')).toBe(
      'c s lewis sci fi',
    );
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
          return jsonResponse(
            { error: 'rate limited' },
            429,
            { 'Retry-After': '1' },
          );
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
        expect(body.query).toContain('tag_id: {_eq: $tagId}');
        expect(body.query).toContain('offset: $offset');
        expect(body.query).not.toContain('slug: {_eq: $categorySlug}');

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
      expect(body.query).toContain('books(where: {id: {_in: $bookIds}})');
      expect(body.query).toContain('slug: {_eq: $categorySlug}');
      expect(body.query).toContain('limit: 1');

      return jsonResponse({
        data: {
          books: [
            {
              id: 10,
              taggable_counts: [{ count: 8 }],
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
        },
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
