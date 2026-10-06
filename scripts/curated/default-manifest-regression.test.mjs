import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getTvRunLabel } from '../providers/tmdb.mjs';
import { filterStephenKingBooks, parseStephenKingWorksPage } from './official-source-parsers.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../../src/data/curated/default-manifest.json', import.meta.url), 'utf8'),
);

const updaterSource = readFileSync(
  new URL('./update-default-manifest.mjs', import.meta.url),
  'utf8',
);

function getCollection(id) {
  const found = manifest.collections.find((entry) => entry.id === id);

  if (!found) {
    throw new Error(`Missing generated curated collection: ${id}`);
  }

  return found;
}

function getItemBySourceId(collection, sourceId) {
  return collection.items.find((item) => String(item?.source?.id) === String(sourceId));
}

function expectTmdbItem(collection, { sourceId, name, subtitle, type }) {
  const item = getItemBySourceId(collection, sourceId);

  expect(item).toMatchObject({
    name,
    subtitle,
    source: {
      provider: 'tmdb',
      id: String(sourceId),
      type,
    },
  });

  expect(item.image).toBeTruthy();

  return item;
}

describe('generated curated manifest regressions', () => {
  it('does not reintroduce title-specific Star Wars or Disney resolver pin maps', () => {
    expect(updaterSource).not.toContain('STAR_WARS_PINNED_TMDB');

    expect(updaterSource).not.toContain('DISNEY_PRINCESS_PINNED_ORIGINALS');
  });

  it('keeps canonical Star Wars identities and artwork', () => {
    const starWars = getCollection('star-wars-movies-tv');

    expectTmdbItem(starWars, {
      sourceId: 11,
      name: 'Star Wars',
      subtitle: '1977',
      type: 'movie',
    });

    expectTmdbItem(starWars, {
      sourceId: 1893,
      name: 'Star Wars: Episode I - The Phantom Menace',
      subtitle: '1999',
      type: 'movie',
    });

    expectTmdbItem(starWars, {
      sourceId: 202879,
      name: 'Star Wars: Skeleton Crew',
      subtitle: '2024\u20132025',
      type: 'tv',
    });

    expect(starWars.items.every((item) => Boolean(item.image))).toBe(true);
  });

  it('keeps canonical Disney animated films, Frozen policy additions, and artwork', () => {
    const disney = getCollection('disney-princess-movies');

    expectTmdbItem(disney, {
      sourceId: 10144,
      name: 'The Little Mermaid',
      subtitle: '1989',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 10020,
      name: 'Beauty and the Beast',
      subtitle: '1991',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 62177,
      name: 'Brave',
      subtitle: '2012',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 109445,
      name: 'Frozen',
      subtitle: '2013',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 330457,
      name: 'Frozen II',
      subtitle: '2019',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 321612,
      name: 'Beauty and the Beast',
      subtitle: '2017',
      type: 'movie',
    });

    expectTmdbItem(disney, {
      sourceId: 447277,
      name: 'The Little Mermaid',
      subtitle: '2023',
      type: 'movie',
    });

    expect(disney.items.every((item) => Boolean(item.image))).toBe(true);
  });

  it('keeps artwork on every best-selling game', () => {
    const games = getCollection('top-50-best-selling-video-games');

    expect(games.items.every((item) => Boolean(item.image))).toBe(true);

    const pokemon = games.items.find((item) => /Red\s*\/\s*Blue\s*\/\s*Yellow/i.test(item.name));

    /*
     * Pokémon can eventually move out of a live
     * top-50 source, so do not make its membership
     * permanent policy. When it is present, however,
     * its representative IGDB artwork must resolve.
     */
    if (pokemon) {
      expect(pokemon.image).toMatch(/^https:\/\/images\.igdb\.com\//);
    }
  });

  it('keeps Stephen King titles clean, unique, and illustrated', () => {
    const king = getCollection('stephen-king-books');

    const names = king.items.map((item) => item.name);

    expect(new Set(names).size).toBe(names.length);

    expect(king.items.every((item) => Boolean(item.image))).toBe(true);

    expect(king.items.every((item) => item.source?.provider === 'stephenking.com')).toBe(true);

    expect(names).toContain('Carrie');
    expect(names).toContain('Charlie the Choo-Choo');
    expect(names).toContain('Hansel and Gretel');
    expect(names).toContain('Other Worlds Than These');

    expect(names).not.toContain('Carrie Novel April 5th, 1974');

    expect(names.some((name) => /Gunslinger\s*\(Revised\)/i.test(name))).toBe(false);
  });

  it('keeps the requested MCU inclusions and exclusions', () => {
    const combined = getCollection('marvel-cinematic-universe');

    const names = combined.items.map((item) => item.name);

    expect(names.some((name) => /Agents of S\.H\.I\.E\.L\.D\./i.test(name))).toBe(true);

    expect(
      combined.items.some(
        (item) =>
          item.source?.provider === 'tmdb' &&
          item.source?.type === 'tv' &&
          String(item.source?.id) === '68716',
      ),
    ).toBe(true);

    expect(names.some((name) => /Punisher:\s*One Last Kill/i.test(name))).toBe(true);

    expect(names.some((name) => /^What If/i.test(name))).toBe(true);

    expect(names).toContain('Eyes of Wakanda');

    expect(names).toContain('Marvel Zombies');

    const blockedPatterns = [
      /Next Avengers:\s*Heroes of Tomorrow/i,
      /Punisher:\s*War Zone/i,
      /Hulk vs\.?\s*Thor/i,
      /Hulk vs\.?\s*Wolverine/i,
      /Spidey and His Amazing Friends/i,
      /Iron Man and His Awesome Friends/i,
      /LEGO Marvel Avengers:\s*Strange Tails/i,
      /Meet Iron Man and His Awesome Friends/i,
      /Countdown to Avengers:\s*Doomsday Official Podcast/i,
    ];

    for (const pattern of blockedPatterns) {
      expect(names.some((name) => pattern.test(name))).toBe(false);
    }
  });
});

describe('Stephen King live-markup parsing regression', () => {
  it('extracts title, date, slug, and cover independently', () => {
    const html = `
          <a
            href="/works/novel/carrie.html"
            class="row work"
            data-date="1974-04-05"
            data-sort="Carrie"
          >
            <div class="work-image-wrapper">
              <div
                class="work-image"
                style="background-image: url('/images/books/carrie/hardcover_prop_embed.jpg');"
              ></div>
            </div>

            <div class="work-content">
              <p class="works-title">
                Carrie
              </p>
              <p class="works-type">
                Novel
              </p>
              <p class="works-date">
                April 5th, 1974
              </p>
            </div>
          </a>
        `;

    const parsed = parseStephenKingWorksPage(html, 'novel');

    expect(parsed).toHaveLength(1);

    expect(parsed[0]).toMatchObject({
      title: 'Carrie',
      type: 'Novel',
      context: 'Novel',
      dateText: 'April 5th, 1974',
      releaseDate: '1974-04-05',
      year: 1974,
      slug: 'carrie',
      image: 'https://stephenking.com/images/books/carrie/hardcover_prop_embed.jpg',
    });

    const filtered = filterStephenKingBooks(parsed);

    expect(filtered).toHaveLength(1);

    expect(filtered[0]).toMatchObject({
      title: 'Carrie',
      slug: 'carrie',
      image: 'https://stephenking.com/images/books/carrie/hardcover_prop_embed.jpg',
    });
  });
});

describe('TMDB television run-label regression', () => {
  it('formats ended and ongoing TV runs correctly', () => {
    expect(
      getTvRunLabel({
        first_air_date: '2021-01-01',
        last_air_date: '2021-12-31',
        status: 'Ended',
      }),
    ).toBe('2021');

    expect(
      getTvRunLabel({
        first_air_date: '2013-01-01',
        last_air_date: '2020-12-31',
        status: 'Ended',
      }),
    ).toBe('2013\u20132020');

    expect(
      getTvRunLabel({
        first_air_date: '2017-01-01',
        status: 'Returning Series',
      }),
    ).toBe('2017\u2013');
  });
});
