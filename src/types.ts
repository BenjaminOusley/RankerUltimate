export type RankItem = {
  id: string;
  name: string;
  subtitle?: string;
  image?: string;
  tmdbId?: number;
};

export type RankCollection = {
  id: string;
  name: string;
  description?: string;
  items: RankItem[];
};
