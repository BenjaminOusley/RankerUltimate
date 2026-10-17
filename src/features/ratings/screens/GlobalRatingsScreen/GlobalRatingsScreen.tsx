import { useMemo, useRef, useState, type FormEvent } from 'react';

import { AppShell } from '@/app/AppShell';
import { getCanonicalItemKey } from '@/domain/itemIdentity';
import type { RankCollection, RankItem } from '@/domain/models';
import type { StoredRanking } from '@/features/myRankings/model/savedRankings';
import { Button } from '@/shared/components/Button/Button';
import { Poster } from '@/shared/components/Poster/Poster';
import { SceneHeading, ScenePanel } from '@/shared/components/Scene/Scene';
import { RatingPicker } from '../../components/RatingPicker/RatingPicker';
import { findRateItems, type DiscoverySource } from '../../discovery/findRateItems';
import { formatPersonalRating } from '../../personalRating';
import { getPersonalRating, type PersonalRatingMap } from '../../personalRatings';
import { itemKind, type RatedItemCatalog } from '../../ratingItemCatalog';
import {
  buildRatingCatalog,
  sortRatedItems,
  type RatedItem,
  type RatingSort,
} from './globalRatingsModel';
import styles from './GlobalRatingsScreen.module.css';

type Tab = 'rated' | 'unrated' | 'find';
type Kind = 'all' | 'movie' | 'tv' | 'game' | 'book' | 'other';
const PAGE_SIZES = [10, 25, 50, 100] as const;
const TYPES: { value: Kind; label: string }[] = [
  { value: 'all', label: 'All Types' }, { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' }, { value: 'game', label: 'Games' },
  { value: 'book', label: 'Books' }, { value: 'other', label: 'Other' },
];
const SEARCH_SOURCES: { value: DiscoverySource; label: string }[] = [
  { value: 'movie', label: 'Movies · TMDB' }, { value: 'tv', label: 'TV · TMDB' },
  { value: 'game', label: 'Games · IGDB' }, { value: 'book', label: 'Books · Hardcover' },
];
const SORT_OPTIONS: { value: RatingSort; label: string; ratedOnly?: boolean }[] = [
  { value: 'recent', label: 'Recently Updated' },
  { value: 'highest', label: 'Rating: High to Low', ratedOnly: true },
  { value: 'lowest', label: 'Rating: Low to High', ratedOnly: true },
  { value: 'nameAsc', label: 'Name: A–Z' },
  { value: 'nameDesc', label: 'Name: Z–A' },
  { value: 'dateDesc', label: 'Date: Newest' },
  { value: 'dateAsc', label: 'Date: Oldest' },
];
const typeLabel: Record<Exclude<Kind, 'all'>, string> = {
  movie: 'Movie', tv: 'TV Show', game: 'Game', book: 'Book', other: 'Other',
};

function dateSortLabel(kind: Kind, latest: boolean): string {
  const basis = kind === 'tv' ? 'First aired'
    : kind === 'book' ? 'Published'
      : kind === 'movie' || kind === 'game' ? 'Released' : 'Date';
  return `${basis}: ${latest ? 'Newest' : 'Oldest'}`;
}

function dateLabel(value: string | null): string {
  if (!value) return 'Not yet rated';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
}

function yearLabel(item: RankItem): string {
  const kind = itemKind(item);
  if (kind === 'tv') return 'First aired';
  if (kind === 'book') return 'Published';
  if (kind === 'game' || kind === 'movie') return 'Released';
  return 'Details';
}

export function GlobalRatingsScreen({
  collections, knownItems, rankings, rememberedItems, personalRatings, onUpdateRating,
}: {
  collections: readonly RankCollection[];
  knownItems: readonly RankItem[];
  rankings: readonly StoredRanking[];
  rememberedItems: RatedItemCatalog;
  personalRatings: PersonalRatingMap;
  onUpdateRating: (item: RankItem, value: number | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('rated');
  const [filter, setFilter] = useState<Kind>('all');
  const [sort, setSort] = useState<RatingSort>('recent');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [source, setSource] = useState<DiscoverySource>('movie');
  const [findQuery, setFindQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RankItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSerial = useRef(0);

  const catalog = useMemo(() => buildRatingCatalog(
    collections, knownItems, rankings, rememberedItems, personalRatings,
  ), [collections, knownItems, rankings, rememberedItems, personalRatings]);
  const ratedCount = catalog.filter((entry) => entry.rating !== null).length;

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pool: RatedItem[] = tab === 'find' ? searchResults.map((item) => ({
      key: getCanonicalItemKey(item), item, rating: getPersonalRating(personalRatings, item),
      updatedAt: personalRatings[getCanonicalItemKey(item)]?.updatedAt ?? null,
    })) : catalog.filter((entry) => tab === 'rated'
      ? entry.rating !== null
      : entry.rating === null);
    const matches = pool.filter(({ item }) =>
      (tab === 'find' || filter === 'all' || itemKind(item) === filter) &&
      (tab === 'find' || !normalized || `${item.name} ${item.subtitle ?? ''}`.toLowerCase().includes(normalized)),
    );
    return tab === 'find' ? matches : sortRatedItems(matches, sort);
  }, [tab, searchResults, catalog, filter, query, sort, personalRatings]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const displayed = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selected = displayed.find((entry) => entry.key === selectedKey) ?? displayed[0] ?? null;
  const canSortByRating = tab === 'rated';

  function switchTab(next: Tab) {
    requestSerial.current += 1;
    setTab(next);
    setSort('recent');
    setPage(0);
    setSelectedKey(null);
    setError(null);
    setWorking(false);
  }

  async function runSearch(nextSource: DiscoverySource, text: string) {
    if (text.length < 2) return;
    const serial = ++requestSerial.current;
    setWorking(true);
    setError(null);
    setSearched(true);
    setSearchResults([]);
    setSelectedKey(null);
    setPage(0);
    try {
      const found = await findRateItems(nextSource, text);
      if (serial === requestSerial.current) setSearchResults(found);
    } catch (reason) {
      if (serial === requestSerial.current) {
        setError(reason instanceof Error ? reason.message : 'The search provider did not respond.');
      }
    } finally {
      if (serial === requestSerial.current) setWorking(false);
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!working) void runSearch(source, findQuery.trim());
  }

  const placeholder = tab === 'rated'
    ? 'No matching rated items. Try another search, or use Find & Rate to discover something new.'
    : tab === 'unrated'
      ? 'No known items match these filters. You can also discover items through Find & Rate.'
      : searched ? 'No matching items found. Try another title or provider.' : 'Search a provider to find something to rate.';

  return <AppShell>
    <ScenePanel className={styles.scene}>
      <SceneHeading className={styles.heading}>
        <div><h1>Global Ratings</h1><p>Your Personal Ratings, independent of collections.</p></div>
        <div className={styles.stats}>
          <span><strong>{ratedCount}</strong><small>Items Rated</small></span>
          <span><strong>{catalog.length}</strong><small>Known Items</small></span>
        </div>
      </SceneHeading>
      <div className={styles.tabs} role="tablist" aria-label="Rating views">
        {([['rated', '★ My Ratings', 'Items you’ve rated'],
          ['unrated', '☆ Unrated Items', 'Browse known items'],
          ['find', '⌕ Find & Rate', 'Discover beyond collections']] as const).map(([id, label, description]) =>
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={tab === id ? styles.activeTab : ''} onClick={() => switchTab(id)}>
            <strong>{label}</strong><small>{description}</small>
          </button>)}
      </div>
      {tab === 'find' ? <form className={styles.toolbar} onSubmit={(event) => void search(event)}>
        <select aria-label="Provider to search" value={source} onChange={(e) => {
          const nextSource = e.target.value as DiscoverySource;
          setSource(nextSource);
          if (findQuery.trim().length >= 2) {
            void runSearch(nextSource, findQuery.trim());
          } else {
            requestSerial.current += 1;
            setSearchResults([]); setSearched(false); setError(null); setWorking(false); setPage(0); setSelectedKey(null);
          }
        }}>
          {SEARCH_SOURCES.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
        </select>
        <input type="search" aria-label="Find items to rate" placeholder="Search movies, shows, games, or books…"
          value={findQuery} maxLength={200} onChange={(e) => setFindQuery(e.target.value)} />
        <Button variant="primary" type="submit" disabled={working || findQuery.trim().length < 2}>
          {working ? 'Searching…' : 'Search'}
        </Button>
      </form> : <div className={styles.toolbar}>
        <input type="search" aria-label="Search your items" placeholder="Search your items…"
          value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); setSelectedKey(null); }} />
        <select aria-label="Filter type" value={filter} onChange={(e) => { setFilter(e.target.value as Kind); setPage(0); setSelectedKey(null); }}>
          {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
        <select aria-label="Sort items" value={sort} onChange={(e) => { setSort(e.target.value as RatingSort); setPage(0); setSelectedKey(null); }}>
          {SORT_OPTIONS.filter((option) => !option.ratedOnly || canSortByRating).map((option) =>
            <option key={option.value} value={option.value}>{option.value === 'dateDesc' ? dateSortLabel(filter, true) : option.value === 'dateAsc' ? dateSortLabel(filter, false) : option.label}</option>)}
        </select>
        <div className={styles.layoutToggle} aria-label="Item layout">
          <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button>
          <button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Grid</button>
        </div>
      </div>}
      {error && tab === 'find' ? <div className={styles.errorState} role="alert">
        <div className={styles.errorIcon} aria-hidden="true">!</div>
        <div className={styles.errorCopy}>
          <strong>Search couldn’t be completed</strong>
          <span>{error}</span>
          <small>Your existing ratings are safe. Check your connection or try another provider.</small>
        </div>
        <Button size="small" disabled={working} onClick={() => void runSearch(source, findQuery.trim())}>
          Try Again
        </Button>
      </div> : <div className={styles.body}>
        <div className={styles.listPane}>
          <div className={`${styles.items} ${layout === 'grid' && tab !== 'find' && displayed.length > 0 ? styles.grid : ''}`}>
            {displayed.map((entry, index) => <div key={entry.key}
              className={`${styles.itemRow} ${selected?.key === entry.key ? styles.chosen : ''}`}>
              <button type="button" className={styles.itemButton} onClick={() => setSelectedKey(entry.key)}
                aria-label={`Details for ${entry.item.name}`} aria-pressed={selected?.key === entry.key}>
                <span className={styles.rowNumber}>{currentPage * pageSize + index + 1}</span>
                <Poster item={entry.item} className={styles.poster} />
                <span className={styles.copy}>
                  <strong title={entry.item.name}>{entry.item.name}</strong>
                  <small>{typeLabel[itemKind(entry.item)]} {entry.item.subtitle ? `· ${entry.item.subtitle}` : ''}</small>
                </span>
              </button>
              {layout === 'list' && tab !== 'find' && <span className={styles.rowDate}>{entry.updatedAt ? dateLabel(entry.updatedAt) : ''}</span>}
              <RatingPicker value={entry.rating} onChange={(value) => onUpdateRating(entry.item, value)}
                label={`Personal Rating for ${entry.item.name}`} />
            </div>)}
            {displayed.length === 0 && <div className={styles.empty}>
              <span>{working ? 'Searching…' : placeholder}</span>
              {tab !== 'find' && <Button size="small" variant="primary" onClick={() => switchTab('find')}>Find & Rate</Button>}
            </div>}
          </div>
          {visible.length > 0 && <div className={styles.pager}>
            <span className={styles.pageCount}>Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, visible.length)} of {visible.length}</span>
            <label className={styles.pageSizeControl}>
              Per page
              <select aria-label="Items per page" value={pageSize} onChange={(e) => {
                setPageSize(Number(e.target.value)); setPage(0); setSelectedKey(null);
              }}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <Button size="small" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setSelectedKey(null); }}>Previous</Button>
            <span>{currentPage + 1} / {totalPages}</span>
            <Button size="small" disabled={currentPage >= totalPages - 1} onClick={() => { setPage(currentPage + 1); setSelectedKey(null); }}>Next</Button>
          </div>}
        </div>
        {selected && <aside className={styles.detailPane}>
          <div className={styles.detailHeader}>
            <Poster item={selected.item} className={styles.largePoster} />
            <div><h2>{selected.item.name}</h2>
              <p>{typeLabel[itemKind(selected.item)]}{selected.item.subtitle ? ` · ${selected.item.subtitle}` : ''}</p>
              <small>{selected.item.source?.provider.toUpperCase() ?? 'Custom Item'}</small>
            </div>
          </div>
          <div className={styles.editPanel}>
            <h3>My Personal Rating</h3>
            <strong className={selected.rating === null ? styles.unratedValue : styles.ratingValue}>
              {selected.rating === null ? 'Not rated' : `★ ${formatPersonalRating(selected.rating)}`}
            </strong>
          </div>
          <div className={styles.detailInfo}>
            <h3>Item Details</h3>
            <span>Type <strong>{typeLabel[itemKind(selected.item)]}</strong></span>
            {selected.item.subtitle && <span>{yearLabel(selected.item)} <strong>{selected.item.subtitle}</strong></span>}
            <span>Provider <strong>{selected.item.source?.provider.toUpperCase() ?? 'Custom'}</strong></span>
            {selected.updatedAt && <span>Last changed <strong>{dateLabel(selected.updatedAt)}</strong></span>}
          </div>
          <p className={styles.explanation}>Your rating follows this item across collections. Earlier rankings’ historical ratings and Ranking Scores stay unchanged.</p>
        </aside>}
      </div>}
    </ScenePanel>
  </AppShell>;
}
