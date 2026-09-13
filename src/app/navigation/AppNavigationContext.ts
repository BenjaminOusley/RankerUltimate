import { createContext, useContext } from 'react';

import type { AppScreen } from '@/app/appTypes';

export type NavigationTarget =
  | 'home'
  | 'collections'
  | 'manageCollections'
  | 'generateCollection';

export type AppNavigationValue = {
  screen: AppScreen;
  navigate: (target: NavigationTarget) => void;
};

export const AppNavigationContext = createContext<AppNavigationValue | null>(null);

export function useAppNavigation() {
  return useContext(AppNavigationContext);
}
