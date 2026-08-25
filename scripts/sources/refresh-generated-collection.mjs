import { generateTmdbCollection } from '../generation/tmdb-generator.mjs';
import { validateGenerationRequest } from '../generation/validation.mjs';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(error) {
  return {
    ok: false,
    error,
  };
}

export function validateRefreshSourceRequest(value) {
  if (!isObject(value)) {
    return failure('Refresh request must be an object.');
  }

  const { collectionId, source } = value;

  if (
    typeof collectionId !== 'string' ||
    collectionId.length === 0 ||
    collectionId.length > 120 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collectionId)
  ) {
    return failure('Invalid collection ID.');
  }

  if (!isObject(source) || source.kind !== 'generated') {
    return failure('Only generated collection sources can be refreshed.');
  }

  if (typeof source.provider !== 'string' || source.provider.length === 0) {
    return failure('Generated collection source is missing a provider.');
  }

  if (!isObject(source.definition)) {
    return failure('Generated collection source is missing a definition.');
  }

  return {
    ok: true,
    request: {
      collectionId,
      source,
    },
  };
}

function fallbackSourceCollectionId(collectionId) {
  return collectionId.endsWith('-movies') ? collectionId.slice(0, -'-movies'.length) : collectionId;
}

export function buildTmdbGenerationRequestFromSource(collectionId, source) {
  const definition = source.definition;

  if (!isObject(definition)) {
    return failure('TMDB source definition is invalid.');
  }

  const generationRequest = {
    mode: definition.mode,
    query: definition.query,
    collectionId:
      typeof definition.collectionId === 'string'
        ? definition.collectionId
        : fallbackSourceCollectionId(collectionId),
    limit: definition.limit,
    tmdbId: definition.tmdbId ?? null,
    fromYear: definition.fromYear ?? null,
    toYear: definition.toYear ?? null,
    sort: definition.sort,
    minRuntime: definition.minRuntime ?? null,
    excludeDocumentaries: definition.excludeDocumentaries,
    includeAdult: definition.includeAdult,
    language: definition.language,
  };

  const validation = validateGenerationRequest(generationRequest);

  if (!validation.ok) {
    return failure(`TMDB source definition is invalid: ${validation.error}`);
  }

  return {
    ok: true,
    request: validation.request,
  };
}

export async function refreshGeneratedCollectionSource({
  collectionId,
  source,
  providers,
  today,
  logger = console,
}) {
  if (source.provider !== 'tmdb') {
    throw new Error(`Unsupported collection source provider: ${source.provider}`);
  }

  const tmdb = providers.tmdb;

  if (!tmdb) {
    throw new Error('TMDB provider is not configured.');
  }

  const generationRequest = buildTmdbGenerationRequestFromSource(collectionId, source);

  if (!generationRequest.ok) {
    throw new Error(generationRequest.error);
  }

  const result = await generateTmdbCollection({
    request: generationRequest.request,
    tmdb,
    today,
    logger,
  });

  return {
    ...result,
    collection: {
      ...result.collection,
      id: collectionId,
    },
  };
}
