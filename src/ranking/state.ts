import type { RankItem } from '../models';

export type RankingState = {
  ranked: RankItem[];
  remaining: RankItem[];
  current: RankItem | null;
  low: number;
  high: number;
  comparisons: number;
};
