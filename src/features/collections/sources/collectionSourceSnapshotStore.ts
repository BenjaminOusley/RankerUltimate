import type { CollectionSourceSnapshot } from './collectionSourceSnapshots';

const DATABASE_NAME = 'rankerultimate';
const DATABASE_VERSION = 1;
const SNAPSHOT_STORE = 'collectionSourceSnapshots';

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve<IDBDatabase | null>(null);
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, {
          keyPath: 'collectionId',
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open source cache.'));
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Source cache transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Source cache transaction was aborted.'));
  });
}

export async function loadCollectionSourceSnapshots(): Promise<CollectionSourceSnapshot[]> {
  const database = await openDatabase();

  if (!database) {
    return [];
  }

  try {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readonly');
    const request = transaction.objectStore(SNAPSHOT_STORE).getAll();

    const snapshots = await new Promise<CollectionSourceSnapshot[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as CollectionSourceSnapshot[]);
      request.onerror = () => reject(request.error ?? new Error('Failed to load source cache.'));
    });

    await waitForTransaction(transaction);

    return snapshots.filter((snapshot) => snapshot?.version === 1);
  } finally {
    database.close();
  }
}

export async function saveCollectionSourceSnapshot(snapshot: CollectionSourceSnapshot) {
  const database = await openDatabase();

  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    transaction.objectStore(SNAPSHOT_STORE).put(snapshot);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function deleteCollectionSourceSnapshot(collectionId: string) {
  const database = await openDatabase();

  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite');
    transaction.objectStore(SNAPSHOT_STORE).delete(collectionId);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
