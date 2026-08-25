export type ItemSource = {
  provider: string;
  id: string;
  type?: string;
};

export type RankItem = {
  id: string;
  name: string;
  subtitle?: string;
  image?: string;
  source?: ItemSource;
};

export type CollectionCandidateSource =
  | {
      kind: 'embedded';
      provider?: string;
    }
  | {
      kind: 'generated';
      provider: string;
      originalRequest?: string;
      definition: Record<string, unknown>;
    }
  | {
      kind: 'custom';
    };

export type RankCollection = {
  id: string;
  name: string;
  description?: string;
  items: RankItem[];
  candidateSource?: CollectionCandidateSource;
};
