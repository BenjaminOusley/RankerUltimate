import {
  CURATED_POLICY_VERSION,
  DEFAULT_COLLECTION_DEFINITIONS,
  DEFAULT_COLLECTION_IDS,
  DEFAULT_MANIFEST_SCHEMA_VERSION,
  DISNEY_PRINCESS_EXCLUDED_TITLE_PATTERNS,
  STAR_WARS_EXCLUDED_TITLE_PATTERNS,
  MCU_MOVIE_POLICY,
  MCU_TV_POLICY,
} from './default-manifest-policy.mjs';
import { itemIdentityKey, normalizeTitle } from './curated-utils.mjs';

const MINIMUM_COUNTS = Object.freeze({
  'mcu-movies': 30,
  'mcu-tv-shows': 12,
  'marvel-cinematic-universe': 42,
  'christopher-nolan-movies': 10,
  'pixar-feature-films': 25,
  'star-wars-movies-tv': 20,
  'disney-princess-movies': 14,
  'top-50-best-selling-video-games': 50,
  'stephen-king-books': 40,
});

const ALLOWED_ITEM_TYPES = Object.freeze({
  'mcu-movies': new Set(['movie']),
  'mcu-tv-shows': new Set(['tv']),
  'marvel-cinematic-universe': new Set(['movie', 'tv']),
  'christopher-nolan-movies': new Set(['movie']),
  'pixar-feature-films': new Set(['movie']),
  'star-wars-movies-tv': new Set(['movie', 'tv']),
  'disney-princess-movies': new Set(['movie']),
  'top-50-best-selling-video-games': new Set(['game']),
  'stephen-king-books': new Set(['book']),
});

function assert(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function collectionMap(manifest) {
  return new Map((manifest?.collections ?? []).map((collection) => [collection.id, collection]));
}

function itemKeySet(collection) {
  return new Set((collection?.items ?? []).map(itemIdentityKey));
}

function mcuPolicyForItem(item) {
  if (item?.source?.type === 'movie') {
    return MCU_MOVIE_POLICY;
  }

  if (item?.source?.type === 'tv') {
    return MCU_TV_POLICY;
  }

  return null;
}

function isExcludedMcuItem(item) {
  const policy = mcuPolicyForItem(item);

  if (!policy) {
    return false;
  }

  const tmdbId = Number(item?.source?.id);
  const title = item?.name ?? '';
  const excludedIds = policy.excludedTmdbIds ?? [];
  const titlePatterns = [
    ...(policy.excludedTitlePatterns ?? []),
    ...(policy.blockedTitlePatterns ?? []),
  ];

  return excludedIds.includes(tmdbId) || titlePatterns.some((pattern) => pattern.test(title));
}

function validateMcuMembership(collection, errors) {
  for (const item of collection?.items ?? []) {
    assert(
      !isExcludedMcuItem(item),
      `${collection.name} contains excluded MCU item: ${item.name} [TMDB ${item.source?.id ?? 'unknown'}].`,
      errors,
    );
  }
}

function assertUniqueItems(collection, errors) {
  const keys = new Set();

  for (const item of collection.items ?? []) {
    const key = itemIdentityKey(item);
    assert(!keys.has(key), `${collection.id} contains duplicate item identity ${key}.`, errors);
    keys.add(key);
  }
}

function validateTopGames(collection, errors) {
  assert(
    collection.items.length === 50,
    'Top-selling games must contain exactly 50 items.',
    errors,
  );

  let previousSales = Number.POSITIVE_INFINITY;

  for (const [index, item] of collection.items.entries()) {
    const sales = Number.parseFloat(String(item.subtitle ?? '').replace(/[^0-9.].*$/s, ''));
    assert(
      Number.isFinite(sales),
      `Top-selling game #${index + 1} is missing a sales figure.`,
      errors,
    );

    if (Number.isFinite(sales)) {
      assert(
        sales <= previousSales,
        `Top-selling games are not ordered by reported unit sales at #${index + 1}.`,
        errors,
      );
      previousSales = sales;
    }
  }
}

function validateCombinedMcu(collections, errors) {
  const movies = itemKeySet(collections.get('mcu-movies'));
  const tv = itemKeySet(collections.get('mcu-tv-shows'));
  const combined = itemKeySet(collections.get('marvel-cinematic-universe'));
  const expected = new Set([...movies, ...tv]);

  assert(
    combined.size === expected.size,
    'Combined MCU collection does not match the movie/TV union.',
    errors,
  );

  for (const key of expected) {
    assert(combined.has(key), `Combined MCU collection is missing ${key}.`, errors);
  }
}

export function validateDefaultManifest(manifest, { previousManifest = null } = {}) {
  const errors = [];

  assert(manifest && typeof manifest === 'object', 'Default manifest must be an object.', errors);
  assert(
    manifest?.schemaVersion === DEFAULT_MANIFEST_SCHEMA_VERSION,
    `Default manifest schemaVersion must be ${DEFAULT_MANIFEST_SCHEMA_VERSION}.`,
    errors,
  );
  assert(
    manifest?.policyVersion === CURATED_POLICY_VERSION,
    `Default manifest policyVersion must be ${CURATED_POLICY_VERSION}.`,
    errors,
  );
  assert(
    Array.isArray(manifest?.collections),
    'Default manifest collections must be an array.',
    errors,
  );

  if (!Array.isArray(manifest?.collections)) {
    return errors;
  }

  const collections = collectionMap(manifest);

  assert(
    collections.size === DEFAULT_COLLECTION_IDS.length,
    `Default manifest must contain exactly ${DEFAULT_COLLECTION_IDS.length} collections.`,
    errors,
  );

  for (const collectionId of DEFAULT_COLLECTION_IDS) {
    const collection = collections.get(collectionId);
    const definition = DEFAULT_COLLECTION_DEFINITIONS[collectionId];

    assert(Boolean(collection), `Default manifest is missing ${collectionId}.`, errors);

    if (!collection) {
      continue;
    }

    assert(collection.name === definition.name, `${collectionId} has the wrong name.`, errors);
    assert(
      collection.groupId === definition.groupId,
      `${collectionId} has the wrong group.`,
      errors,
    );
    assert(
      collection.rankingDomain === definition.rankingDomain,
      `${collectionId} has the wrong ranking domain.`,
      errors,
    );
    assert(Array.isArray(collection.items), `${collectionId} items must be an array.`, errors);

    if (!Array.isArray(collection.items)) {
      continue;
    }

    assert(
      collection.items.length >= MINIMUM_COUNTS[collectionId],
      `${collectionId} contains only ${collection.items.length} items; expected at least ${MINIMUM_COUNTS[collectionId]}.`,
      errors,
    );
    assertUniqueItems(collection, errors);

    for (const item of collection.items) {
      assert(
        typeof item?.id === 'string' && item.id.length > 0,
        `${collectionId} has an item without an ID.`,
        errors,
      );
      assert(
        typeof item?.name === 'string' && item.name.length > 0,
        `${collectionId} has an item without a name.`,
        errors,
      );
      assert(
        typeof item?.source?.provider === 'string' && item.source.provider.length > 0,
        `${collectionId} has an item without a source provider: ${item?.name ?? 'unknown item'}.`,
        errors,
      );
      assert(
        typeof item?.source?.id === 'string' && item.source.id.length > 0,
        `${collectionId} has an item without a source ID: ${item?.name ?? 'unknown item'}.`,
        errors,
      );
      assert(
        ALLOWED_ITEM_TYPES[collectionId].has(item?.source?.type),
        `${collectionId} contains an unexpected item type for ${item?.name ?? 'unknown item'}: ${item?.source?.type ?? 'missing'}.`,
        errors,
      );
    }
  }

  const starWars = collections.get('star-wars-movies-tv');
  if (starWars) {
    for (const item of starWars.items) {
      assert(
        !STAR_WARS_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(item.name)),
        `Star Wars collection contains excluded title: ${item.name}.`,
        errors,
      );
    }
  }

  const disney = collections.get('disney-princess-movies');
  if (disney) {
    for (const item of disney.items) {
      assert(
        !DISNEY_PRINCESS_EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(item.name)),
        `Disney Princess collection contains excluded title: ${item.name}.`,
        errors,
      );
    }
  }

  const topGames = collections.get('top-50-best-selling-video-games');
  if (topGames) {
    validateTopGames(topGames, errors);
  }

  for (const collectionId of ['mcu-movies', 'mcu-tv-shows', 'marvel-cinematic-universe']) {
    const mcuCollection = collections.get(collectionId);

    if (mcuCollection) {
      validateMcuMembership(mcuCollection, errors);
    }
  }

  validateCombinedMcu(collections, errors);

  if (previousManifest?.generatedAt !== 'bootstrap') {
    const previousCollections = collectionMap(previousManifest ?? {});

    for (const collectionId of DEFAULT_COLLECTION_IDS) {
      const previous = previousCollections.get(collectionId);
      const next = collections.get(collectionId);

      if (!previous || !next || previous.items.length === 0) {
        continue;
      }

      const minimumSafeCount = Math.floor(previous.items.length * 0.75);
      assert(
        next.items.length >= minimumSafeCount,
        `${collectionId} dropped from ${previous.items.length} to ${next.items.length} items; refusing a destructive manifest update.`,
        errors,
      );

      const previousKeys = itemKeySet(previous);
      const nextKeys = itemKeySet(next);
      let overlap = 0;

      for (const key of previousKeys) {
        if (nextKeys.has(key)) {
          overlap += 1;
        }
      }

      if (previousKeys.size >= 10) {
        assert(
          overlap / previousKeys.size >= 0.55,
          `${collectionId} replaced too many stable item identities (${overlap}/${previousKeys.size} retained).`,
          errors,
        );
      }
    }
  }

  return errors;
}

export function assertValidDefaultManifest(manifest, options = {}) {
  const errors = validateDefaultManifest(manifest, options);

  if (errors.length > 0) {
    throw new Error(`Curated default manifest validation failed:\n- ${errors.join('\n- ')}`);
  }

  return manifest;
}

export function semanticManifestPayload(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    policyVersion: manifest.policyVersion,
    collections: manifest.collections.map((collection) => ({
      ...collection,
      items: collection.items.map((item) => ({ ...item })),
    })),
  };
}

export function collectionIdentitySummary(manifest) {
  return Object.fromEntries(
    (manifest.collections ?? []).map((collection) => [
      collection.id,
      collection.items.map((item) => normalizeTitle(item.name)),
    ]),
  );
}
