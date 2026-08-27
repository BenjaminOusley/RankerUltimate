import type { RankCollection } from '@/domain/models';
import { isRefreshableCollectionSource } from '../sources/collectionSourceSnapshots';

export type CollectionSourceRefreshMeta = {
  candidateCount: number;
  validatedCount: number;
  missingPosterCount: number;
};

type RefreshCollectionSourceResponse = {
  collection?: RankCollection;
  meta?: CollectionSourceRefreshMeta;
  error?: string;
};

export function canRefreshCollectionSource(collection: RankCollection) {
  return isRefreshableCollectionSource(collection.candidateSource);
}

export async function refreshCollectionSource(collection: RankCollection): Promise<{
  collection: RankCollection;
  meta: CollectionSourceRefreshMeta;
}> {
  if (!canRefreshCollectionSource(collection)) {
    throw new Error('This collection does not have a refreshable source.');
  }

  const response = await fetch('/api/refresh-source', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      collectionId: collection.id,
      source: collection.candidateSource,
    }),
  });

  let result: RefreshCollectionSourceResponse;

  try {
    result = (await response.json()) as RefreshCollectionSourceResponse;
  } catch {
    throw new Error(`Collection refresh failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(result.error ?? `Collection refresh failed with HTTP ${response.status}.`);
  }

  if (!result.collection || !result.meta) {
    throw new Error('The collection source returned an incomplete refresh result.');
  }

  return {
    collection: result.collection,
    meta: result.meta,
  };
}
