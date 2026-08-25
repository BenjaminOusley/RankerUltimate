import { describe, expect, it } from 'vitest';

import type { RankItem } from './models';
import { getCanonicalItemKey, getLegacyItemKeys } from './itemIdentity';

describe('item identity', () => {
  it('uses provider, source type, and provider ID for sourced items', () => {
    const item: RankItem = {
      id: 'toy-story-862',
      name: 'Toy Story',
      source: {
        provider: 'tmdb',
        type: 'movie',
        id: '862',
      },
    };

    expect(getCanonicalItemKey(item)).toBe('tmdb:movie:862');
  });

  it('uses the local item ID when no external source exists', () => {
    const item: RankItem = {
      id: 'hades',
      name: 'Hades',
    };

    expect(getCanonicalItemKey(item)).toBe('local:hades');
  });

  it('recognizes the broken legacy object-string key for migration', () => {
    const item: RankItem = {
      id: 'toy-story-862',
      name: 'Toy Story',
      source: {
        provider: 'tmdb',
        type: 'movie',
        id: '862',
      },
    };

    expect(getLegacyItemKeys(item)).toContain('[object Object]:toy-story-862');
  });
});
