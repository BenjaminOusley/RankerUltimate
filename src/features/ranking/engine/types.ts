import type { RankItem } from '@/domain/models';

export type ComparisonPhase = 'ranking' | 'validation' | 'repair' | 'refinement';

export type ComparisonOutcome = {
  winnerId: string;
  loserId: string;
  phase: ComparisonPhase;
};

export type ValidationPair = {
  upperId: string;
  lowerId: string;
  upperIndex: number;
  lowerIndex: number;
};

export type RankingMode = 'insert' | 'validation' | 'repair';

export type RankingState = {
  ranked: RankItem[];
  remaining: RankItem[];
  current: RankItem | null;
  low: number;
  high: number;
  comparisons: number;
  outcomes: ComparisonOutcome[];
  mode: RankingMode;
  validationPair: ValidationPair | null;
  validationChecked: boolean;
};

export type RefinementPair = {
  firstId: string;
  secondId: string;
};
