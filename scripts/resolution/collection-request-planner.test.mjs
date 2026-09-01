import { describe, expect, it } from 'vitest';

import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
} from '../providers/igdb.mjs';
import { planCollectionRequest } from './collection-request-planner.mjs';

function createFakeTmdb() {
  return {
    async getMovieGenres() {
      return [
        { id: 27, name: 'Horror' },
        { id: 18, name: 'Drama' },
      ];
    },
    async getTvGenres() {
      return [
        { id: 18, name: 'Drama' },
        { id: 10765, name: 'Sci-Fi & Fantasy' },
      ];
    },
    async searchCompany(query) {
      if (query.toLowerCase() === 'pixar') {
        return [{ id: 3, name: 'Pixar' }];
      }

      if (query.toLowerCase() === 'acme') {
        return [{ id: 10, name: 'Acme' }];
      }

      return [];
    },
    async searchPerson(query) {
      if (query.toLowerCase() === 'christopher nolan') {
        return [
          {
            id: 525,
            name: 'Christopher Nolan',
            known_for_department: 'Directing',
          },
        ];
      }

      if (query.toLowerCase() === 'ryan gosling') {
        return [
          {
            id: 30614,
            name: 'Ryan Gosling',
            known_for_department: 'Acting',
          },
        ];
      }

      if (query.toLowerCase() === 'acme') {
        return [
          {
            id: 99,
            name: 'Acme',
            known_for_department: 'Acting',
          },
        ];
      }

      return [];
    },
  };
}

function createFakeIgdb() {
  return {
    async searchGenres(query) {
      return query.toLowerCase() === 'shooter' ? [{ id: 5, name: 'Shooter' }] : [];
    },
    async searchFranchises(query) {
      if (/halo/iu.test(query)) {
        return [{ id: 100, name: 'Halo' }];
      }

      if (/mario/iu.test(query)) {
        return [{ id: 200, name: 'Mario' }];
      }

      return [];
    },
    async searchPlatforms(query) {
      if (/playstation 2/iu.test(query)) {
        return [{ id: 8, name: 'PlayStation 2', abbreviation: 'PS2' }];
      }

      if (query.toLowerCase() === 'nintendo') {
        return [
          { id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
          { id: 4, name: 'Nintendo 64', abbreviation: 'N64' },
        ];
      }

      return [];
    },
    async searchCompanies(query) {
      if (/nintendo/iu.test(query)) {
        return [{ id: 70, name: 'Nintendo' }];
      }

      return [];
    },
  };
}

function ready(subject, mediaTypes, requestText = `${subject} ${mediaTypes.join(' ')}`) {
  return {
    requestText,
    subject,
    mediaTypes,
  };
}

describe('collection request planner', () => {
  it('plans a game franchise from an exact IGDB match', async () => {
    const result = await planCollectionRequest({
      request: ready('Halo', ['game'], 'Halo games'),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.kind).toBe('single');
    expect(result.plan.sources[0]).toMatchObject({
      provider: 'igdb',
      mediaType: 'game',
      mode: 'franchise',
      query: 'Halo',
      resolvedId: 100,
      resolvedName: 'Halo',
      parameters: {
        sort: 'popular',
        gameTypes: [...CORE_IGDB_GAME_TYPES],
      },
    });
  });

  it('understands a free-form popularity + plural genre request', async () => {
    const result = await planCollectionRequest({
      request: ready(
        'the most popular shooters',
        ['game'],
        'the most popular shooters',
      ),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.sources[0]).toMatchObject({
      mode: 'genre',
      resolvedName: 'Shooter',
      parameters: {
        sort: 'popular',
      },
    });
  });


  it('uses an explicit conversational item count instead of the default 50', async () => {
    const result = await planCollectionRequest({
      request: ready('top 100 Mario', ['game'], 'top 100 Mario games'),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.sources[0]).toMatchObject({
      mode: 'franchise',
      resolvedName: 'Mario',
      parameters: {
        limit: 100,
        sort: 'popular',
      },
    });
  });

  it('understands an explicit DLC / expansion inclusion modifier', async () => {
    const result = await planCollectionRequest({
      request: ready(
        'top 100 Halo including DLC and expansions',
        ['game'],
        'top 100 Halo games including DLC and expansions',
      ),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.sources[0]).toMatchObject({
      mode: 'franchise',
      resolvedName: 'Halo',
      parameters: {
        limit: 100,
        gameTypes: [
          ...CORE_IGDB_GAME_TYPES,
          ...DLC_EXPANSION_IGDB_GAME_TYPES,
        ],
      },
    });
  });

  it('asks for a smaller count when a conversational request exceeds the current collection cap', async () => {
    const result = await planCollectionRequest({
      request: ready('top 300 Halo', ['game'], 'top 300 Halo games'),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('clarification');
    expect(result.reason).toBe('unsupported-limit');
    expect(result.question).toContain('250');
  });

  it('applies conversational item counts to TMDB sources too', async () => {
    const result = await planCollectionRequest({
      request: ready('top 25 Horror', ['movie'], 'top 25 horror movies'),
      tmdb: createFakeTmdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.sources[0]).toMatchObject({
      provider: 'tmdb',
      mode: 'genre',
      resolvedName: 'Horror',
      parameters: {
        limit: 25,
      },
    });
  });

  it('plans exact IGDB platform and company requests', async () => {
    const platform = await planCollectionRequest({
      request: ready('PlayStation 2', ['game'], 'PlayStation 2 games'),
      igdb: createFakeIgdb(),
    });

    expect(platform.status).toBe('planned');
    expect(platform.plan.sources[0].mode).toBe('platform');

    const company = await planCollectionRequest({
      request: ready('Nintendo company', ['game'], 'Nintendo company games'),
      igdb: createFakeIgdb(),
    });

    expect(company.status).toBe('planned');
    expect(company.plan.sources[0]).toMatchObject({
      mode: 'company',
      resolvedName: 'Nintendo',
    });
  });

  it('asks whether a company brand means the company or one of its platforms', async () => {
    const result = await planCollectionRequest({
      request: ready('Nintendo', ['game'], 'Nintendo games'),
      igdb: createFakeIgdb(),
    });

    expect(result.status).toBe('clarification');
    expect(result.reason).toBe('ambiguous-entity');
    expect(result.question).toContain('game company');
    expect(result.examples).toContain('Nintendo company');
    expect(result.examples).toContain('Nintendo Switch platform');
    expect(result.matches.map((match) => match.mode)).toContain('company');
    expect(result.matches.map((match) => match.mode)).toContain('platform');
  });

  it('plans TMDB genres, companies, directors, and actors', async () => {
    const tmdb = createFakeTmdb();

    const horror = await planCollectionRequest({
      request: ready('Horror', ['movie'], 'Horror movies'),
      tmdb,
    });
    expect(horror.status).toBe('planned');
    expect(horror.plan.sources[0]).toMatchObject({
      provider: 'tmdb',
      mode: 'genre',
      resolvedId: 27,
    });

    const pixar = await planCollectionRequest({
      request: ready('Pixar', ['movie'], 'Pixar movies'),
      tmdb,
    });
    expect(pixar.status).toBe('planned');
    expect(pixar.plan.sources[0]).toMatchObject({
      mode: 'company',
      resolvedId: 3,
    });

    const nolan = await planCollectionRequest({
      request: ready('Christopher Nolan', ['movie'], 'Christopher Nolan movies'),
      tmdb,
    });
    expect(nolan.status).toBe('planned');
    expect(nolan.plan.sources[0]).toMatchObject({
      mode: 'director',
      resolvedId: 525,
    });

    const gosling = await planCollectionRequest({
      request: ready('Ryan Gosling', ['movie'], 'Ryan Gosling movies'),
      tmdb,
    });
    expect(gosling.status).toBe('planned');
    expect(gosling.plan.sources[0]).toMatchObject({
      mode: 'actor',
      resolvedId: 30614,
    });
  });

  it('preserves explicit feature-film intent as company-features', async () => {
    const result = await planCollectionRequest({
      request: ready('Pixar', ['movie'], 'Pixar feature films'),
      tmdb: createFakeTmdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.sources[0].mode).toBe('company-features');
  });

  it('builds a composite plan when every requested media type resolves', async () => {
    const result = await planCollectionRequest({
      request: ready('Pixar', ['movie', 'tv'], 'Pixar movies and TV shows'),
      tmdb: createFakeTmdb(),
    });

    expect(result.status).toBe('planned');
    expect(result.plan.kind).toBe('composite');
    expect(result.plan.sources).toHaveLength(2);
    expect(result.plan.sources.map((source) => source.mediaType)).toEqual([
      'movie',
      'tv',
    ]);
    expect(result.plan.sources.every((source) => source.mode === 'company')).toBe(true);
  });

  it('asks for clarification instead of inventing an unsupported provider mapping', async () => {
    const result = await planCollectionRequest({
      request: ready('MCU', ['movie', 'tv'], 'MCU movies and TV shows'),
      tmdb: createFakeTmdb(),
    });

    expect(result.status).toBe('clarification');
    expect(result.reason).toBe('unresolved-entity');
    expect(result.question).toContain('MCU');
  });

  it('asks for clarification when TMDB has multiple exact plausible entity types', async () => {
    const result = await planCollectionRequest({
      request: ready('Acme', ['movie'], 'Acme movies'),
      tmdb: createFakeTmdb(),
    });

    expect(result.status).toBe('clarification');
    expect(result.reason).toBe('ambiguous-entity');
    expect(result.matches.map((match) => match.mode).sort()).toEqual(['actor', 'company']);
  });
});
