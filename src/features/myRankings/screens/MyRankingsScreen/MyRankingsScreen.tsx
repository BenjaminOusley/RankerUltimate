import { useMemo, useState } from 'react';
import type { RankCollection } from '@/domain/models';
import type { PersonalRatingMap } from '@/features/ratings/personalRatings';
import { ResultsShareExportModal } from '@/features/results/components/ResultsShareExportModal/ResultsShareExportModal';
import { AppShell } from '@/app/AppShell';
import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import { CollectionArtwork } from '@/features/collections/components/CollectionArtwork/CollectionArtwork';
import { formatPreferenceScore } from '@/features/results/model/results';
import { SaveRankingModal } from '../../components/SaveRankingModal';
import { daysUntilExpiry, rankingToLiveSnapshot, rankingToResultsData, savedRankingMatches, type StoredRanking } from '../../model/savedRankings';
import styles from './MyRankingsScreen.module.css';

type Props = {
  rankings: readonly StoredRanking[];
  personalRatings: PersonalRatingMap;
  loading: boolean;
  error: string | null;
  onStartRanking: () => void;
  onOpen: (id: string) => void;
  onSave: (id: string, overwriteId?: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};
type Filter = 'all' | 'movies-tv' | 'games' | 'books' | 'other';
type Sort = 'recent' | 'oldest' | 'name' | 'items';
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'movies-tv', label: 'Movies & TV' },
  { id: 'games', label: 'Games' }, { id: 'books', label: 'Books' }, { id: 'other', label: 'Other' },
];
const groupLabels: Record<string, string> = {
  'movies-tv': 'Movies & TV', games: 'Games', books: 'Books', various: 'Other',
};
function Artwork({ ranking }: { ranking: StoredRanking }) {
  const data = rankingToResultsData(ranking);
  const collection: RankCollection = { id: ranking.collectionId, name: ranking.name, items: data.items };
  return <CollectionArtwork collection={collection} />;
}
function dateLabel(value: string) { return new Date(value).toLocaleDateString(); }

export function MyRankingsScreen({ rankings, personalRatings, loading, error, onStartRanking, onOpen, onSave, onRename, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');

  const visible = useMemo(() => [...rankings].filter((r) => savedRankingMatches(r, search, filter)).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'items') return b.items.length - a.items.length;
    return (Date.parse(b.completedAt) - Date.parse(a.completedAt)) * (sort === 'recent' ? 1 : -1);
  }), [rankings, filter, search, sort]);
  const saved = visible.filter((r) => r.savedAt !== null);
  const recent = visible.filter((r) => r.savedAt === null);
  const selected = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const deleting = rankings.find((r) => r.id === deletingId) ?? null;
  const renaming = rankings.find((r) => r.id === renamingId) ?? null;
  const saving = rankings.find((r) => r.id === savingId) ?? null;
  const sharing = rankings.find((r) => r.id === sharingId) ?? null;

  async function perform(action: () => Promise<void>, close: () => void) {
    setWorking(true); setActionError('');
    try { await action(); close(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'The action failed.'); }
    finally { setWorking(false); }
  }

  function cards(records: StoredRanking[]) {
    return (
      <div className={`${styles.cardGrid} ${layout === 'list' ? styles.listMode : ''}`}>
        {records.map((r) => (
          <button type="button" key={r.id} className={`${styles.card} ${selected?.id === r.id ? styles.selected : ''}`}
            onClick={() => setSelectedId(r.id)} onDoubleClick={() => onOpen(r.id)}>
            <Artwork ranking={r} />
            <span className={styles.cardCopy}>
              <strong title={r.name}>{r.name}</strong>
              <span>{groupLabels[r.groupId] ?? 'Other'}</span>
              <small>{r.items.length} items · {r.savedAt ? `Saved ${dateLabel(r.completedAt)}` : `${daysUntilExpiry(r)} days left`}</small>
            </span>
            <span className={styles.chevron}>›</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <AppShell>
      <ScenePanel className={styles.scene}>
        <SceneHeading className={styles.heading}>
          <div><h1>My Rankings</h1><p>Revisit and manage your completed rankings.</p></div>
          <Button variant="primary" onClick={onStartRanking}>＋ Start New Ranking</Button>
        </SceneHeading>
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Ranking categories">
            {filters.map((f) => <button type="button" key={f.id} className={filter === f.id ? styles.active : ''}
              aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
          <input type="search" className={styles.search} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your rankings…" aria-label="Search rankings" />
          <select className={styles.sort} value={sort} aria-label="Sort rankings" onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Most Recent</option><option value="oldest">Oldest</option>
            <option value="name">Name</option><option value="items">Most Items</option>
          </select>
          <select className={styles.sort} value={layout} aria-label="Ranking layout" onChange={(e) => setLayout(e.target.value as 'grid' | 'list')}>
            <option value="grid">Grid</option><option value="list">List</option>
          </select>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.body}>
          <div className={styles.scroll}>
            {loading && <p className={styles.empty}>Loading your rankings…</p>}
            {!loading && saved.length > 0 && (
              <section className={styles.section}>
                <h2>Saved Rankings</h2><p>Rankings you've chosen to keep.</p>
                {cards(saved)}
              </section>
            )}
            {!loading && recent.length > 0 && (
              <section className={styles.section}>
                <h2>Recent Rankings (Not Saved)</h2>
                <p>Automatically kept for 30 days. Save one to keep it permanently.</p>
                {cards(recent)}
              </section>
            )}
            {!loading && visible.length === 0 && (
              <div className={styles.empty}>
                <h2>{rankings.length ? 'No matching rankings' : 'No rankings yet'}</h2>
                <p>{rankings.length ? 'Try another search or category.' : 'Complete a ranking and it will appear here for 30 days.'}</p>
                {!rankings.length && <Button variant="primary" onClick={onStartRanking}>Start Your First Ranking</Button>}
              </div>
            )}
          </div>
          {selected && (
            <aside className={styles.details}>
              <div className={styles.detailHead}>
                <Artwork ranking={selected} />
                <div><h2>{selected.name}</h2><p>{selected.items.length} items · {selected.savedAt ? 'Saved' : 'Recent'}</p>
                  <small>Completed {dateLabel(selected.completedAt)}</small></div>
              </div>
              <Button variant="primary" onClick={() => onOpen(selected.id)}>View Full Results</Button>
              <div className={styles.detailActions}>
                <Button onClick={() => setSharingId(selected.id)}>Share / Export</Button>
                {!selected.savedAt && <Button onClick={() => setSavingId(selected.id)}>Save Ranking</Button>}
                {selected.savedAt && <Button onClick={() => { setRenamingId(selected.id); setNewName(selected.name); }}>Rename</Button>}
                <Button variant="danger" onClick={() => setDeletingId(selected.id)}>Delete</Button>
              </div>
              <h3>Top 5</h3>
              <div className={styles.topItems}>
                {selected.items.slice(0, 5).map((item, index) => (
                  <div key={item.id} className={styles.topItem}>
                    <strong>{index + 1}</strong>
                    {item.image ? <img src={item.image} alt="" /> : <span className={styles.posterFallback}>?</span>}
                    <span title={item.name}>{item.name}</span>
                    <strong className={styles.score}>◆ {formatPreferenceScore(item.rankingScore)}</strong>
                  </div>
                ))}
              </div>
              {!selected.savedAt && <p className={styles.expiry}>{daysUntilExpiry(selected)} days until this unsaved result expires.</p>}
            </aside>
          )}
        </div>
      </ScenePanel>
      {sharing && <ResultsShareExportModal open snapshot={rankingToLiveSnapshot(sharing, personalRatings)}
        onClose={() => setSharingId(null)} />}
      {saving && <SaveRankingModal collectionId={saving.collectionId} savedRankings={rankings}
        onSave={(id) => onSave(saving.id, id)} onClose={() => setSavingId(null)} />}
      {deleting && <Modal className={styles.confirm} aria-label="Delete ranking">
        <h2>Delete ranking?</h2><p>Delete <strong>{deleting.name}</strong>? This does not delete its collection or Personal Ratings.</p>
        {actionError && <p className={styles.error}>{actionError}</p>}
        <div className={styles.modalActions}><Button disabled={working} onClick={() => { setDeletingId(null); setActionError(''); }}>Cancel</Button>
          <Button variant="danger" disabled={working} onClick={() => void perform(() => onDelete(deleting.id), () => setDeletingId(null))}>
            {working ? 'Deleting…' : 'Delete Ranking'}</Button></div>
      </Modal>}
      {renaming && <Modal className={styles.confirm} aria-label="Rename ranking">
        <h2>Rename ranking</h2><input className={styles.renameInput} value={newName} maxLength={120}
          onChange={(e) => setNewName(e.target.value)} aria-label="Ranking name" />
        {actionError && <p className={styles.error}>{actionError}</p>}
        <div className={styles.modalActions}><Button disabled={working} onClick={() => { setRenamingId(null); setActionError(''); }}>Cancel</Button>
          <Button variant="primary" disabled={working || !newName.trim()} onClick={() => void perform(() => onRename(renaming.id, newName), () => setRenamingId(null))}>Save Name</Button></div>
      </Modal>}
    </AppShell>
  );
}
