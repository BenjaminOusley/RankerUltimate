import type { ReactNode } from 'react';

import {
  AppNavigationContext,
  type AppNavigationValue,
} from './AppNavigationContext';

type AppNavigationProviderProps = AppNavigationValue & {
  children: ReactNode;
};

export function AppNavigationProvider({
  screen,
  navigate,
  children,
}: AppNavigationProviderProps) {
  return (
    <AppNavigationContext.Provider value={{ screen, navigate }}>
      {children}
    </AppNavigationContext.Provider>
  );
}
