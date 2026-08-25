import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RankCollection } from '@/domain/models';
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

export function useCollectionLibrary(baseCollections: readonly RankCollection[]) {
  const [libraryState, setLibraryState] = useState(() =>
    loadCollectionLibraryState(baseCollections),
  );

  useEffect(() => {
    saveCollectionLibraryState(libraryState);
  }, [libraryState]);

  const availableCollections = useMemo(
    () => materializeCollections(baseCollections, libraryState),
    [baseCollections, libraryState],
  );

  const itemLibrary = useMemo(
    () => buildCollectionItemLibrary(baseCollections),
    [baseCollections],
  );

  const getCandidateItems = useCallback(
    (collectionId: string | null) => buildCollectionCandidateItems(baseCollections, collectionId),
    [baseCollections],
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
          baseCollections,
          updatedCollection,
          itemsChanged,
        ),
      );
    },
    [baseCollections],
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      setLibraryState((previous) =>
        deleteCollectionFromLibrary(previous, baseCollections, collectionId),
      );
    },
    [baseCollections],
  );

  return {
    availableCollections,
    itemLibrary,
    getCandidateItems,
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
