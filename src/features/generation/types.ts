export type GenerationMode = 'company' | 'company-features' | 'director' | 'actor' | 'genre';

export type GenerationSort = 'release-asc' | 'release-desc' | 'popularity';

export type GenerationRequest = {
  mode: GenerationMode;
  query: string;
  collectionId: string;
  limit: number;
  tmdbId: number | null;
  fromYear: number | null;
  toYear: number | null;
  sort: GenerationSort;
  minRuntime: number | null;
  excludeDocumentaries: boolean;
  includeAdult: boolean;
  language: string;
};

export type PersonGenerationMode = 'director' | 'actor';

export type PersonMatch = {
  id: number;
  name: string;
  department: string;
  knownFor: string[];
};

export type CompanyGenerationMode = 'company' | 'company-features';

export type CompanyMatch = {
  id: number;
  name: string;
  originCountry: string | null;
  logo: string | null;
};
