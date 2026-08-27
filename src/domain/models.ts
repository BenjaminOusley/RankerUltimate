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

export type GeneratedCollectionSource = {
  kind: 'generated';
  provider: string;
  originalRequest?: string;
  definition: Record<string, unknown>;
};

export type CompositeCollectionSource = {
  kind: 'composite';
  originalRequest?: string;
  sources: GeneratedCollectionSource[];
};

export type RefreshableCollectionSource =
  | GeneratedCollectionSource
  | CompositeCollectionSource;

export type CollectionCandidateSource =
  | {
      kind: 'embedded';
      provider?: string;
    }
  | RefreshableCollectionSource
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
