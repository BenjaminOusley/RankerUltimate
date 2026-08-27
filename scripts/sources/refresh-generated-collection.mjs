function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(error) {
  return {
    ok: false,
    error,
  };
}

function validateGeneratedSource(source, label = 'Generated collection source') {
  if (!isObject(source) || source.kind !== 'generated') {
    return failure(`${label} must be a generated source.`);
  }

  if (typeof source.provider !== 'string' || source.provider.length === 0) {
    return failure(`${label} is missing a provider.`);
  }

  if (!isObject(source.definition)) {
    return failure(`${label} is missing a definition.`);
  }

  return {
    ok: true,
    source,
  };
}

function validateRefreshableSource(source) {
  if (!isObject(source)) {
    return failure('Collection source must be an object.');
  }

  if (source.kind === 'generated') {
    return validateGeneratedSource(source);
  }

  if (source.kind !== 'composite') {
    return failure('Only generated or composite collection sources can be refreshed.');
  }

  if (!Array.isArray(source.sources) || source.sources.length === 0) {
    return failure('Composite collection source must contain at least one generated source.');
  }

  if (source.sources.length > 20) {
    return failure('Composite collection source contains too many child sources.');
  }

  for (let index = 0; index < source.sources.length; index += 1) {
    const childValidation = validateGeneratedSource(
      source.sources[index],
      `Composite source ${index + 1}`,
    );

    if (!childValidation.ok) {
      return childValidation;
    }
  }

  return {
    ok: true,
    source,
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

  const sourceValidation = validateRefreshableSource(source);

  if (!sourceValidation.ok) {
    return sourceValidation;
  }

  return {
    ok: true,
    request: {
      collectionId,
      source: sourceValidation.source,
    },
  };
}

function getItemIdentity(item) {
  if (
    item &&
    typeof item === 'object' &&
    item.source &&
    typeof item.source === 'object' &&
    typeof item.source.provider === 'string' &&
    typeof item.source.id === 'string'
  ) {
    return `${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`;
  }

  return `local:${item?.id ?? ''}`;
}

function mergeCompositeItems(results) {
  const items = [];
  const seen = new Set();

  for (const result of results) {
    for (const item of result.collection.items ?? []) {
      const identity = getItemIdentity(item);

      if (seen.has(identity)) {
        continue;
      }

      seen.add(identity);
      items.push(item);
    }
  }

  return items;
}

async function refreshSingleGeneratedSource({
  collectionId,
  source,
  refreshers,
  today,
  logger,
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

export async function refreshGeneratedCollectionSource({
  collectionId,
  source,
  refreshers,
  today,
  logger = console,
}) {
  if (source.kind === 'generated') {
    return refreshSingleGeneratedSource({
      collectionId,
      source,
      refreshers,
      today,
      logger,
    });
  }

  if (source.kind !== 'composite') {
    throw new Error(`Unsupported collection source kind: ${source.kind}`);
  }

  const results = [];

  // Intentionally sequential. A composite can contain multiple queries for the
  // same provider, and provider-specific refreshers may already make several API calls.
  for (const childSource of source.sources) {
    results.push(
      await refreshSingleGeneratedSource({
        collectionId,
        source: childSource,
        refreshers,
        today,
        logger,
      }),
    );
  }

  const items = mergeCompositeItems(results);

  return {
    collection: {
      id: collectionId,
      name: results[0]?.collection?.name ?? collectionId,
      items,
      candidateSource: source,
    },
    candidateCount: results.reduce(
      (total, result) => total + (result.candidateCount ?? 0),
      0,
    ),
    validatedCount: items.length,
    missingPosterCount: items.filter((item) => !item.image).length,
  };
}
