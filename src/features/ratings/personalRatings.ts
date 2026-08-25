import { getCanonicalItemKey, getLegacyItemKeys } from '@/domain/itemIdentity';
import type { RankItem } from '@/domain/models';

export type PersonalRatingRecord = {
  value: number;
  updatedAt: string;
};

export type PersonalRatingMap = Record<string, PersonalRatingRecord>;

const PERSONAL_RATINGS_KEY_V1 = 'rankerultimate:personal-ratings:v1';
const PERSONAL_RATINGS_KEY_V2 = 'rankerultimate:personal-ratings:v2';

function isPersonalRatingRecord(value: unknown): value is PersonalRatingRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Partial<PersonalRatingRecord>;

  return (
    typeof record.value === 'number' &&
    Number.isFinite(record.value) &&
    typeof record.updatedAt === 'string'
  );
}

function parsePersonalRatingMap(raw: string): PersonalRatingMap {
  const parsed = JSON.parse(raw) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, PersonalRatingRecord] =>
      isPersonalRatingRecord(entry[1]),
    ),
  );
}

function buildLegacyAliasCatalog(items: readonly RankItem[]) {
  const aliases = new Map<string, string>();

  for (const item of items) {
    const canonicalKey = getCanonicalItemKey(item);

    for (const alias of getLegacyItemKeys(item)) {
      aliases.set(alias, canonicalKey);
    }
  }

  return aliases;
}

function preferNewestRating(
  existing: PersonalRatingRecord | undefined,
  candidate: PersonalRatingRecord,
) {
  if (!existing) {
    return candidate;
  }

  return candidate.updatedAt > existing.updatedAt ? candidate : existing;
}

export function getItemStorageKey(item: RankItem) {
  return getCanonicalItemKey(item);
}

export function migratePersonalRatings(
  ratings: PersonalRatingMap,
  items: readonly RankItem[],
): PersonalRatingMap {
  const aliases = buildLegacyAliasCatalog(items);
  const migrated: PersonalRatingMap = {};

  for (const [storedKey, record] of Object.entries(ratings)) {
    const canonicalKey = aliases.get(storedKey) ?? storedKey;
    migrated[canonicalKey] = preferNewestRating(migrated[canonicalKey], record);
  }

  return migrated;
}

export function loadPersonalRatings(items: readonly RankItem[] = []): PersonalRatingMap {
  try {
    const currentRaw = localStorage.getItem(PERSONAL_RATINGS_KEY_V2);

    if (currentRaw) {
      return parsePersonalRatingMap(currentRaw);
    }

    const legacyRaw = localStorage.getItem(PERSONAL_RATINGS_KEY_V1);

    if (!legacyRaw) {
      return {};
    }

    const migrated = migratePersonalRatings(parsePersonalRatingMap(legacyRaw), items);
    savePersonalRatings(migrated);

    return migrated;
  } catch {
    return {};
  }
}

export function savePersonalRatings(ratings: PersonalRatingMap) {
  localStorage.setItem(PERSONAL_RATINGS_KEY_V2, JSON.stringify(ratings));
  localStorage.removeItem(PERSONAL_RATINGS_KEY_V1);
}

export function getPersonalRating(ratings: PersonalRatingMap, item: RankItem) {
  const canonicalKey = getItemStorageKey(item);
  const canonicalRating = ratings[canonicalKey];

  if (canonicalRating) {
    return canonicalRating.value;
  }

  for (const legacyKey of getLegacyItemKeys(item)) {
    const legacyRating = ratings[legacyKey];

    if (legacyRating) {
      return legacyRating.value;
    }
  }

  return null;
}

export function updatePersonalRatingMap(
  ratings: PersonalRatingMap,
  item: RankItem,
  value: number | null,
): PersonalRatingMap {
  const key = getItemStorageKey(item);
  const next = { ...ratings };

  for (const legacyKey of getLegacyItemKeys(item)) {
    if (legacyKey !== key) {
      delete next[legacyKey];
    }
  }

  if (value === null) {
    delete next[key];
  } else {
    next[key] = {
      value,
      updatedAt: new Date().toISOString(),
    };
  }

  return next;
}
