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

export type RankCollection = {
  id: string;
  name: string;
  description?: string;
  items: RankItem[];
};
