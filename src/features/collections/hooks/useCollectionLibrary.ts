import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RankCollection } from '@/models';
import {
  buildCollectionItemLibrary,
  createCustomCollection,
  deleteCollectionFromLibrary,
  loadCollectionLibraryState,
  materializeCollections,
  saveCollectionLibraryState,
  updateCollectionInLibrary,
} from '../library/collectionLibrary';

export function useCollectionLibrary(baseCollections: readonly RankCollection[]) {
  const [libraryState, setLibraryState] = useState(() => loadCollectionLibraryState());

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
    createCollection,
    updateCollection,
    deleteCollection,
  };
}
