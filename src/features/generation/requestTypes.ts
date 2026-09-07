import type {
  GameGenerationMode,
  GameGenerationSort,
  GenerationMediaType,
  IgdbGameType,
  TmdbGenerationMode,
  TmdbGenerationSort,
} from './types';

export type CollectionRequestMediaType = GenerationMediaType | 'book';

export type CollectionRequestContext = {
  subject: string | null;
  mediaTypes: CollectionRequestMediaType[];
};

export type CollectionRequestClarification = {
  status: 'clarification';
  question: string;
  examples: string[];
  context: CollectionRequestContext;
};

export type CollectionRequestReadyForPlanning = {
  status: 'ready-for-planning';
  requestText: string;
  subject: string;
  mediaTypes: CollectionRequestMediaType[];
  context: CollectionRequestContext;
};

export type CollectionRequestResolution =
  | CollectionRequestClarification
  | CollectionRequestReadyForPlanning;

export type TmdbPlannedSource = {
  provider: 'tmdb';
  mediaType: 'movie' | 'tv';
  mode: TmdbGenerationMode;
  query: string;
  resolvedId: number;
  resolvedName: string;
  parameters: {
    limit: number;
    sort: TmdbGenerationSort;
    fromYear: number | null;
    toYear: number | null;
    minRuntime: number | null;
    excludeDocumentaries: boolean;
    includeAdult: boolean;
    language: string;
  };
};

export type IgdbPlannedMode = GameGenerationMode | 'parent-game';

export type IgdbPlannedSource = {
  provider: 'igdb';
  mediaType: 'game';
  mode: IgdbPlannedMode;
  query: string;
  resolvedId: number;
  resolvedName: string;
  parameters: {
    limit: number;
    sort: GameGenerationSort;
    gameTypes: IgdbGameType[];
  };
};

export type BookPlannedMode = 'series' | 'author' | 'author-series' | 'tag-books' | 'tag-series';
export type BookGenerationSort =
  | 'series-order'
  | 'popular'
  | 'rating'
  | 'release-asc'
  | 'release-desc'
  | 'name';

export type HardcoverPlannedSource = {
  provider: 'hardcover';
  mediaType: 'book';
  mode: BookPlannedMode;
  query: string;
  resolvedId: number;
  resolvedName: string;
  parameters: {
    limit: number;
    sort: BookGenerationSort;
    tagSlug?: string;
    tagCategorySlug?: string;
    semanticCategory?: string;
    tagSources?: Array<{
      id: number;
      slug: string;
      categorySlug: string;
      weight: number;
      qualifies?: boolean;
    }>;
    candidateLimit?: number;
  };
};

export type PlannedCollectionSource =
  | TmdbPlannedSource
  | IgdbPlannedSource
  | HardcoverPlannedSource;

export type CollectionSourcePlan = {
  kind: 'single' | 'composite';
  originalRequest: string;
  sources: PlannedCollectionSource[];
};

export type CollectionPlanningMatch = {
  provider: 'tmdb' | 'igdb' | 'hardcover';
  mediaType: CollectionRequestMediaType;
  mode: TmdbGenerationMode | IgdbPlannedMode | BookPlannedMode;
  id: number;
  name: string;
  authorName?: string;
  limit?: number;
};

export type CollectionPlanningClarification = {
  status: 'clarification';
  reason: 'ambiguous-entity' | 'unresolved-entity' | 'unsupported-limit';
  question: string;
  examples: string[];
  matches: CollectionPlanningMatch[];
  context: CollectionRequestContext;
};

export type CollectionRequestPlanned = {
  status: 'planned';
  requestText: string;
  subject: string;
  mediaTypes: CollectionRequestMediaType[];
  plan: CollectionSourcePlan;
};

export type CollectionRequestPlanningResult =
  | CollectionPlanningClarification
  | CollectionRequestPlanned;
