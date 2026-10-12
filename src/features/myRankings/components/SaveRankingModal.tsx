import { useState } from 'react';
import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import type { StoredRanking } from '../model/savedRankings';
import styles from './SaveRankingModal.module.css';

type Props = {
  collectionId: string;
  savedRankings: readonly StoredRanking[];
  onSave: (overwriteId?: string) => Promise<void>;
  onClose: () => void;
};

export function SaveRankingModal({ collectionId, savedRankings, onSave, onClose }: Props) {
  const matches = savedRankings.filter((ranking) => ranking.savedAt !== null && ranking.collectionId === collectionId);
  const [mode, setMode] = useState<'new' | 'overwrite'>('new');
  const [target, setTarget] = useState(matches[0]?.id ?? '');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (mode === 'overwrite' && !target) return;
    setWorking(true);
    setError('');
    try { await onSave(mode === 'overwrite' ? target : undefined); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save ranking.'); }
    finally { setWorking(false); }
  }

  return (
    <Modal className={styles.modal} aria-label="Save ranking">
      <h2>Save Ranking</h2>
      <p>Keep this ranking in My Rankings for as long as you want.</p>
      <label className={styles.choice}>
        <input type="radio" name="save-mode" checked={mode === 'new'} disabled={working}
          onChange={() => setMode('new')} />
        <span><strong>Save as new ranking</strong><small>Keep this result as a separate ranking.</small></span>
      </label>
      {matches.length > 0 && (
        <label className={styles.choice}>
          <input type="radio" name="save-mode" checked={mode === 'overwrite'} disabled={working}
            onChange={() => setMode('overwrite')} />
          <span><strong>Overwrite existing ranking</strong><small>Replace a saved ranking for this collection.</small></span>
        </label>
      )}
      {mode === 'overwrite' && matches.length > 0 && (
        <div className={styles.field}>
          <label htmlFor="overwrite-ranking">Ranking to replace</label>
          <select id="overwrite-ranking" value={target} disabled={working} onChange={(e) => setTarget(e.target.value)}>
            {matches.map((ranking) => (
              <option key={ranking.id} value={ranking.id}>
                {ranking.name} — {new Date(ranking.completedAt).toLocaleDateString()}
              </option>
            ))}
          </select>
          <span className={styles.warning}>The selected saved result will be replaced. This cannot be undone.</span>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <Button onClick={onClose} disabled={working}>Cancel</Button>
        <Button variant="primary" disabled={working || (mode === 'overwrite' && !target)} onClick={() => void submit()}>
          {working ? 'Saving…' : mode === 'overwrite' ? 'Overwrite Ranking' : 'Save Ranking'}
        </Button>
      </div>
    </Modal>
  );
}
