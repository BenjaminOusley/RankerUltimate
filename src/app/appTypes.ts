export type AppScreen =
  | 'home'
  | 'collections'
  | 'manageCollections'
  | 'generateCollection'
  | 'review'
  | 'ranking'
  | 'rankingComplete'
  | 'refinement'
  | 'refinementComplete'
  | 'ratings'
  | 'results';

export type RatingBackScreen = 'rankingComplete' | 'refinementComplete';
