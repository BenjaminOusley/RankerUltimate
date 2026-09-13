import type { AppScreen } from '@/app/appTypes';
import { Logo } from '@/shared/components/Logo/Logo';
import { useAppNavigation } from './AppNavigationContext';
import styles from './AppSidebar.module.css';

type NavigationIcon = 'home' | 'rank' | 'collections' | 'generate';

type NavigationItem = {
  label: string;
  icon: NavigationIcon;
  target: 'home' | 'collections' | 'manageCollections' | 'generateCollection';
  screens: readonly AppScreen[];
};

type AppSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

const navigationItems: readonly NavigationItem[] = [
  {
    label: 'Home',
    icon: 'home',
    target: 'home',
    screens: ['home'],
  },
  {
    label: 'Rank',
    icon: 'rank',
    target: 'collections',
    screens: [
      'collections',
      'review',
      'ranking',
      'rankingComplete',
      'refinement',
      'refinementComplete',
      'ratings',
      'results',
    ],
  },
  {
    label: 'Collections',
    icon: 'collections',
    target: 'manageCollections',
    screens: ['manageCollections'],
  },
  {
    label: 'Generate',
    icon: 'generate',
    target: 'generateCollection',
    screens: ['generateCollection'],
  },
];

function NavIcon({ icon }: { icon: NavigationIcon }) {
  if (icon === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.5 12 3.75l8.5 6.75v9.25a.75.75 0 0 1-.75.75h-5.1v-6.15h-5.3v6.15h-5.1a.75.75 0 0 1-.75-.75Z" />
      </svg>
    );
  }

  if (icon === 'rank') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 4.25h8v2.3h3.25v2.2c0 3.05-1.83 5.13-4.58 5.63A5.2 5.2 0 0 1 13 15.45v2.3h3.5v2H7.5v-2H11v-2.3a5.2 5.2 0 0 1-1.67-1.07c-2.75-.5-4.58-2.58-4.58-5.63v-2.2H8Zm0 4.3H6.75v.2c0 1.63.62 2.76 1.78 3.34A7.3 7.3 0 0 1 8 9.25Zm8 0v.7c0 1-.18 1.95-.53 2.84 1.16-.58 1.78-1.71 1.78-3.34v-.2Z" />
      </svg>
    );
  }

  if (icon === 'collections') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.75" y="3.75" width="6.5" height="6.5" rx="1" />
        <rect x="13.75" y="3.75" width="6.5" height="6.5" rx="1" />
        <rect x="3.75" y="13.75" width="6.5" height="6.5" rx="1" />
        <rect x="13.75" y="13.75" width="6.5" height="6.5" rx="1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2 1.55 5.45L19 9l-5.45 1.55L12 16l-1.55-5.45L5 9l5.45-1.55Zm6 12 .85 3.15L22 18l-3.15.85L18 22l-.85-3.15L14 18l3.15-.85ZM5 13l.7 2.3L8 16l-2.3.7L5 19l-.7-2.3L2 16l2.3-.7Z" />
    </svg>
  );
}

export function AppSidebar({ collapsed, onToggleCollapsed }: AppSidebarProps) {
  const navigation = useAppNavigation();

  if (!navigation) {
    return null;
  }

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.logoWrap}>
        <Logo />
        <span className={styles.compactLogo} aria-hidden="true">RU</span>
      </div>

      <nav className={styles.nav} aria-label="Primary navigation">
        {navigationItems.map((item) => {
          const active = item.screens.includes(navigation.screen);

          return (
            <button
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              key={item.target}
              type="button"
              onClick={() => navigation.navigate(item.target)}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              data-tooltip={item.label}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.icon} aria-hidden="true">
                <NavIcon icon={item.icon} />
              </span>
              <span className={styles.label}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.tagline}>
          <strong>Build. Rank. Discover.</strong>
          <span>Turn opinions into ranked insights.</span>
        </div>

        <button
          className={styles.collapseButton}
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-tooltip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : undefined}
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          <span className={styles.collapseLabel}>
            {collapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      </div>
    </aside>
  );
}
