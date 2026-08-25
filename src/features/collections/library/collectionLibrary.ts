import type { RankCollection, RankItem } from '@/domain/models';

type CollectionOverride = {
  name?: string;
  description?: string | null;
  excludedItemKeys?: string[];
};

type CustomCollectionRecord = {
  id: string;
  name: string;
  description?: string;
  itemKeys: string[];
};

export type CollectionLibraryState = {
  version: 2;
  customCollections: CustomCollectionRecord[];
  overrides: Record<string, CollectionOverride>;
  deletedBuiltInIds: string[];
};

type LegacyCollectionOverride = {
  name?: string;
  description?: string | null;
  itemKeys?: string[];
};

type LegacyCustomCollectionRecord = {
  id: string;
  name: string;
  description?: string;
  itemKeys: string[];
};

type LegacyCollectionLibraryState = {
  version: 1;
  customCollections?: LegacyCustomCollectionRecord[];
  overrides?: Record<string, LegacyCollectionOverride>;
  deletedBuiltInIds?: string[];
};

const COLLECTION_LIBRARY_KEY_V1 = 'rankerultimate:collections:v1';
const COLLECTION_LIBRARY_KEY_V2 = 'rankerultimate:collections:v2';

function createEmptyState(): CollectionLibraryState {
  return {
    version: 2,
    customCollections: [],
    overrides: {},
    deletedBuiltInIds: [],
  };
}

export function getCollectionLibraryItemKey(item: RankItem) {
  if (item.source) {
    return `${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`;
  }

  return `local:${item.id}`;
}

function getLegacyItemKeys(item: RankItem) {
  const aliases = new Set<string>([item.id]);

  if (item.source) {
    aliases.add(`${String(item.source)}:${item.id}`);
    aliases.add(`${item.source.provider}:${item.id}`);
    aliases.add(`${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`);
  }

  aliases.add(getCollectionLibraryItemKey(item));

  return aliases;
}

function buildItemCatalog(baseCollections: readonly RankCollection[]) {
  const catalog = new Map<string, RankItem>();

  for (const collection of baseCollections) {
    for (const item of collection.items) {
      catalog.set(getCollectionLibraryItemKey(item), item);
    }
  }

  return catalog;
}

function buildItemAliasCatalog(baseCollections: readonly RankCollection[]) {
  const aliases = new Map<string, string>();

  for (const collection of baseCollections) {
    for (const item of collection.items) {
      const canonicalKey = getCollectionLibraryItemKey(item);

      for (const alias of getLegacyItemKeys(item)) {
        aliases.set(alias, canonicalKey);
      }
    }
  }

  return aliases;
}

function normalizeItemKeys(keys: readonly string[], aliases: Map<string, string>) {
  return [...new Set(keys.map((key) => aliases.get(key)).filter((key): key is string => Boolean(key)))];
}

function resolveItems(keys: readonly string[], catalog: Map<string, RankItem>) {
  return keys.map((key) => catalog.get(key)).filter((item): item is RankItem => Boolean(item));
}

function migrateLegacyState(
  legacyState: LegacyCollectionLibraryState,
  baseCollections: readonly RankCollection[],
): CollectionLibraryState {
  const aliases = buildItemAliasCatalog(baseCollections);

  const customCollections: CustomCollectionRecord[] = (legacyState.customCollections ?? []).map(
    (collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      itemKeys: normalizeItemKeys(collection.itemKeys ?? [], aliases),
    }),
  );

  const overrides: Record<string, CollectionOverride> = {};

  for (const [collectionId, legacyOverride] of Object.entries(legacyState.overrides ?? {})) {
    const nextOverride: CollectionOverride = {};

    if (legacyOverride.name !== undefined) {
      nextOverride.name = legacyOverride.name;
    }

    if (legacyOverride.description !== undefined) {
      nextOverride.description = legacyOverride.description;
    }

    if (legacyOverride.itemKeys) {
      const baseCollection = baseCollections.find((collection) => collection.id === collectionId);

      if (baseCollection) {
        const selectedKeys = new Set(normalizeItemKeys(legacyOverride.itemKeys, aliases));

        const excludedItemKeys = baseCollection.items
          .map(getCollectionLibraryItemKey)
          .filter((key) => !selectedKeys.has(key));

        if (excludedItemKeys.length > 0) {
          nextOverride.excludedItemKeys = excludedItemKeys;
        }
      }
    }

    if (Object.keys(nextOverride).length > 0) {
      overrides[collectionId] = nextOverride;
    }
  }

  return {
    version: 2,
    customCollections,
    overrides,
    deletedBuiltInIds: legacyState.deletedBuiltInIds ?? [],
  };
}

export function loadCollectionLibraryState(
  baseCollections: readonly RankCollection[],
): CollectionLibraryState {
  try {
    const currentRaw = localStorage.getItem(COLLECTION_LIBRARY_KEY_V2);

    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as Partial<CollectionLibraryState>;

      if (parsed.version === 2) {
        return {
          version: 2,
          customCollections: parsed.customCollections ?? [],
          overrides: parsed.overrides ?? {},
          deletedBuiltInIds: parsed.deletedBuiltInIds ?? [],
        };
      }
    }

    const legacyRaw = localStorage.getItem(COLLECTION_LIBRARY_KEY_V1);

    if (!legacyRaw) {
      return createEmptyState();
    }

    const legacyState = JSON.parse(legacyRaw) as LegacyCollectionLibraryState;

    if (legacyState.version !== 1) {
      return createEmptyState();
    }

    return migrateLegacyState(legacyState, baseCollections);
  } catch {
    return createEmptyState();
  }
}

export function saveCollectionLibraryState(state: CollectionLibraryState) {
  localStorage.setItem(COLLECTION_LIBRARY_KEY_V2, JSON.stringify(state));
  localStorage.removeItem(COLLECTION_LIBRARY_KEY_V1);
}

export function buildCollectionItemLibrary(baseCollections: readonly RankCollection[]) {
  return [...buildItemCatalog(baseCollections).values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

export function buildCollectionCandidateItems(
  baseCollections: readonly RankCollection[],
  collectionId: string | null,
) {
  if (collectionId) {
    const builtInCollection = baseCollections.find((collection) => collection.id === collectionId);

    if (builtInCollection) {
      return [...builtInCollection.items].sort((first, second) =>
        first.name.localeCompare(second.name),
      );
    }
  }

  return buildCollectionItemLibrary(baseCollections);
}

export function materializeCollections(
  baseCollections: readonly RankCollection[],
  state: CollectionLibraryState,
): RankCollection[] {
  const catalog = buildItemCatalog(baseCollections);
  const deletedIds = new Set(state.deletedBuiltInIds);

  const builtInCollections = baseCollections
    .filter((collection) => !deletedIds.has(collection.id))
    .map((collection) => {
      const override = state.overrides[collection.id];

      if (!override) {
        return collection;
      }

      const description =
        override.description === undefined
          ? collection.description
          : (override.description ?? undefined);

      const excludedItemKeys = new Set(override.excludedItemKeys ?? []);

      return {
        ...collection,
        name: override.name ?? collection.name,
        description,
        items: collection.items.filter(
          (item) => !excludedItemKeys.has(getCollectionLibraryItemKey(item)),
        ),
      };
    });

  const customCollections: RankCollection[] = state.customCollections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    items: resolveItems(collection.itemKeys, catalog),
    candidateSource: {
      kind: 'custom',
    },
  }));

  return [...builtInCollections, ...customCollections];
}

export function createCustomCollection(
  state: CollectionLibraryState,
  name: string,
  description: string,
  id = `custom:${crypto.randomUUID()}`,
) {
  const trimmedDescription = description.trim();

  const collection: CustomCollectionRecord = {
    id,
    name: name.trim(),
    ...(trimmedDescription
      ? {
          description: trimmedDescription,
        }
      : {}),
    itemKeys: [],
  };

  return {
    collectionId: id,
    state: {
      ...state,
      customCollections: [...state.customCollections, collection],
    },
  };
}

export function updateCollectionInLibrary(
  state: CollectionLibraryState,
  baseCollections: readonly RankCollection[],
  updatedCollection: RankCollection,
  itemsChanged: boolean,
): CollectionLibraryState {
  const builtInCollection = baseCollections.find(
    (collection) => collection.id === updatedCollection.id,
  );

  const updatedItemKeys = updatedCollection.items.map(getCollectionLibraryItemKey);

  if (!builtInCollection) {
    const updatedCustom: CustomCollectionRecord = {
      id: updatedCollection.id,
      name: updatedCollection.name.trim(),
      ...(updatedCollection.description?.trim()
        ? {
            description: updatedCollection.description.trim(),
          }
        : {}),
      itemKeys: updatedItemKeys,
    };

    const existingIndex = state.customCollections.findIndex(
      (collection) => collection.id === updatedCollection.id,
    );

    const nextCustomCollections = [...state.customCollections];

    if (existingIndex >= 0) {
      nextCustomCollections[existingIndex] = updatedCustom;
    } else {
      nextCustomCollections.push(updatedCustom);
    }

    return {
      ...state,
      customCollections: nextCustomCollections,
    };
  }

  const nextOverride: CollectionOverride = {
    ...state.overrides[updatedCollection.id],
  };

  if (updatedCollection.name.trim() === builtInCollection.name) {
    delete nextOverride.name;
  } else {
    nextOverride.name = updatedCollection.name.trim();
  }

  const updatedDescription = updatedCollection.description?.trim() || undefined;
  const builtInDescription = builtInCollection.description?.trim() || undefined;

  if (updatedDescription === builtInDescription) {
    delete nextOverride.description;
  } else {
    nextOverride.description = updatedDescription ?? null;
  }

  if (itemsChanged) {
    const selectedKeys = new Set(updatedItemKeys);

    const excludedItemKeys = builtInCollection.items
      .map(getCollectionLibraryItemKey)
      .filter((key) => !selectedKeys.has(key));

    if (excludedItemKeys.length === 0) {
      delete nextOverride.excludedItemKeys;
    } else {
      nextOverride.excludedItemKeys = excludedItemKeys;
    }
  }

  const nextOverrides = {
    ...state.overrides,
  };

  if (Object.keys(nextOverride).length === 0) {
    delete nextOverrides[updatedCollection.id];
  } else {
    nextOverrides[updatedCollection.id] = nextOverride;
  }

  return {
    ...state,
    overrides: nextOverrides,
    deletedBuiltInIds: state.deletedBuiltInIds.filter((id) => id !== updatedCollection.id),
  };
}

export function deleteCollectionFromLibrary(
  state: CollectionLibraryState,
  baseCollections: readonly RankCollection[],
  collectionId: string,
): CollectionLibraryState {
  const builtIn = baseCollections.some((collection) => collection.id === collectionId);

  if (!builtIn) {
    return {
      ...state,
      customCollections: state.customCollections.filter(
        (collection) => collection.id !== collectionId,
      ),
    };
  }

  const nextOverrides = {
    ...state.overrides,
  };

  delete nextOverrides[collectionId];

  return {
    ...state,
    overrides: nextOverrides,
    deletedBuiltInIds: [...new Set([...state.deletedBuiltInIds, collectionId])],
  };
}
