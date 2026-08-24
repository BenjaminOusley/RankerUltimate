import type { RankCollection, RankItem } from '@/models';

type CollectionOverride = {
  name?: string;
  description?: string | null;
  itemKeys?: string[];
};

type CustomCollectionRecord = {
  id: string;
  name: string;
  description?: string;
  itemKeys: string[];
};

export type CollectionLibraryState = {
  version: 1;
  customCollections: CustomCollectionRecord[];
  overrides: Record<string, CollectionOverride>;
  deletedBuiltInIds: string[];
};

const COLLECTION_LIBRARY_KEY = 'rankerultimate:collections:v1';

function createEmptyState(): CollectionLibraryState {
  return {
    version: 1,
    customCollections: [],
    overrides: {},
    deletedBuiltInIds: [],
  };
}

export function getCollectionLibraryItemKey(item: RankItem) {
  const source = (item as RankItem & { source?: unknown }).source;

  return source ? `${String(source)}:${item.id}` : item.id;
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

function resolveItems(keys: readonly string[], catalog: Map<string, RankItem>) {
  return keys.map((key) => catalog.get(key)).filter((item): item is RankItem => Boolean(item));
}

function haveSameItemKeys(first: readonly string[], second: readonly string[]) {
  if (first.length !== second.length) {
    return false;
  }

  const secondSet = new Set(second);

  return first.every((key) => secondSet.has(key));
}

export function loadCollectionLibraryState(): CollectionLibraryState {
  try {
    const raw = localStorage.getItem(COLLECTION_LIBRARY_KEY);

    if (!raw) {
      return createEmptyState();
    }

    const parsed = JSON.parse(raw) as CollectionLibraryState;

    if (parsed.version !== 1) {
      return createEmptyState();
    }

    return {
      version: 1,
      customCollections: parsed.customCollections ?? [],
      overrides: parsed.overrides ?? {},
      deletedBuiltInIds: parsed.deletedBuiltInIds ?? [],
    };
  } catch {
    return createEmptyState();
  }
}

export function saveCollectionLibraryState(state: CollectionLibraryState) {
  localStorage.setItem(COLLECTION_LIBRARY_KEY, JSON.stringify(state));
}

export function buildCollectionItemLibrary(baseCollections: readonly RankCollection[]) {
  return [...buildItemCatalog(baseCollections).values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
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

      return {
        ...collection,
        name: override.name ?? collection.name,
        description,
        items: override.itemKeys ? resolveItems(override.itemKeys, catalog) : collection.items,
      };
    });

  const customCollections: RankCollection[] = state.customCollections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    items: resolveItems(collection.itemKeys, catalog),
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
    const builtInItemKeys = builtInCollection.items.map(getCollectionLibraryItemKey);

    if (haveSameItemKeys(updatedItemKeys, builtInItemKeys)) {
      delete nextOverride.itemKeys;
    } else {
      nextOverride.itemKeys = updatedItemKeys;
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
