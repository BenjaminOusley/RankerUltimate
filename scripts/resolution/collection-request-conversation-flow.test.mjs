import { describe, expect, it } from 'vitest';

import {
  CORE_IGDB_GAME_TYPES,
  DLC_EXPANSION_IGDB_GAME_TYPES,
} from '../providers/igdb.mjs';
import { planCollectionRequest } from './collection-request-planner.mjs';
import {
  extractCollectionRequestSubject,
  resolveCollectionRequestTurn,
} from './collection-request-resolver.mjs';

function createFakeTmdb() {
  return {
    async getMovieGenres() {
      return [];
    },
    async getTvGenres() {
      return [];
    },
    async searchCompany() {
      return [];
    },
    async searchPerson(query) {
      if (query.toLowerCase() !== 'peter jackson') {
        return [];
      }

      return [
        {
          id: 108,
          name: 'Peter Jackson',
          known_for_department: 'Directing',
        },
        {
          id: 880108,
          name: 'Peter Jackson',
          known_for_department: 'Directing',
        },
        {
          id: 990108,
          name: 'Peter Jackson',
          known_for_department: 'Acting',
        },
      ];
    },
  };
}

function createFakeIgdb() {
  return {
    async searchGenres() {
      return [];
    },
    async searchFranchises(query) {
      return query.toLowerCase() === 'halo'
        ? [{ id: 100, name: 'Halo' }]
        : [];
    },
    async searchPlatforms() {
      return [];
    },
    async searchCompanies() {
      return [];
    },
  };
}

describe('conversational collection request flow', () => {
  it('preserves internal conjunctions that belong to collection modifiers', () => {
    expect(
      extractCollectionRequestSubject(
        'top 100 Halo games including DLC and expansions',
      ),
    ).toBe('top 100 Halo including DLC and expansions');

    expect(extractCollectionRequestSubject('Dungeons and Dragons games')).toBe(
      'Dungeons and Dragons',
    );
  });

  it('still removes dangling media conjunctions after media words are stripped', () => {
    expect(
      extractCollectionRequestSubject('movies and TV shows from Star Wars'),
    ).toBe('Star Wars');

    expect(extractCollectionRequestSubject('Halo games and movies')).toBe('Halo');
  });

  it('carries a selected person role through the next conversational turn', async () => {
    const firstResolution = resolveCollectionRequestTurn({
      text: 'Peter Jackson movies',
    });

    expect(firstResolution.ok).toBe(true);
    expect(firstResolution.result.status).toBe('ready-for-planning');

    const firstPlan = await planCollectionRequest({
      request: firstResolution.result,
      tmdb: createFakeTmdb(),
    });

    expect(firstPlan.status).toBe('clarification');
    expect(firstPlan.examples).toContain('Peter Jackson director');

    const secondResolution = resolveCollectionRequestTurn({
      text: 'Peter Jackson director',
      context: firstPlan.context,
    });

    expect(secondResolution).toMatchObject({
      ok: true,
      result: {
        status: 'ready-for-planning',
        subject: 'Peter Jackson',
        requestText: 'Peter Jackson director',
        mediaTypes: ['movie'],
      },
    });

    const secondPlan = await planCollectionRequest({
      request: secondResolution.result,
      tmdb: createFakeTmdb(),
    });

    expect(secondPlan).toMatchObject({
      status: 'planned',
      plan: {
        sources: [
          {
            provider: 'tmdb',
            mediaType: 'movie',
            mode: 'director',
            query: 'Peter Jackson',
            resolvedId: 108,
          },
        ],
      },
    });
  });

  it('preserves DLC/expansion intent from resolver through planner', async () => {
    const resolution = resolveCollectionRequestTurn({
      text: 'top 100 Halo games including DLC and expansions',
    });

    expect(resolution.ok).toBe(true);
    expect(resolution.result).toMatchObject({
      status: 'ready-for-planning',
      requestText: 'top 100 Halo games including DLC and expansions',
      subject: 'top 100 Halo including DLC and expansions',
      mediaTypes: ['game'],
    });

    const planned = await planCollectionRequest({
      request: resolution.result,
      igdb: createFakeIgdb(),
    });

    expect(planned.status).toBe('planned');
    expect(planned.plan.sources[0]).toMatchObject({
      provider: 'igdb',
      mediaType: 'game',
      mode: 'franchise',
      query: 'Halo',
      resolvedId: 100,
      resolvedName: 'Halo',
      parameters: {
        limit: 100,
        sort: 'popular',
        gameTypes: [
          ...CORE_IGDB_GAME_TYPES,
          ...DLC_EXPANSION_IGDB_GAME_TYPES,
        ],
      },
    });
  });
});

