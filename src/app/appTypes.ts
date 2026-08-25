export type AppScreen =
  | 'home'
  | 'collections'
  | 'manageCollections'
  | 'review'
  | 'ranking'
  | 'rankingComplete'
  | 'refinement'
  | 'refinementComplete'
  | 'ratings'
  | 'results';

export type RatingBackScreen = 'rankingComplete' | 'refinementComplete';
