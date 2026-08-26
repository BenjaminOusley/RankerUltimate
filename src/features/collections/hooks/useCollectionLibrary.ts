import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RankCollection } from '@/domain/models';
import { refreshCollectionSource } from '../api/refreshCollectionSource';
import {
  buildCollectionCandidateItems,
  buildCollectionItemLibrary,
  createCustomCollection,
  deleteCollectionFromLibrary,
  loadCollectionLibraryState,
  materializeCollections,
  saveCollectionLibraryState,
  updateCollectionInLibrary,
} from '../library/collectionLibrary';
import {
  applyCollectionSourceSnapshots,
  createCollectionSourceSnapshot,
  type CollectionSourceSnapshot,
  upsertCollectionSourceSnapshot,
} from '../sources/collectionSourceSnapshots';
import {
  deleteCollectionSourceSnapshot,
  loadCollectionSourceSnapshots,
  saveCollectionSourceSnapshot,
} from '../sources/collectionSourceSnapshotStore';

export function useCollectionLibrary(baseCollections: readonly RankCollection[]) {
  const [libraryState, setLibraryState] = useState(() =>
    loadCollectionLibraryState(baseCollections),
  );
  const [sourceSnapshots, setSourceSnapshots] = useState<CollectionSourceSnapshot[]>([]);

  useEffect(() => {
    saveCollectionLibraryState(libraryState);
  }, [libraryState]);

  useEffect(() => {
    let cancelled = false;

    void loadCollectionSourceSnapshots()
      .then((snapshots) => {
        if (!cancelled) {
          setSourceSnapshots(snapshots);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load collection source cache:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sourceCollections = useMemo(
    () => applyCollectionSourceSnapshots(baseCollections, sourceSnapshots),
    [baseCollections, sourceSnapshots],
  );

  const availableCollections = useMemo(
    () => materializeCollections(sourceCollections, libraryState),
    [sourceCollections, libraryState],
  );

  const itemLibrary = useMemo(
    () => buildCollectionItemLibrary(sourceCollections),
    [sourceCollections],
  );

  const getCandidateItems = useCallback(
    (collectionId: string | null) =>
      buildCollectionCandidateItems(sourceCollections, collectionId),
    [sourceCollections],
  );

  const createCollection = useCallback((name: string, description: string) => {
    const createdId = `custom:${crypto.randomUUID()}`;

    setLibraryState((previous) =>
      createCustomCollection(previous, name, description, createdId).state,
    );

    return createdId;
  }, []);

  const updateCollection = useCallback(
    (updatedCollection: RankCollection, itemsChanged: boolean) => {
      setLibraryState((previous) =>
        updateCollectionInLibrary(
          previous,
          sourceCollections,
          updatedCollection,
          itemsChanged,
        ),
      );
    },
    [sourceCollections],
  );

  const refreshCollectionCandidates = useCallback(
    async (collectionId: string) => {
      const baseCollection = baseCollections.find(
        (collection) => collection.id === collectionId,
      );

      if (!baseCollection) {
        throw new Error('Collection source was not found.');
      }

      if (baseCollection.candidateSource?.kind !== 'generated') {
        throw new Error('This collection does not have a refreshable source.');
      }

      const result = await refreshCollectionSource(baseCollection);
      const snapshot = createCollectionSourceSnapshot(
        baseCollection,
        result.collection,
      );

      await saveCollectionSourceSnapshot(snapshot);

      setSourceSnapshots((previous) =>
        upsertCollectionSourceSnapshot(previous, snapshot),
      );

    },
    [baseCollections],
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      setLibraryState((previous) =>
        deleteCollectionFromLibrary(previous, sourceCollections, collectionId),
      );

      setSourceSnapshots((previous) =>
        previous.filter((snapshot) => snapshot.collectionId !== collectionId),
      );

      void deleteCollectionSourceSnapshot(collectionId).catch((error: unknown) => {
        console.error('Failed to delete collection source cache:', error);
      });
    },
    [sourceCollections],
  );

  return {
    availableCollections,
    itemLibrary,
    getCandidateItems,
    refreshCollectionCandidates,
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
