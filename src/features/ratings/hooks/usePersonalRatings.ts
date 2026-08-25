import { useCallback, useState } from 'react';
import type { RankItem } from '@/domain/models';
import {
  loadPersonalRatings,
  savePersonalRatings,
  updatePersonalRatingMap,
} from '../personalRatings';

export function usePersonalRatings() {
  const [personalRatings, setPersonalRatings] = useState(loadPersonalRatings);

  const updatePersonalRating = useCallback((item: RankItem, value: number | null) => {
    setPersonalRatings((previous) => {
      const next = updatePersonalRatingMap(previous, item, value);
      savePersonalRatings(next);
      return next;
    });
  }, []);

  return {
    personalRatings,
    updatePersonalRating,
  };
}
