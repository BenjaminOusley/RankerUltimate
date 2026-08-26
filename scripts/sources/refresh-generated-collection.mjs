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

export async function refreshGeneratedCollectionSource({
  collectionId,
  source,
  refreshers,
  today,
  logger = console,
}) {
  const refreshProvider = refreshers[source.provider];

  if (!refreshProvider) {
    throw new Error(`Unsupported collection source provider: ${source.provider}`);
  }

  return refreshProvider({
    collectionId,
    source,
    today,
    logger,
  });
}
