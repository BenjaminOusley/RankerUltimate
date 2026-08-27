import { generateTmdbCollection } from '../../generation/tmdb-generator.mjs';
import { validateGenerationRequest } from '../../generation/validation.mjs';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(error) {
  return {
    ok: false,
    error,
  };
}

function fallbackSourceCollectionId(collectionId) {
  if (collectionId.endsWith('-movies')) {
    return collectionId.slice(0, -'-movies'.length);
  }

  if (collectionId.endsWith('-tv')) {
    return collectionId.slice(0, -'-tv'.length);
  }

  return collectionId;
}

function getMediaType(definition) {
  if (definition.mediaType === 'movie' || definition.mediaType === 'tv') {
    return definition.mediaType;
  }

  if (Array.isArray(definition.mediaTypes)) {
    const firstMediaType = definition.mediaTypes[0];

    if (firstMediaType === 'movie' || firstMediaType === 'tv') {
      return firstMediaType;
    }
  }

  return 'movie';
}

export function buildTmdbGenerationRequestFromSource(collectionId, source) {
  const definition = source.definition;

  if (!isObject(definition)) {
    return failure('TMDB source definition is invalid.');
  }

  const generationRequest = {
    mediaType: getMediaType(definition),
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

export async function refreshTmdbCollectionSource({
  collectionId,
  source,
  tmdb,
  today,
  logger = console,
}) {
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
