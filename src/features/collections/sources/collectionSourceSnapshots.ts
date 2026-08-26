import type { CollectionCandidateSource, RankCollection, RankItem } from '@/domain/models';

export type GeneratedCollectionSource = Extract<
  CollectionCandidateSource,
  { kind: 'generated' }
>;

export type CollectionSourceSnapshot = {
  version: 1;
  collectionId: string;
  sourceFingerprint: string;
  refreshedAt: string;
  items: RankItem[];
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(',')}}`;
}

export function getGeneratedSourceFingerprint(source: GeneratedCollectionSource) {
  return stableSerialize({
    provider: source.provider,
    definition: source.definition,
  });
}

export function createCollectionSourceSnapshot(
  baseCollection: RankCollection,
  refreshedCollection: RankCollection,
  refreshedAt = new Date().toISOString(),
): CollectionSourceSnapshot {
  const source = baseCollection.candidateSource;

  if (source?.kind !== 'generated') {
    throw new Error('Only generated collections can create source snapshots.');
  }

  if (refreshedCollection.id !== baseCollection.id) {
    throw new Error('Refreshed collection ID does not match its source collection.');
  }

  return {
    version: 1,
    collectionId: baseCollection.id,
    sourceFingerprint: getGeneratedSourceFingerprint(source),
    refreshedAt,
    items: refreshedCollection.items,
  };
}

export function upsertCollectionSourceSnapshot(
  snapshots: readonly CollectionSourceSnapshot[],
  snapshot: CollectionSourceSnapshot,
) {
  return [
    ...snapshots.filter((item) => item.collectionId !== snapshot.collectionId),
    snapshot,
  ];
}

export function applyCollectionSourceSnapshots(
  baseCollections: readonly RankCollection[],
  snapshots: readonly CollectionSourceSnapshot[],
): RankCollection[] {
  const snapshotByCollectionId = new Map(
    snapshots.map((snapshot) => [snapshot.collectionId, snapshot]),
  );

  return baseCollections.map((collection) => {
    const source = collection.candidateSource;

    if (source?.kind !== 'generated') {
      return collection;
    }

    const snapshot = snapshotByCollectionId.get(collection.id);

    if (!snapshot || snapshot.version !== 1) {
      return collection;
    }

    if (snapshot.sourceFingerprint !== getGeneratedSourceFingerprint(source)) {
      return collection;
    }

    return {
      ...collection,
      items: snapshot.items,
    };
  });
}
