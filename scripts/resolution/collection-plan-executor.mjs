import { generateIgdbCollection, validateIgdbGenerationRequest } from '../generation/igdb-generator.mjs';
import { generateTmdbCollection } from '../generation/tmdb-generator.mjs';
import { validateGenerationRequest } from '../generation/validation.mjs';

const MAX_PLAN_SOURCES = 20;
const SUPPORTED_PROVIDERS = new Set(['tmdb', 'igdb']);

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, label, maximum = 500) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) {
    throw new Error(`${label} must contain between 1 and ${maximum} characters.`);
  }

  return value.trim();
}

function validateCollectionId(collectionId) {
  if (
    typeof collectionId !== 'string' ||
    collectionId.length === 0 ||
    collectionId.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collectionId)
  ) {
    throw new Error('Collection execution ID must be a lowercase slug.');
  }

  return collectionId;
}

function validatePlannedRequest(plannedRequest) {
  if (!isObject(plannedRequest) || plannedRequest.status !== 'planned') {
    throw new Error('Collection execution requires a planned collection request.');
  }

  const requestText = requireString(plannedRequest.requestText, 'Planned request text');
  const subject = requireString(plannedRequest.subject, 'Planned request subject', 300);
  const plan = plannedRequest.plan;

  if (!isObject(plan) || (plan.kind !== 'single' && plan.kind !== 'composite')) {
    throw new Error('Collection execution plan must be single or composite.');
  }

  const originalRequest = requireString(
    plan.originalRequest ?? requestText,
    'Collection plan original request',
  );

  if (!Array.isArray(plan.sources) || plan.sources.length === 0) {
    throw new Error('Collection execution plan requires at least one source.');
  }

  if (plan.sources.length > MAX_PLAN_SOURCES) {
    throw new Error(`Collection execution plan cannot contain more than ${MAX_PLAN_SOURCES} sources.`);
  }

  if (plan.kind === 'single' && plan.sources.length !== 1) {
    throw new Error('A single collection execution plan must contain exactly one source.');
  }

  if (plan.kind === 'composite' && plan.sources.length < 2) {
    throw new Error('A composite collection execution plan must contain at least two sources.');
  }

  for (const source of plan.sources) {
    if (!isObject(source) || !SUPPORTED_PROVIDERS.has(source.provider)) {
      throw new Error('Collection execution plan contains an unsupported provider.');
    }
  }

  return {
    ...plannedRequest,
    requestText,
    subject,
    plan: {
      ...plan,
      originalRequest,
    },
  };
}

export function buildGenerationRequestFromPlannedSource(source, collectionId) {
  validateCollectionId(collectionId);

  if (!isObject(source)) {
    throw new Error('Planned collection source must be an object.');
  }

  if (source.provider === 'tmdb') {
    if (source.mediaType !== 'movie' && source.mediaType !== 'tv') {
      throw new Error('TMDB planned source must target movies or TV.');
    }

    if (!isObject(source.parameters)) {
      throw new Error('TMDB planned source is missing generation parameters.');
    }

    const validation = validateGenerationRequest({
      mediaType: source.mediaType,
      mode: source.mode,
      query: source.query,
      collectionId,
      limit: source.parameters.limit,
      tmdbId: source.resolvedId,
      fromYear: source.parameters.fromYear,
      toYear: source.parameters.toYear,
      sort: source.parameters.sort,
      minRuntime: source.parameters.minRuntime,
      excludeDocumentaries: source.parameters.excludeDocumentaries,
      includeAdult: source.parameters.includeAdult,
      language: source.parameters.language,
    });

    if (!validation.ok) {
      throw new Error(`Invalid planned TMDB source: ${validation.error}`);
    }

    return validation.request;
  }

  if (source.provider === 'igdb') {
    if (source.mediaType !== 'game') {
      throw new Error('IGDB planned source must target games.');
    }

    if (!isObject(source.parameters)) {
      throw new Error('IGDB planned source is missing generation parameters.');
    }

    const validation = validateIgdbGenerationRequest({
      mediaType: 'game',
      mode: source.mode,
      query: source.query,
      collectionId,
      igdbId: source.resolvedId,
      limit: source.parameters.limit,
      sort: source.parameters.sort,
      gameTypes: source.parameters.gameTypes,
      includeDlcExpansions: source.parameters.includeDlcExpansions,
    });

    if (!validation.ok) {
      throw new Error(`Invalid planned IGDB source: ${validation.error}`);
    }

    return {
      mediaType: 'game',
      ...validation.request,
    };
  }

  throw new Error(`Unsupported planned source provider: ${source.provider ?? 'unknown'}`);
}

function getItemIdentity(item) {
  if (
    isObject(item) &&
    isObject(item.source) &&
    typeof item.source.provider === 'string' &&
    typeof item.source.id === 'string'
  ) {
    return `${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`;
  }

  return `local:${item?.id ?? ''}`;
}

function mergeItems(results) {
  const merged = [];
  const seen = new Set();

  for (const result of results) {
    for (const item of result.collection.items ?? []) {
      const identity = getItemIdentity(item);

      if (seen.has(identity)) {
        continue;
      }

      seen.add(identity);
      merged.push(item);
    }
  }

  return merged;
}

function mediaLabel(mediaType) {
  if (mediaType === 'movie') {
    return 'Movies';
  }

  if (mediaType === 'tv') {
    return 'TV Shows';
  }

  return 'Games';
}

function joinLabels(labels) {
  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length <= 1) {
    return uniqueLabels[0] ?? 'Collection';
  }

  if (uniqueLabels.length === 2) {
    return `${uniqueLabels[0]} & ${uniqueLabels[1]}`;
  }

  return `${uniqueLabels.slice(0, -1).join(', ')} & ${uniqueLabels.at(-1)}`;
}

function normalizeName(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'Generated Collection';
  }

  return `${trimmed[0].toLocaleUpperCase()}${trimmed.slice(1)}`;
}

function buildCompositeName(plannedRequest) {
  const names = plannedRequest.plan.sources.map((source) => source.resolvedName);
  const comparableNames = names.map((name) => name.trim().toLocaleLowerCase());
  const commonName = comparableNames.every((name) => name === comparableNames[0])
    ? names[0]
    : plannedRequest.subject;
  const labels = plannedRequest.plan.sources.map((source) => mediaLabel(source.mediaType));

  return `${normalizeName(commonName)} ${joinLabels(labels)}`;
}

function buildCompositeCollection({ collectionId, plannedRequest, results }) {
  const generatedSources = results.map((result) => result.collection.candidateSource);

  if (
    generatedSources.some(
      (source) => !isObject(source) || source.kind !== 'generated',
    )
  ) {
    throw new Error('Generated source execution returned an invalid source definition.');
  }

  const items = mergeItems(results);

  return {
    id: collectionId,
    name: buildCompositeName(plannedRequest),
    description: `Generated from “${plannedRequest.plan.originalRequest}”.`,
    candidateSource: {
      kind: 'composite',
      originalRequest: plannedRequest.plan.originalRequest,
      sources: generatedSources,
    },
    items,
  };
}

function withOriginalRequest(collection, originalRequest) {
  const source = collection.candidateSource;

  if (!isObject(source) || source.kind !== 'generated') {
    throw new Error('Generated source execution returned an invalid source definition.');
  }

  return {
    ...collection,
    candidateSource: {
      ...source,
      originalRequest,
    },
  };
}

export async function executeCollectionPlan({
  plannedRequest,
  collectionId,
  tmdb = null,
  igdb = null,
  today,
  logger = console,
  generateTmdb = generateTmdbCollection,
  generateIgdb = generateIgdbCollection,
}) {
  const normalizedRequest = validatePlannedRequest(plannedRequest);
  const normalizedCollectionId = validateCollectionId(collectionId);
  const results = [];

  // Deliberately sequential. A composite plan can contain multiple calls to the
  // same provider, and each generator may already make several API requests.
  for (const source of normalizedRequest.plan.sources) {
    const generationRequest = buildGenerationRequestFromPlannedSource(
      source,
      normalizedCollectionId,
    );

    if (source.provider === 'tmdb') {
      if (!tmdb) {
        throw new Error('TMDB provider is required to execute this collection plan.');
      }

      results.push(
        await generateTmdb({
          request: generationRequest,
          tmdb,
          today,
          logger,
        }),
      );
      continue;
    }

    if (!igdb) {
      throw new Error('IGDB provider is required to execute this collection plan.');
    }

    results.push(
      await generateIgdb({
        request: generationRequest,
        igdb,
        logger,
      }),
    );
  }

  if (normalizedRequest.plan.kind === 'single') {
    const result = results[0];

    return {
      ...result,
      collection: withOriginalRequest(
        result.collection,
        normalizedRequest.plan.originalRequest,
      ),
    };
  }

  const collection = buildCompositeCollection({
    collectionId: normalizedCollectionId,
    plannedRequest: normalizedRequest,
    results,
  });

  return {
    collection,
    candidateCount: results.reduce(
      (total, result) => total + (result.candidateCount ?? 0),
      0,
    ),
    validatedCount: collection.items.length,
    missingPosterCount: collection.items.filter((item) => !item.image).length,
  };
}
