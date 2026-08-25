import type { RankCollection } from '@/domain/models';

export const mcuMovies: RankCollection = {
  id: 'mcu-movies',
  name: 'MCU Movies',
  description: 'Rank the MCU Movies.',
  candidateSource: {
    kind: 'embedded',
    provider: 'tmdb',
  },
  items: [
    {
      id: 'iron-man-1726',
      name: 'Iron Man',
      subtitle: '2008',
      image: 'https://image.tmdb.org/t/p/w500/78lPtwv72eTNqFW9COBYI0dWDJa.jpg',
      source: {
        provider: 'tmdb',
        id: '1726',
        type: 'movie',
      },
    },
    {
      id: 'the-incredible-hulk-1724',
      name: 'The Incredible Hulk',
      subtitle: '2008',
      image: 'https://image.tmdb.org/t/p/w500/gKzYx79y0AQTL4UAk1cBQJ3nvrm.jpg',
      source: {
        provider: 'tmdb',
        id: '1724',
        type: 'movie',
      },
    },
    {
      id: 'iron-man-2-10138',
      name: 'Iron Man 2',
      subtitle: '2010',
      image: 'https://image.tmdb.org/t/p/w500/6WBeq4fCfn7AN0o21W9qNcRF2l9.jpg',
      source: {
        provider: 'tmdb',
        id: '10138',
        type: 'movie',
      },
    },
    {
      id: 'thor-10195',
      name: 'Thor',
      subtitle: '2011',
      image: 'https://image.tmdb.org/t/p/w500/prSfAi1xGrhLQNxVSUFh61xQ4Qy.jpg',
      source: {
        provider: 'tmdb',
        id: '10195',
        type: 'movie',
      },
    },
    {
      id: 'captain-america-the-first-avenger-1771',
      name: 'Captain America: The First Avenger',
      subtitle: '2011',
      image: 'https://image.tmdb.org/t/p/w500/vSNxAJTlD0r02V9sPYpOjqDZXUK.jpg',
      source: {
        provider: 'tmdb',
        id: '1771',
        type: 'movie',
      },
    },
    {
      id: 'the-avengers-24428',
      name: 'The Avengers',
      subtitle: '2012',
      image: 'https://image.tmdb.org/t/p/w500/RYMX2wcKCBAr24UyPD7xwmjaTn.jpg',
      source: {
        provider: 'tmdb',
        id: '24428',
        type: 'movie',
      },
    },
    {
      id: 'guardians-of-the-galaxy-118340',
      name: 'Guardians of the Galaxy',
      subtitle: '2014',
      image: 'https://image.tmdb.org/t/p/w500/r7vmZjiyZw9rpJMQJdXpjgiCOk9.jpg',
      source: {
        provider: 'tmdb',
        id: '118340',
        type: 'movie',
      },
    },
    {
      id: 'captain-america-the-winter-soldier-100402',
      name: 'Captain America: The Winter Soldier',
      subtitle: '2014',
      image: 'https://image.tmdb.org/t/p/w500/tVFRpFw3xTedgPGqxW0AOI8Qhh0.jpg',
      source: {
        provider: 'tmdb',
        id: '100402',
        type: 'movie',
      },
    },
    {
      id: 'avengers-infinity-war-299536',
      name: 'Avengers: Infinity War',
      subtitle: '2018',
      image: 'https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg',
      source: {
        provider: 'tmdb',
        id: '299536',
        type: 'movie',
      },
    },
    {
      id: 'avengers-endgame-299534',
      name: 'Avengers: Endgame',
      subtitle: '2019',
      image: 'https://image.tmdb.org/t/p/w500/ulzhLuWrPK07P1YkdWQLZnQh1JL.jpg',
      source: {
        provider: 'tmdb',
        id: '299534',
        type: 'movie',
      },
    },
  ],
};
