import type {
  GameGenerationMode,
  GameGenerationSort,
  GenerationMediaType,
  IgdbGameType,
  TmdbGenerationMode,
  TmdbGenerationSort,
} from './types';

export type CollectionRequestContext = {
  subject: string | null;
  mediaTypes: GenerationMediaType[];
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
  mediaTypes: GenerationMediaType[];
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

export type PlannedCollectionSource = TmdbPlannedSource | IgdbPlannedSource;

export type CollectionSourcePlan = {
  kind: 'single' | 'composite';
  originalRequest: string;
  sources: PlannedCollectionSource[];
};

export type CollectionPlanningMatch = {
  provider: 'tmdb' | 'igdb';
  mediaType: GenerationMediaType;
  mode: TmdbGenerationMode | IgdbPlannedMode;
  id: number;
  name: string;
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
  mediaTypes: GenerationMediaType[];
  plan: CollectionSourcePlan;
};

export type CollectionRequestPlanningResult =
  | CollectionPlanningClarification
  | CollectionRequestPlanned;
