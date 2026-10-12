import { isExpiredRecent, isValidStoredRanking, type StoredRanking } from '../model/savedRankings';

const NAME = 'rankerultimate-saved-rankings';
const STORE = 'rankings';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is unavailable. Your rankings could not be saved.'));
      return;
    }
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ranking storage could not be opened.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    let value: T;
    request.onsuccess = () => { value = request.result; };
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Ranking storage failed.')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Ranking storage was canceled.')); };
  });
}

export function putRanking(record: StoredRanking) { return transact('readwrite', (store) => store.put(record)); }
export function removeRanking(id: string) { return transact('readwrite', (store) => store.delete(id)); }
export function getRanking(id: string): Promise<StoredRanking | undefined> {
  return transact('readonly', (store) => store.get(id));
}
export async function listRankings() {
  const raw = await transact<unknown[]>('readonly', (store) => store.getAll());
  const valid = raw.filter(isValidStoredRanking);
  const expired = valid.filter((r) => isExpiredRecent(r));
  if (expired.length > 0) {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const item of expired) store.delete(item.id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }
  return valid.filter((r) => !isExpiredRecent(r)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Write the replacement and delete its temporary result atomically. */
export async function overwriteRanking(existing: StoredRanking, recent: StoredRanking) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put({ ...recent, id: existing.id, name: existing.name, createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(), savedAt: existing.savedAt } satisfies StoredRanking);
    if (existing.id !== recent.id) store.delete(recent.id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
