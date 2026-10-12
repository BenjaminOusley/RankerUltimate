import { useCallback, useEffect, useState } from 'react';
import {
  getRanking,
  listRankings,
  overwriteRanking,
  putRanking,
  removeRanking,
} from '../storage/rankingStorage';
import { isExpiredRecent, type StoredRanking } from '../model/savedRankings';

export function useMyRankings() {
  const [rankings, setRankings] = useState<StoredRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setRankings(await listRankings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ranking storage is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let canceled = false;

    void listRankings()
      .then((items) => {
        if (canceled) return;

        setRankings(items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (canceled) return;

        setError(reason instanceof Error ? reason.message : 'Ranking storage is unavailable.');
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, []);
  const addRecent = useCallback(
    async (record: StoredRanking) => {
      await putRanking(record);
      await refresh();
    },
    [refresh],
  );
  const save = useCallback(
    async (recentId: string, overwriteId?: string) => {
      const recent = await getRanking(recentId);
      if (!recent || isExpiredRecent(recent))
        throw new Error('This result is no longer available.');
      if (overwriteId) {
        const existing = await getRanking(overwriteId);
        if (
          !existing ||
          !existing.savedAt ||
          existing.collectionId !== recent.collectionId ||
          existing.id === recent.id
        ) {
          throw new Error('Select a saved ranking from the same collection to overwrite.');
        }
        await overwriteRanking(existing, recent);
      } else {
        const now = new Date().toISOString();
        await putRanking({ ...recent, savedAt: now, updatedAt: now });
      }
      await refresh();
    },
    [refresh],
  );
  const rename = useCallback(
    async (id: string, name: string) => {
      const existing = await getRanking(id);
      if (!existing || !existing.savedAt) throw new Error('Saved ranking not found.');
      if (!name.trim()) throw new Error('Enter a ranking name.');
      await putRanking({ ...existing, name: name.trim(), updatedAt: new Date().toISOString() });
      await refresh();
    },
    [refresh],
  );
  const remove = useCallback(
    async (id: string) => {
      await removeRanking(id);
      await refresh();
    },
    [refresh],
  );
  return { rankings, loading, error, refresh, addRecent, save, rename, remove };
}
