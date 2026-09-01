import { describe, expect, it } from 'vitest';

import { planCollectionRequest } from './collection-request-planner.mjs';
import {
  extractCollectionRequestSubject,
  resolveCollectionRequestTurn,
} from './collection-request-resolver.mjs';

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
        includeDlcExpansions: true,
      },
    });
  });
});
