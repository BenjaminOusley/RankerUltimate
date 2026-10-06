import { getCanonicalItemKey, getLegacyItemKeys } from '@/domain/itemIdentity';
import type {
  CollectionGroupId,
  RankCollection,
  RankItem,
  RefreshableCollectionSource,
} from '@/domain/models';
import {
  getCollectionGroupId,
  getCollectionPermissions,
} from '../model/collectionGroups';

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
  groupId?: CollectionGroupId;
};

type GeneratedCollectionRecord = {
  id: string;
  name: string;
  description?: string;
  candidateSource: RefreshableCollectionSource;
  excludedItemKeys: string[];
  groupId?: CollectionGroupId;
};

export type CollectionLibraryState = {
  version: 3;
  customCollections: CustomCollectionRecord[];
  generatedCollections: GeneratedCollectionRecord[];
  overrides: Record<string, CollectionOverride>;
  deletedBuiltInIds: string[];
};

type CollectionLibraryStateV2 = {
  version: 2;
  customCollections?: CustomCollectionRecord[];
  overrides?: Record<string, CollectionOverride>;
  deletedBuiltInIds?: string[];
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
const COLLECTION_LIBRARY_KEY_V3 = 'rankerultimate:collections:v3';

function createEmptyState(): CollectionLibraryState {
  return {
    version: 3,
    customCollections: [],
    generatedCollections: [],
    overrides: {},
    deletedBuiltInIds: [],
  };
}

function sanitizeLockedBuiltInState(
  state: CollectionLibraryState,
  baseCollections: readonly RankCollection[],
): CollectionLibraryState {
  const lockedBuiltInIds = new Set(
    baseCollections
      .filter(
        (collection) =>
          collection.isBuiltIn &&
          !getCollectionPermissions(collection).edit &&
          !getCollectionPermissions(collection).delete,
      )
      .map((collection) => collection.id),
  );

  if (lockedBuiltInIds.size === 0) {
    return state;
  }

  const overrides = Object.fromEntries(
    Object.entries(state.overrides).filter(
      ([collectionId]) => !lockedBuiltInIds.has(collectionId),
    ),
  );
  const deletedBuiltInIds = state.deletedBuiltInIds.filter(
    (collectionId) => !lockedBuiltInIds.has(collectionId),
  );

  if (
    Object.keys(overrides).length === Object.keys(state.overrides).length &&
    deletedBuiltInIds.length === state.deletedBuiltInIds.length
  ) {
    return state;
  }

  return {
    ...state,
    overrides,
    deletedBuiltInIds,
  };
}

export function getCollectionLibraryItemKey(item: RankItem) {
  return getCanonicalItemKey(item);
}

function buildItemCatalog(collections: readonly RankCollection[]) {
  const catalog = new Map<string, RankItem>();

  for (const collection of collections) {
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
  return [
    ...new Set(
      keys.map((key) => aliases.get(key)).filter((key): key is string => Boolean(key)),
    ),
  ];
}

function resolveItems(keys: readonly string[], catalog: Map<string, RankItem>) {
  return keys
    .map((key) => catalog.get(key))
    .filter((item): item is RankItem => Boolean(item));
}

function migrateLegacyState(
  legacyState: LegacyCollectionLibraryState,
  baseCollections: readonly RankCollection[],
): CollectionLibraryState {
  const aliases = buildItemAliasCatalog(baseCollections);

  const customCollections: CustomCollectionRecord[] = (
    legacyState.customCollections ?? []
  ).map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    itemKeys: normalizeItemKeys(collection.itemKeys ?? [], aliases),
    groupId: 'various',
  }));

  const overrides: Record<string, CollectionOverride> = {};

  for (const [collectionId, legacyOverride] of Object.entries(
    legacyState.overrides ?? {},
  )) {
    const nextOverride: CollectionOverride = {};

    if (legacyOverride.name !== undefined) {
      nextOverride.name = legacyOverride.name;
    }

    if (legacyOverride.description !== undefined) {
      nextOverride.description = legacyOverride.description;
    }

    if (legacyOverride.itemKeys) {
      const baseCollection = baseCollections.find(
        (collection) => collection.id === collectionId,
      );

      if (baseCollection) {
        const selectedKeys = new Set(
          normalizeItemKeys(legacyOverride.itemKeys, aliases),
        );

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
    version: 3,
    customCollections,
    generatedCollections: [],
    overrides,
    deletedBuiltInIds: legacyState.deletedBuiltInIds ?? [],
  };
}

function migrateV2State(state: CollectionLibraryStateV2): CollectionLibraryState {
  return {
    version: 3,
    customCollections: state.customCollections ?? [],
    generatedCollections: [],
    overrides: state.overrides ?? {},
    deletedBuiltInIds: state.deletedBuiltInIds ?? [],
  };
}

export function loadCollectionLibraryState(
  baseCollections: readonly RankCollection[],
): CollectionLibraryState {
  try {
    const currentRaw = localStorage.getItem(COLLECTION_LIBRARY_KEY_V3);

    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as Partial<CollectionLibraryState>;

      if (parsed.version === 3) {
        return sanitizeLockedBuiltInState(
          {
            version: 3,
            customCollections: parsed.customCollections ?? [],
            generatedCollections: parsed.generatedCollections ?? [],
            overrides: parsed.overrides ?? {},
            deletedBuiltInIds: parsed.deletedBuiltInIds ?? [],
          },
          baseCollections,
        );
      }
    }

    const v2Raw = localStorage.getItem(COLLECTION_LIBRARY_KEY_V2);

    if (v2Raw) {
      const parsed = JSON.parse(v2Raw) as CollectionLibraryStateV2;

      if (parsed.version === 2) {
        return sanitizeLockedBuiltInState(migrateV2State(parsed), baseCollections);
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

    return sanitizeLockedBuiltInState(
      migrateLegacyState(legacyState, baseCollections),
      baseCollections,
    );
  } catch {
    return createEmptyState();
  }
}

export function saveCollectionLibraryState(state: CollectionLibraryState) {
  localStorage.setItem(COLLECTION_LIBRARY_KEY_V3, JSON.stringify(state));
  localStorage.removeItem(COLLECTION_LIBRARY_KEY_V2);
  localStorage.removeItem(COLLECTION_LIBRARY_KEY_V1);
}

export function buildStoredGeneratedCollectionShells(
  state: CollectionLibraryState,
): RankCollection[] {
  return state.generatedCollections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    candidateSource: collection.candidateSource,
    groupId: collection.groupId ?? 'various',
    items: [],
  }));
}

export function buildCollectionItemLibrary(collections: readonly RankCollection[]) {
  return [...buildItemCatalog(collections).values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  );
}

export function buildCollectionCandidateItems(
  sourceCollections: readonly RankCollection[],
  collectionId: string | null,
) {
  if (collectionId) {
    const sourceCollection = sourceCollections.find(
      (collection) => collection.id === collectionId,
    );

    if (sourceCollection) {
      return [...sourceCollection.items].sort((first, second) =>
        first.name.localeCompare(second.name),
      );
    }
  }

  return buildCollectionItemLibrary(sourceCollections);
}

export function materializeCollections(
  sourceCollections: readonly RankCollection[],
  state: CollectionLibraryState,
): RankCollection[] {
  const catalog = buildItemCatalog(sourceCollections);
  const deletedIds = new Set(state.deletedBuiltInIds);
  const generatedIds = new Set(
    state.generatedCollections.map((collection) => collection.id),
  );

  const builtInCollections = sourceCollections
    .filter((collection) => {
      if (generatedIds.has(collection.id)) {
        return false;
      }

      if (
        collection.isBuiltIn &&
        !getCollectionPermissions(collection).delete
      ) {
        return true;
      }

      return !deletedIds.has(collection.id);
    })
    .map((collection) => {
      if (
        collection.isBuiltIn &&
        !getCollectionPermissions(collection).edit
      ) {
        return collection;
      }

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

  const generatedCollections: RankCollection[] = state.generatedCollections.map(
    (collection) => {
      const sourceCollection = sourceCollections.find(
        (candidate) => candidate.id === collection.id,
      );
      const excludedItemKeys = new Set(collection.excludedItemKeys);

      return {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        candidateSource: collection.candidateSource,
        groupId: collection.groupId ?? getCollectionGroupId(sourceCollection ?? {
          id: collection.id,
          name: collection.name,
          items: [],
          candidateSource: collection.candidateSource,
        }),
        items: (sourceCollection?.items ?? []).filter(
          (item) => !excludedItemKeys.has(getCollectionLibraryItemKey(item)),
        ),
      };
    },
  );

  const customCollections: RankCollection[] = state.customCollections.map(
    (collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      items: resolveItems(collection.itemKeys, catalog),
      candidateSource: {
        kind: 'custom',
      },
      groupId: collection.groupId ?? 'various',
    }),
  );

  return [...builtInCollections, ...generatedCollections, ...customCollections];
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
    groupId: 'various',
  };

  return {
    collectionId: id,
    state: {
      ...state,
      customCollections: [...state.customCollections, collection],
    },
  };
}

export function addGeneratedCollectionToLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  collection: RankCollection,
  selectedItemKeys: ReadonlySet<string> | null = null,
): CollectionLibraryState {
  const source = collection.candidateSource;

  if (source?.kind !== 'generated' && source?.kind !== 'composite') {
    throw new Error('Only refreshable collections can be added as source-backed collections.');
  }

  const duplicateId =
    sourceCollections.some((item) => item.id === collection.id) ||
    state.customCollections.some((item) => item.id === collection.id) ||
    state.generatedCollections.some((item) => item.id === collection.id);

  if (duplicateId) {
    throw new Error('A collection with that ID already exists.');
  }

  const trimmedDescription = collection.description?.trim();

  const excludedItemKeys = selectedItemKeys
    ? collection.items
        .map(getCollectionLibraryItemKey)
        .filter((itemKey) => !selectedItemKeys.has(itemKey))
    : [];

  const generatedCollection: GeneratedCollectionRecord = {
    id: collection.id,
    name: collection.name.trim(),
    ...(trimmedDescription
      ? {
          description: trimmedDescription,
        }
      : {}),
    candidateSource: source,
    excludedItemKeys,
    groupId: getCollectionGroupId(collection),
  };

  return {
    ...state,
    generatedCollections: [...state.generatedCollections, generatedCollection],
  };
}

export function updateCollectionInLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  updatedCollection: RankCollection,
  itemsChanged: boolean,
): CollectionLibraryState {
  const sourceDefinition = sourceCollections.find(
    (collection) => collection.id === updatedCollection.id,
  );

  if (sourceDefinition?.isBuiltIn && !getCollectionPermissions(sourceDefinition).edit) {
    return state;
  }

  const generatedIndex = state.generatedCollections.findIndex(
    (collection) => collection.id === updatedCollection.id,
  );

  const updatedItemKeys = updatedCollection.items.map(getCollectionLibraryItemKey);

  if (generatedIndex >= 0) {
    const existing = state.generatedCollections[generatedIndex];
    const sourceCollection = sourceCollections.find(
      (collection) => collection.id === updatedCollection.id,
    );
    const trimmedDescription = updatedCollection.description?.trim();

    const nextRecord: GeneratedCollectionRecord = {
      ...existing,
      name: updatedCollection.name.trim(),
      groupId: updatedCollection.groupId ?? existing.groupId ?? 'various',
      ...(trimmedDescription
        ? {
            description: trimmedDescription,
          }
        : {}),
    };

    if (!trimmedDescription) {
      delete nextRecord.description;
    }

    if (itemsChanged) {
      const selectedKeys = new Set(updatedItemKeys);

      nextRecord.excludedItemKeys = (sourceCollection?.items ?? [])
        .map(getCollectionLibraryItemKey)
        .filter((key) => !selectedKeys.has(key));
    }

    const generatedCollections = [...state.generatedCollections];
    generatedCollections[generatedIndex] = nextRecord;

    return {
      ...state,
      generatedCollections,
    };
  }

  const builtInCollection = sourceCollections.find(
    (collection) => collection.id === updatedCollection.id,
  );

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
      groupId:
        updatedCollection.groupId ??
        state.customCollections.find((collection) => collection.id === updatedCollection.id)?.groupId ??
        'various',
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
    deletedBuiltInIds: state.deletedBuiltInIds.filter(
      (id) => id !== updatedCollection.id,
    ),
  };
}


export function moveCollectionToGroupInLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  collectionId: string,
  groupId: CollectionGroupId,
): CollectionLibraryState {
  const sourceDefinition = sourceCollections.find((collection) => collection.id === collectionId);

  if (sourceDefinition?.isBuiltIn && !getCollectionPermissions(sourceDefinition).move) {
    return state;
  }

  const generatedIndex = state.generatedCollections.findIndex(
    (collection) => collection.id === collectionId,
  );

  if (generatedIndex >= 0) {
    const generatedCollections = [...state.generatedCollections];
    generatedCollections[generatedIndex] = {
      ...generatedCollections[generatedIndex],
      groupId,
    };

    return {
      ...state,
      generatedCollections,
    };
  }

  const customIndex = state.customCollections.findIndex(
    (collection) => collection.id === collectionId,
  );

  if (customIndex >= 0) {
    const customCollections = [...state.customCollections];
    customCollections[customIndex] = {
      ...customCollections[customIndex],
      groupId,
    };

    return {
      ...state,
      customCollections,
    };
  }

  return state;
}


export function moveCollectionsToGroupInLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  collectionIds: readonly string[],
  groupId: CollectionGroupId,
): CollectionLibraryState {
  return [...new Set(collectionIds)].reduce(
    (currentState, collectionId) =>
      moveCollectionToGroupInLibrary(
        currentState,
        sourceCollections,
        collectionId,
        groupId,
      ),
    state,
  );
}

export function deleteCollectionFromLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  collectionId: string,
): CollectionLibraryState {
  const sourceDefinition = sourceCollections.find((collection) => collection.id === collectionId);

  if (sourceDefinition?.isBuiltIn && !getCollectionPermissions(sourceDefinition).delete) {
    return state;
  }

  if (state.generatedCollections.some((collection) => collection.id === collectionId)) {
    return {
      ...state,
      generatedCollections: state.generatedCollections.filter(
        (collection) => collection.id !== collectionId,
      ),
    };
  }

  const builtIn = sourceCollections.some((collection) => collection.id === collectionId);

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

export function deleteCollectionsFromLibrary(
  state: CollectionLibraryState,
  sourceCollections: readonly RankCollection[],
  collectionIds: readonly string[],
): CollectionLibraryState {
  return [...new Set(collectionIds)].reduce(
    (currentState, collectionId) =>
      deleteCollectionFromLibrary(currentState, sourceCollections, collectionId),
    state,
  );
}
