import type { RankItem } from '@/domain/models';
import { getPersonalRating, type PersonalRatingMap } from '@/features/ratings/personalRatings';

type Surprise = {
  item: RankItem;
  rating: number;
  preference: number;
  difference: number;
  rank: number;
};

/**
 * A completed ranking's surprises are based on what the user rated AT THE TIME.
 * Live Results (no history provided) compare against the current global ratings.
 * Missing historical values in legacy rankings are not inferred from today's values.
 */
export function getBiggestSurprises(
  items: readonly RankItem[],
  preferenceScores: Readonly<Record<string, number>>,
  personalRatings: PersonalRatingMap,
  ratingsAtCompletion?: Readonly<Record<string, number | null | undefined>>,
): Surprise[] {
  return items
    .flatMap((item, index) => {
      const rating = ratingsAtCompletion === undefined
        ? getPersonalRating(personalRatings, item)
        : ratingsAtCompletion[item.id];

      if (typeof rating !== 'number' || !Number.isFinite(rating)) {
        return [];
      }

      const preference = preferenceScores[item.id] ?? 0;
      return [{
        item,
        rating,
        preference,
        difference: Math.abs(rating - preference),
        rank: index + 1,
      }];
    })
    .sort((left, right) => right.difference - left.difference)
    .slice(0, 3);
}
