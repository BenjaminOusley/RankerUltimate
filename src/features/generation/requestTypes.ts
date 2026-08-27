import type { GenerationMediaType } from './types';

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
