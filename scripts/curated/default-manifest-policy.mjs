export const DEFAULT_MANIFEST_SCHEMA_VERSION = 1;
export const CURATED_POLICY_VERSION = 3;

export const DEFAULT_COLLECTION_IDS = Object.freeze([
  'mcu-movies',
  'mcu-tv-shows',
  'marvel-cinematic-universe',
  'christopher-nolan-movies',
  'pixar-feature-films',
  'star-wars-movies-tv',
  'disney-princess-movies',
  'top-50-best-selling-video-games',
  'stephen-king-books',
]);

export const DEFAULT_COLLECTION_DEFINITIONS = Object.freeze({
  'mcu-movies': {
    name: 'MCU Movies',
    description: 'Feature films in the Marvel Cinematic Universe.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'mcu-tv-shows': {
    name: 'MCU TV Shows',
    description:
      'Marvel Cinematic Universe television series, including the canon Defenders-era shows.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'marvel-cinematic-universe': {
    name: 'Marvel Cinematic Universe',
    description: 'MCU movies and television shows in one collection.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'christopher-nolan-movies': {
    name: 'Christopher Nolan Movies',
    description: 'Feature films directed by Christopher Nolan.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'pixar-feature-films': {
    name: 'Pixar Feature Films',
    description: 'Feature films produced by Pixar Animation Studios.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'star-wars-movies-tv': {
    name: 'Star Wars Movies & TV Shows',
    description:
      'Current-canon Star Wars movies and television series, excluding LEGO, Visions, shorts, documentaries, and Legends.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'disney-princess-movies': {
    name: 'Disney Princess Movies',
    description:
      'Disney Princess theatrical originals, theatrical sequels, direct live-action adaptations, plus Frozen and Frozen II.',
    groupId: 'movies-tv',
    rankingDomain: 'screen',
  },
  'top-50-best-selling-video-games': {
    name: 'Top 50 Best-Selling Video Games',
    description: 'The 50 best-selling video games by reported worldwide software unit sales.',
    groupId: 'games',
    rankingDomain: 'game',
  },
  'stephen-king-books': {
    name: 'Stephen King Books',
    description:
      'Stephen King novels, story collections, nonfiction books, and qualifying pseudonymous book-length works.',
    groupId: 'books',
    rankingDomain: 'book',
  },
});

export const MCU_MOVIE_POLICY = Object.freeze({
  marvelStudiosCompanyId: 420,
  firstReleaseDate: '2008-01-01',
  minimumRuntime: 60,

  excludedTmdbIds: Object.freeze([
    13056, // Punisher: War Zone
    14613, // Next Avengers: Heroes of Tomorrow
    15257, // Hulk vs. Wolverine
    101907, // Hulk vs. Thor
  ]),

  blockedTitlePatterns: Object.freeze([
    /^Punisher:\s*War Zone$/i,
    /^Next Avengers:/i,
    /^Hulk vs\.?/i,
  ]),

  // Legitimate MCU specials that normal feature-film discovery can miss,
  // such as shorter streaming/television specials.
  pinnedTitles: Object.freeze([
    {
      title: 'The Punisher: One Last Kill',
      year: 2026,
      tmdbId: 1439930,
    },
  ]),
});

export const MCU_TV_POLICY = Object.freeze({
  marvelStudiosCompanyId: 420,
  modernFirstAirDate: '2021-01-01',
  excludedTmdbIds: Object.freeze([
    127635, // Spidey and His Amazing Friends
    274388, // Iron Man and His Awesome Friends
    294895, // Meet Iron Man and His Awesome Friends
    305165, // LEGO Marvel Avengers: Strange Tails
    332379, // Countdown to Avengers: Doomsday Official Podcast
  ]),

  blockedTitlePatterns: Object.freeze([
    /\bspidey\b.*\bamazing friends\b/i,
    /\bawesome friends\b/i,
    /\blego\b/i,
    /\bpodcast\b/i,
  ]),
  legacyCanonTitles: Object.freeze([
    { title: 'Agent Carter', year: 2015, tmdbId: 61550 },
    { title: 'Daredevil', year: 2015, tmdbId: 61889 },
    { title: 'Jessica Jones', year: 2015, tmdbId: 38472 },
    { title: 'Luke Cage', year: 2016, tmdbId: 62126 },
    { title: 'Iron Fist', year: 2017, tmdbId: 62127 },
    { title: 'The Defenders', year: 2017, tmdbId: 62285 },
    { title: 'The Punisher', year: 2017, tmdbId: 67178 },
    {
      title: 'Agents of S.H.I.E.L.D.',
      year: 2013,
      tmdbId: 1403,
    },
    {
      title: 'Inhumans',
      year: 2017,
      tmdbId: 68716,
    },
  ]),
  excludedTitlePatterns: Object.freeze([
    /\bassembled\b/i,
    /\blegends\b/i,
    /\bmpower\b/i,
    /\bvoices rising\b/i,
    /^x-men '97$/i,
    /^your friendly neighborhood spider-man$/i,
    /^i am groot$/i,
  ]),
});

export const NOLAN_POLICY = Object.freeze({
  tmdbPersonId: 525,
  minimumRuntime: 60,
});

export const PIXAR_POLICY = Object.freeze({
  tmdbCompanyId: 3,
});

export const STAR_WARS_GUIDE_URL =
  'https://www.starwars.com/news/star-wars-movies-and-series-guide';

export const STAR_WARS_EXCLUDED_TITLE_PATTERNS = Object.freeze([
  /\blego\b/i,
  /\bvisions\b/i,
  /\bofficial podcast\b/i,
  /\bshorts?\b/i,
]);

export const DISNEY_PRINCESS_URL = 'https://princess.disney.com/';
export const DISNEY_WALT_DISNEY_PICTURES_COMPANY_ID = 2;
export const DISNEY_PRINCESS_REMAKE_QUERY_OVERRIDES = Object.freeze({
  'Snow White and the Seven Dwarfs': 'Snow White',
});
export const DISNEY_PRINCESS_EXCLUDED_TITLE_PATTERNS = Object.freeze([
  /\bmaleficent\b/i,
  /\bcinderella\s+(?:ii|iii)\b/i,
  /\blittle mermaid\s+ii\b/i,
  /\breturn to the sea\b/i,
  /\bmulan\s+ii\b/i,
  /\bpocahontas\s+ii\b/i,
  /\belle'?s magical world\b/i,
  /\benchanted christmas\b/i,
]);

export const STEPHEN_KING_SOURCE_PAGES = Object.freeze([
  {
    url: 'https://stephenking.com/works/novel/grid.html',
    category: 'novel',
  },
  {
    url: 'https://stephenking.com/works/collection/grid.html',
    category: 'collection',
  },
  {
    url: 'https://stephenking.com/works/nonfiction/grid.html',
    category: 'nonfiction',
  },
  {
    url: 'https://stephenking.com/works/other-project/grid.html',
    category: 'other-project',
  },
]);

export const STEPHEN_KING_INCLUDED_OTHER_PROJECTS = new Set([
  'Charlie the Choo-Choo',
  'Hansel and Gretel',
]);

export const STEPHEN_KING_EXCLUDED_TITLE_PATTERNS = Object.freeze([
  /\billustrated edition\b/i,
  /\blimited edition\b/i,
  /\bboxed set\b/i,
  /\bconcordance\b/i,
]);

export const BEST_SELLING_GAMES_URL =
  'https://en.wikipedia.org/wiki/List_of_best-selling_video_games';

export const REPO_IGNORE_ENTRIES = Object.freeze([
  'RankerUltimate-source*.txt',
  'scripts/provider-spikes/',
  '**/*spike*-results.*',
]);
