import { describe, expect, it } from 'vitest';

import type { RankItem } from '@/models';

import { applyRefinementChoice } from './refinement';

function makeItems(count: number): RankItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    name: `Item ${index}`,
  }));
}

describe('refinement', () => {
  it('moves a lower-ranked winner directly above the item it beat', () => {
    const ranked = makeItems(5);

    const next = applyRefinementChoice(ranked, { firstId: '1', secondId: '3' }, '3');

    expect(next.map((item) => item.id)).toEqual(['0', '3', '1', '2', '4']);
  });
});
