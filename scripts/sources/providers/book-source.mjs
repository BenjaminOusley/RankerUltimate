import {
  generateBookCollection,
  validateBookGenerationRequest,
} from '../../generation/book-generator.mjs';

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
  if (collectionId.endsWith('-book-series')) {
    return collectionId.slice(0, -'-book-series'.length);
  }

  if (collectionId.endsWith('-books')) {
    return collectionId.slice(0, -'-books'.length);
  }

  return collectionId;
}

export function buildBookGenerationRequestFromSource(collectionId, source) {
  const definition = source.definition;

  if (!isObject(definition)) {
    return failure('Hardcover source definition is invalid.');
  }

  const validation = validateBookGenerationRequest({
    mediaType: 'book',
    mode: definition.mode,
    query: definition.query,
    collectionId:
      typeof definition.collectionId === 'string'
        ? definition.collectionId
        : fallbackSourceCollectionId(collectionId),
    hardcoverId: definition.hardcoverId,
    resolvedName: definition.resolvedName,
    limit: definition.limit,
    sort: definition.sort,
    tagSlug: definition.tagSlug,
    tagCategorySlug: definition.tagCategorySlug,
    semanticCategory: definition.semanticCategory,
    tagSources: definition.tagSources,
    candidateLimit: definition.candidateLimit,
  });

  if (!validation.ok) {
    return failure(`Hardcover source definition is invalid: ${validation.error}`);
  }

  return validation;
}

export async function refreshBookCollectionSource({
  collectionId,
  source,
  hardcover,
  logger = console,
}) {
  if (!hardcover) {
    throw new Error('Hardcover provider is not configured.');
  }

  const generationRequest = buildBookGenerationRequestFromSource(collectionId, source);

  if (!generationRequest.ok) {
    throw new Error(generationRequest.error);
  }

  const result = await generateBookCollection({
    request: generationRequest.request,
    hardcover,
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
