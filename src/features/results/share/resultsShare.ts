import type { ItemSource, RankCollection, RankItem } from '@/domain/models';
import type { RankingState } from '@/features/ranking/engine';
import {
  getItemStorageKey,
  getPersonalRating,
  type PersonalRatingMap,
} from '@/features/ratings/personalRatings';
import { formatPersonalRating } from '@/features/ratings/personalRating';
import { formatPreferenceScore, getDistribution } from '../model/results';

export const SHARED_RESULTS_VERSION = 1 as const;

export type SharedResultItem = {
  id: string;
  name: string;
  subtitle?: string;
  image?: string;
  source?: ItemSource;
  preferenceScore: number;
  personalRating: number | null;
};

export type SharedResultsSnapshot = {
  version: typeof SHARED_RESULTS_VERSION;
  createdAt: string;
  collection: {
    name: string;
    description?: string;
  };
  items: SharedResultItem[];
  comparisons: number;
  refinementCount: number;
};

export type ResultsContentOptions = {
  preferenceScores: boolean;
  personalRatings: boolean;
  summaryStats: boolean;
  distributions: boolean;
};

export const DEFAULT_RESULTS_CONTENT_OPTIONS: ResultsContentOptions = {
  preferenceScores: true,
  personalRatings: true,
  summaryStats: false,
  distributions: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}

function isSource(value: unknown): value is ItemSource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.provider === 'string' &&
    typeof value.id === 'string' &&
    isOptionalString(value.type)
  );
}

function isSharedResultItem(value: unknown): value is SharedResultItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isOptionalString(value.subtitle) &&
    isOptionalString(value.image) &&
    (value.source === undefined || isSource(value.source)) &&
    typeof value.preferenceScore === 'number' &&
    Number.isFinite(value.preferenceScore) &&
    value.preferenceScore >= 0 &&
    value.preferenceScore <= 10 &&
    (value.personalRating === null ||
      (typeof value.personalRating === 'number' &&
        Number.isFinite(value.personalRating) &&
        value.personalRating >= 0 &&
        value.personalRating <= 10))
  );
}

export function isSharedResultsSnapshot(value: unknown): value is SharedResultsSnapshot {
  if (!isRecord(value) || value.version !== SHARED_RESULTS_VERSION) {
    return false;
  }

  if (
    !isRecord(value.collection) ||
    typeof value.collection.name !== 'string' ||
    value.collection.name.length === 0
  ) {
    return false;
  }

  if (!isOptionalString(value.collection.description)) {
    return false;
  }

  return (
    typeof value.createdAt === 'string' &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= 500 &&
    value.items.every(isSharedResultItem) &&
    Number.isSafeInteger(value.comparisons) &&
    Number(value.comparisons) >= 0 &&
    Number.isSafeInteger(value.refinementCount) &&
    Number(value.refinementCount) >= 0
  );
}

export function createResultsSnapshot({
  collection,
  rankingState,
  preferenceScores,
  personalRatings,
}: {
  collection: RankCollection;
  rankingState: RankingState;
  preferenceScores: Record<string, number>;
  personalRatings: PersonalRatingMap;
}): SharedResultsSnapshot {
  return {
    version: SHARED_RESULTS_VERSION,
    createdAt: new Date().toISOString(),
    collection: {
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
    },
    items: rankingState.ranked.map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      ...(item.image ? { image: item.image } : {}),
      ...(item.source ? { source: item.source } : {}),
      preferenceScore: preferenceScores[item.id] ?? 0,
      personalRating: getPersonalRating(personalRatings, item),
    })),
    comparisons: rankingState.comparisons,
    refinementCount: rankingState.outcomes.filter((outcome) => outcome.phase === 'refinement').length,
  };
}

export function snapshotToResultsData(snapshot: SharedResultsSnapshot) {
  const items: RankItem[] = snapshot.items.map((item) => ({
    id: item.id,
    name: item.name,
    ...(item.subtitle ? { subtitle: item.subtitle } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(item.source ? { source: item.source } : {}),
  }));

  const preferenceScores = Object.fromEntries(
    snapshot.items.map((item) => [item.id, item.preferenceScore]),
  );

  const personalRatings: PersonalRatingMap = {};

  for (const [index, item] of items.entries()) {
    const rating = snapshot.items[index]?.personalRating ?? null;

    if (rating === null) {
      continue;
    }

    const key = getItemStorageKey(item);

    personalRatings[key] = {
      value: rating,
      updatedAt: snapshot.createdAt,
    };
  }

  return {
    items,
    preferenceScores,
    personalRatings,
  };
}

export function getSnapshotDistributions(snapshot: SharedResultsSnapshot) {
  const ratedItems = snapshot.items.filter((item) => item.personalRating !== null);

  return {
    preference: getDistribution(snapshot.items.map((item) => item.preferenceScore)),
    personalRating: getDistribution(
      ratedItems.map((item) => item.personalRating ?? 0),
    ),
    ratedCount: ratedItems.length,
  };
}

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Full ranking is always present; only optional display details may be hidden. */
export function createShareText(
  snapshot: SharedResultsSnapshot,
  options: ResultsContentOptions = DEFAULT_RESULTS_CONTENT_OPTIONS,
) {
  const lines = [snapshot.collection.name, `${snapshot.items.length} ranked results`, '', 'Full ranking'];

  snapshot.items.forEach((item, index) => {
    const details = [item.subtitle ? `(${item.subtitle})` : ''];
    if (options.preferenceScores) {
      details.push(`Ranking Score ${formatPreferenceScore(item.preferenceScore)}`);
    }
    if (options.personalRatings && item.personalRating !== null) {
      details.push(`Personal Rating ${formatPersonalRating(item.personalRating)}`);
    }
    lines.push(`${index + 1}. ${item.name}${details.filter(Boolean).length ? ` — ${details.filter(Boolean).join(' · ')}` : ''}`);
  });

  if (options.summaryStats) {
    const rated = snapshot.items.filter((item) => item.personalRating !== null).length;
    lines.push('', 'Summary', `Items ranked: ${snapshot.items.length}`, `Comparisons: ${snapshot.comparisons}`, `Personally rated: ${rated}/${snapshot.items.length}`);
  }
  if (options.distributions) {
    const values = getSnapshotDistributions(snapshot);
    const buckets = ['0–2', '2–4', '4–6', '6–8', '8–10'];
    lines.push('', 'Ranking score distribution', buckets.map((bucket, index) => `${bucket}: ${percentage(values.preference[index] ?? 0)}`).join(' · '));
    if (values.ratedCount > 0) {
      lines.push('Personal rating distribution', buckets.map((bucket, index) => `${bucket}: ${percentage(values.personalRating[index] ?? 0)}`).join(' · '));
    }
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

type ResultMetadataLabel = 'Years Aired' | 'Release Year' | 'Publication Year' | 'Details';

/** Identify what an individual item's subtitle actually represents, without guessing. */
export function getResultItemMetadataLabel(item: SharedResultItem): ResultMetadataLabel {
  const type = item.source?.type?.toLowerCase();
  const value = item.subtitle?.trim() ?? '';
  if (type === 'tv' && /^\d{4}(?:[–-](?:\d{4})?)?$/.test(value)) return 'Years Aired';
  if ((type === 'movie' || type === 'game') && /^\d{4}$/.test(value)) return 'Release Year';
  if (type === 'book' && /^\d{4}$/.test(value)) return 'Publication Year';
  return 'Details';
}

/** CSV has one header per column; a mixed meaning must have a neutral heading. */
export function getResultMetadataLabel(items: SharedResultItem[]) {
  const populated = items.filter((item) => item.subtitle);
  if (populated.length === 0) return 'Details';
  const labels = populated.map(getResultItemMetadataLabel);
  return labels.every((label) => label === labels[0]) ? labels[0] : 'Details';
}

const JSON_METADATA_KEYS = {
  'Release Year': 'releaseYear',
  'Years Aired': 'yearsAired',
  'Publication Year': 'publicationYear',
  Details: 'details',
} as const;

export function createItemsCsv(
  snapshot: SharedResultsSnapshot,
  options: ResultsContentOptions = DEFAULT_RESULTS_CONTENT_OPTIONS,
) {
  const headers = ['Rank', 'Title', getResultMetadataLabel(snapshot.items)];
  if (options.preferenceScores) headers.push('Ranking Score');
  if (options.personalRatings) headers.push('Personal Rating');
  const rows = [headers.map(csvCell).join(',')];
  snapshot.items.forEach((item, index) => {
    const values: Array<string | number | null> = [index + 1, item.name, item.subtitle ?? ''];
    if (options.preferenceScores) values.push(formatPreferenceScore(item.preferenceScore));
    if (options.personalRatings) values.push(item.personalRating === null ? '' : formatPersonalRating(item.personalRating));
    rows.push(values.map(csvCell).join(','));
  });
  return rows.join('\r\n');
}

/** Public-facing ranking data only: no app state, provider IDs, or source metadata. */
export function createJsonExport(
  snapshot: SharedResultsSnapshot,
  options: ResultsContentOptions = DEFAULT_RESULTS_CONTENT_OPTIONS,
) {
  const results = snapshot.items.map((item, index) => ({
    rank: index + 1,
    title: item.name,
    ...(item.subtitle ? {
      [JSON_METADATA_KEYS[getResultItemMetadataLabel(item)]]: item.subtitle,
    } : {}),
    ...(options.preferenceScores ? { rankingScore: Number(formatPreferenceScore(item.preferenceScore)) } : {}),
    ...(options.personalRatings ? { personalRating: item.personalRating } : {}),
  }));
  return `${JSON.stringify(results, null, 2)}\n`;
}

/** Keep the user-facing collection title in filenames, excluding only OS-reserved characters. */
export function createRankedFilename(name: string, extension: 'png' | 'txt' | 'json' | 'csv') {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, '')
    .split('').filter((character) => character.charCodeAt(0) >= 32).join('')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100) || 'Ranking';
  return `${safeName} Ranked.${extension}`;
}

export function createSafeFilename(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return normalized || 'ranking-results';
}

export function downloadTextFile(filename: string, contents: string, contentType: string) {
  const blob = new Blob([contents], { type: contentType });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('Clipboard copy is not available in this browser.');
  }
}

export async function createSharedResultsLink(snapshot: SharedResultsSnapshot) {
  const response = await fetch('/api/share-result', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  const body = (await response.json()) as { id?: string; error?: string };

  if (!response.ok || !body.id) {
    throw new Error(body.error ?? 'Could not create the shared results link.');
  }

  const url = new URL(window.location.origin);
  url.searchParams.set('share', body.id);

  return url.toString();
}

export async function fetchSharedResultsSnapshot(shareId: string) {
  const url = new URL('/api/share-result', window.location.origin);
  url.searchParams.set('id', shareId);

  const response = await fetch(url);
  const body = (await response.json()) as { snapshot?: unknown; error?: string };

  if (!response.ok || !isSharedResultsSnapshot(body.snapshot)) {
    throw new Error(body.error ?? 'Could not load these shared results.');
  }

  return body.snapshot;
}
