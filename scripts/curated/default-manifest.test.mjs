import { describe, expect, it } from 'vitest';

import { validateDefaultManifest } from './default-manifest-validator.mjs';
import { MCU_TV_POLICY } from './default-manifest-policy.mjs';
import {
  filterStephenKingBooks,
  getStarWarsTmdbSearchTitles,
  parseBestSellingGames,
  parseDisneyPrincessFilms,
  parseStarWarsGuide,
  parseStephenKingWorksPage,
} from './official-source-parsers.mjs';

function collection(id, name, groupId, rankingDomain, items) {
  return { id, name, description: name, groupId, rankingDomain, items };
}

function item(name, provider, id, type = 'item', subtitle = '2020') {
  return {
    id: `${provider}-${id}`,
    name,
    subtitle,
    source: { provider, id: String(id), type },
  };
}

describe('curated default identity policy', () => {
  it('pins legacy MCU television entries to stable TMDB series IDs', () => {
    expect(MCU_TV_POLICY.legacyCanonTitles).toEqual([
      { title: 'Agent Carter', year: 2015, tmdbId: 61550 },
      { title: 'Daredevil', year: 2015, tmdbId: 61889 },
      { title: 'Jessica Jones', year: 2015, tmdbId: 38472 },
      { title: 'Luke Cage', year: 2016, tmdbId: 62126 },
      { title: 'Iron Fist', year: 2017, tmdbId: 62127 },
      { title: 'The Defenders', year: 2017, tmdbId: 62285 },
      { title: 'The Punisher', year: 2017, tmdbId: 67178 },
      { title: 'Agents of S.H.I.E.L.D.', year: 2013, tmdbId: 1403 },
      { title: 'Inhumans', year: 2017, tmdbId: 68716 },
    ]);
  });
});

describe('official curated source parsers', () => {
  it('builds resilient TMDB search aliases for official episodic Star Wars titles', () => {
    expect(getStarWarsTmdbSearchTitles('Star Wars: A New Hope (Episode IV)')).toContain(
      'Star Wars',
    );
    expect(getStarWarsTmdbSearchTitles('Star Wars: The Phantom Menace (Episode I)')).toContain(
      'Star Wars: Episode I - The Phantom Menace',
    );
    expect(getStarWarsTmdbSearchTitles('Star Wars: The Force Awakens (Episode VII)')).toContain(
      'Star Wars: The Force Awakens',
    );
  });

  it('extracts Star Wars release-order entries and canon animated series while excluding LEGO and Visions', () => {
    const html = `
      <h2>Release Order</h2>
      <ul>
        <li>Star Wars: A New Hope (Episode IV) (1977)</li>
        <li>Star Wars: The Clone Wars (movie, 2008)</li>
        <li>Star Wars: The Clone Wars (series, 2008)</li>
        <li>The Mandalorian (2019)</li>
        <li>Star Wars: Maul – Shadow Lord (2026)</li>
        ${Array.from({ length: 16 }, (_, index) => `<li>Star Wars Test ${index + 1} (${2000 + index})</li>`).join('')}
      </ul>
      <h2>Chronological Order</h2>
      <h2>Animated Series</h2>
      <ul>
        <li>Star Wars: Young Jedi Adventures</li>
        <li>Star Wars: Visions</li>
        <li>LEGO Star Wars: Rebuild the Galaxy</li>
      </ul>
      <h2>Specials</h2>
    `;

    const entries = parseStarWarsGuide(html);

    expect(entries.some((entry) => entry.title === 'Star Wars: Young Jedi Adventures')).toBe(true);
    expect(entries.filter((entry) => entry.title === 'Star Wars: The Clone Wars')).toHaveLength(2);
    expect(entries.some((entry) => /LEGO|Visions/i.test(entry.title))).toBe(false);
  });

  it('extracts the official Disney Princess film section without swallowing surrounding content', () => {
    const titles = [
      'Moana 2',
      'Raya and the Last Dragon',
      'Beauty and the Beast',
      'The Princess and the Frog',
      'Mulan',
      'Moana',
      'Snow White and the Seven Dwarfs',
      'Tangled',
      'Cinderella (1950)',
      'The Little Mermaid',
      'Brave',
      'Pocahontas',
      'Aladdin',
      'Sleeping Beauty (1959)',
    ];
    const html = `
      <h2>Discover (And Rediscover) Your Favorite Princess Films</h2>
      <div>${titles.map((title) => `<a>${title}</a><br>`).join('')}</div>
      <h2>What’s Trending</h2>
      <a>LEGO Princess Special</a>
    `;

    const entries = parseDisneyPrincessFilms(html);

    expect(entries).toHaveLength(14);
    expect(entries.find((entry) => entry.title === 'Cinderella')?.year).toBe(1950);
    expect(entries.some((entry) => /LEGO/i.test(entry.title))).toBe(false);
  });

  it('keeps King book-level works and removes editions and novella-only entries', () => {
    const html = `
      <a href="/works/novel/carrie.html">Carrie</a><span>Novel</span><time>April 5th, 1974</time>
      <a href="/works/novel/rage.html">Rage</a><span>Bachman Novel</span><time>December 1976</time>
      <a href="/works/novel/the-body.html">The Body</a><span>Novella</span><time>August 1982</time>
      <a href="/works/novel/salems-lot-illustrated-edition.html">'Salem's Lot Illustrated Edition</a><span>Novel</span><time>2005</time>
    `;

    const parsed = parseStephenKingWorksPage(html, 'novel');
    const books = filterStephenKingBooks(parsed);

    expect(books.map((work) => work.title)).toEqual(['Carrie', 'Rage']);
  });

  it('parses a 50-row reported-sales table, keeps source order, and strips citation markup from titles', () => {
    const rows = Array.from({ length: 50 }, (_, index) => {
      const sales = 100 - index;
      const title =
        index === 0
          ? 'Wii Sports {{cite web |url=https://example.com |title=Example}}</ref> citation junk'
          : `Game ${index + 1}`;

      return `<tr><td>${index + 1}</td><td>${title}</td><td>${sales}</td><td>Series</td><td>Multi-platform</td><td>${2000 + (index % 20)}</td><td>Dev</td><td>Pub</td><td>Ref</td></tr>`;
    }).join('');

    const html = `<table class="wikitable"><tr><th>Rank</th><th>Title</th><th>Sales</th></tr>${rows}</table>`;

    const parsed = parseBestSellingGames(html);

    expect(parsed).toHaveLength(50);
    expect(parsed[0]).toMatchObject({
      title: 'Wii Sports',
      salesMillions: 100,
    });
    expect(parsed[1]).toMatchObject({
      title: 'Game 2',
      salesMillions: 99,
    });
    expect(parsed[49]).toMatchObject({
      title: 'Game 50',
      salesMillions: 51,
    });
  });
});

describe('curated default manifest validation', () => {
  it('accepts a structurally safe nine-collection manifest and rejects destructive changes', () => {
    const many = (count, provider, type) =>
      Array.from({ length: count }, (_, index) => item(`Item ${index}`, provider, index, type));
    const mcuMovies = many(30, 'tmdb', 'movie');
    const mcuTv = many(12, 'tmdbtv', 'tv');
    const topGames = Array.from({ length: 50 }, (_, index) =>
      item(`Game ${index}`, 'reported-sales', index, 'game', `${100 - index}M sold • 2020`),
    );
    const manifest = {
      schemaVersion: 1,
      policyVersion: 3,
      generatedAt: '2026-09-13T00:00:00.000Z',
      sources: [],
      collections: [
        collection('mcu-movies', 'MCU Movies', 'movies-tv', 'screen', mcuMovies),
        collection('mcu-tv-shows', 'MCU TV Shows', 'movies-tv', 'screen', mcuTv),
        collection(
          'marvel-cinematic-universe',
          'Marvel Cinematic Universe',
          'movies-tv',
          'screen',
          [...mcuMovies, ...mcuTv],
        ),
        collection(
          'christopher-nolan-movies',
          'Christopher Nolan Movies',
          'movies-tv',
          'screen',
          many(10, 'nolan', 'movie'),
        ),
        collection(
          'pixar-feature-films',
          'Pixar Feature Films',
          'movies-tv',
          'screen',
          many(25, 'pixar', 'movie'),
        ),
        collection(
          'star-wars-movies-tv',
          'Star Wars Movies & TV Shows',
          'movies-tv',
          'screen',
          many(20, 'starwars', 'movie'),
        ),
        collection(
          'disney-princess-movies',
          'Disney Princess Movies',
          'movies-tv',
          'screen',
          many(14, 'disney', 'movie'),
        ),
        collection(
          'top-50-best-selling-video-games',
          'Top 50 Best-Selling Video Games',
          'games',
          'game',
          topGames,
        ),
        collection(
          'stephen-king-books',
          'Stephen King Books',
          'books',
          'book',
          many(40, 'king', 'book'),
        ),
      ],
    };

    expect(validateDefaultManifest(manifest)).toEqual([]);

    const destructive = structuredClone(manifest);
    destructive.collections.find((entry) => entry.id === 'pixar-feature-films').items = many(
      10,
      'pixar',
      'movie',
    );
    expect(
      validateDefaultManifest(destructive, { previousManifest: manifest }).some((error) =>
        /pixar-feature-films.*dropped/i.test(error),
      ),
    ).toBe(true);
  });
});
