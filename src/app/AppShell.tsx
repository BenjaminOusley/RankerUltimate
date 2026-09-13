import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';

import { AppSidebar } from './navigation/AppSidebar';
import { useAppNavigation } from './navigation/AppNavigationContext';
import styles from './AppShell.module.css';

const SIDEBAR_COLLAPSED_KEY = 'rankerultimate:sidebar-collapsed';

type AppShellProps = ComponentPropsWithoutRef<'main'> & {
  centered?: boolean;
};

function loadSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

export function AppShell({ centered = false, className = '', children, ...props }: AppShellProps) {
  const navigation = useAppNavigation();
  const showSidebar = Boolean(navigation) && !centered;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(sidebarCollapsed));
    }
  }, [sidebarCollapsed]);

  const classes = [
    styles.shell,
    centered ? styles.centered : '',
    showSidebar ? styles.withSidebar : '',
    showSidebar && sidebarCollapsed ? styles.sidebarCollapsed : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!showSidebar) {
    return (
      <main className={classes} {...props}>
        {children}
      </main>
    );
  }

  return (
    <main className={classes} {...props}>
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <div className={styles.content}>{children}</div>
    </main>
  );
}
