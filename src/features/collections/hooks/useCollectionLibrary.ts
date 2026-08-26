import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RankCollection } from '@/domain/models';
import { refreshCollectionSource } from '../api/refreshCollectionSource';
import {
  addGeneratedCollectionToLibrary,
  buildCollectionCandidateItems,
  buildCollectionItemLibrary,
  buildStoredGeneratedCollectionShells,
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

  const generatedCollectionShells = useMemo(
    () => buildStoredGeneratedCollectionShells(libraryState),
    [libraryState],
  );

  const sourceDefinitions = useMemo(
    () => [...baseCollections, ...generatedCollectionShells],
    [baseCollections, generatedCollectionShells],
  );

  const sourceCollections = useMemo(
    () => applyCollectionSourceSnapshots(sourceDefinitions, sourceSnapshots),
    [sourceDefinitions, sourceSnapshots],
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

  const createGeneratedCollection = useCallback(
    async (collection: RankCollection) => {
      if (collection.candidateSource?.kind !== 'generated') {
        throw new Error('Generated collection is missing its source definition.');
      }

      const duplicateId = availableCollections.some(
        (existing) => existing.id === collection.id,
      );

      if (duplicateId) {
        throw new Error('A collection with that ID already exists.');
      }

      const snapshot = createCollectionSourceSnapshot(collection, collection);

      await saveCollectionSourceSnapshot(snapshot);

      setSourceSnapshots((previous) =>
        upsertCollectionSourceSnapshot(previous, snapshot),
      );

      setLibraryState((previous) =>
        addGeneratedCollectionToLibrary(previous, sourceDefinitions, collection),
      );

      return collection.id;
    },
    [availableCollections, sourceDefinitions],
  );

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
      const sourceCollection = sourceDefinitions.find(
        (collection) => collection.id === collectionId,
      );

      if (!sourceCollection) {
        throw new Error('Collection source was not found.');
      }

      if (sourceCollection.candidateSource?.kind !== 'generated') {
        throw new Error('This collection does not have a refreshable source.');
      }

      const result = await refreshCollectionSource(sourceCollection);
      const snapshot = createCollectionSourceSnapshot(
        sourceCollection,
        result.collection,
      );

      await saveCollectionSourceSnapshot(snapshot);

      setSourceSnapshots((previous) =>
        upsertCollectionSourceSnapshot(previous, snapshot),
      );
    },
    [sourceDefinitions],
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
    createGeneratedCollection,
    refreshCollectionCandidates,
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
