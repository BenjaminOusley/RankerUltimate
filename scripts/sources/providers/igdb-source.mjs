import {
  generateIgdbCollection,
  validateIgdbGenerationRequest,
} from '../../generation/igdb-generator.mjs';

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
  if (collectionId.endsWith('-games')) {
    return collectionId.slice(0, -'-games'.length);
  }

  return collectionId;
}

export function buildIgdbGenerationRequestFromSource(collectionId, source) {
  const definition = source.definition;

  if (!isObject(definition)) {
    return failure('IGDB source definition is invalid.');
  }

  const validation = validateIgdbGenerationRequest({
    mode: definition.mode,
    query: definition.query,
    collectionId:
      typeof definition.collectionId === 'string'
        ? definition.collectionId
        : fallbackSourceCollectionId(collectionId),
    igdbId: definition.igdbId,
    limit: definition.limit,
    sort: definition.sort,
    gameTypes: definition.gameTypes,
  });

  if (!validation.ok) {
    return failure(`IGDB source definition is invalid: ${validation.error}`);
  }

  return validation;
}

export async function refreshIgdbCollectionSource({
  collectionId,
  source,
  igdb,
  logger = console,
}) {
  if (!igdb) {
    throw new Error('IGDB provider is not configured.');
  }

  const generationRequest = buildIgdbGenerationRequestFromSource(collectionId, source);

  if (!generationRequest.ok) {
    throw new Error(generationRequest.error);
  }

  const result = await generateIgdbCollection({
    request: generationRequest.request,
    igdb,
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
