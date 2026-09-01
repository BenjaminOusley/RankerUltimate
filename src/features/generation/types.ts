export type GenerationMediaType = 'movie' | 'tv' | 'game';

export type TmdbGenerationMode =
  | 'company'
  | 'company-features'
  | 'director'
  | 'actor'
  | 'genre';

export type GameGenerationMode = 'genre' | 'franchise' | 'platform' | 'company';

export type GenerationMode = TmdbGenerationMode | GameGenerationMode;

export type TmdbGenerationSort = 'release-asc' | 'release-desc' | 'popularity';

export type GameGenerationSort =
  | 'popular'
  | 'rating'
  | 'release-asc'
  | 'release-desc'
  | 'name';

export type GenerationSort = TmdbGenerationSort | GameGenerationSort;

export type IgdbGameType =
  | 'main-game'
  | 'remake'
  | 'remaster'
  | 'expanded-game'
  | 'standalone-expansion'
  | 'dlc-addon'
  | 'expansion'
  | 'season';

export const CORE_IGDB_GAME_TYPES: IgdbGameType[] = [
  'main-game',
  'remake',
  'remaster',
  'expanded-game',
];

export const DLC_EXPANSION_IGDB_GAME_TYPES: IgdbGameType[] = [
  'standalone-expansion',
  'dlc-addon',
  'expansion',
];

type GenerationRequestBase = {
  query: string;
  collectionId: string;
  limit: number;
};

export type TmdbGenerationRequest = GenerationRequestBase & {
  mediaType: 'movie' | 'tv';
  mode: TmdbGenerationMode;
  tmdbId: number | null;
  fromYear: number | null;
  toYear: number | null;
  sort: TmdbGenerationSort;
  minRuntime: number | null;
  excludeDocumentaries: boolean;
  includeAdult: boolean;
  language: string;
};

export type IgdbGenerationRequest = GenerationRequestBase & {
  mediaType: 'game';
  mode: GameGenerationMode;
  igdbId: number;
  sort: GameGenerationSort;
  gameTypes: IgdbGameType[];
};

export type GenerationRequest = TmdbGenerationRequest | IgdbGenerationRequest;

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

export type IgdbEntityMatch = {
  id: number;
  name: string;
  detail: string | null;
  image: string | null;
};
