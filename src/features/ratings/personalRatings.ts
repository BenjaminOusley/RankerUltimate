import type { RankItem } from '@/domain/models';

export type PersonalRatingRecord = {
  value: number;
  updatedAt: string;
};

export type PersonalRatingMap = Record<string, PersonalRatingRecord>;

const PERSONAL_RATINGS_KEY = 'rankerultimate:personal-ratings:v1';

export function getItemStorageKey(item: RankItem) {
  const source = (item as RankItem & { source?: unknown }).source;

  return source ? `${String(source)}:${item.id}` : item.id;
}

export function loadPersonalRatings(): PersonalRatingMap {
  try {
    const raw = localStorage.getItem(PERSONAL_RATINGS_KEY);

    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as PersonalRatingMap;
  } catch {
    return {};
  }
}

export function savePersonalRatings(ratings: PersonalRatingMap) {
  localStorage.setItem(PERSONAL_RATINGS_KEY, JSON.stringify(ratings));
}

export function getPersonalRating(ratings: PersonalRatingMap, item: RankItem) {
  return ratings[getItemStorageKey(item)]?.value ?? null;
}

export function updatePersonalRatingMap(
  ratings: PersonalRatingMap,
  item: RankItem,
  value: number | null,
): PersonalRatingMap {
  const key = getItemStorageKey(item);
  const next = { ...ratings };

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
