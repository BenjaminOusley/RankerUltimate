import { Button } from '@/shared/components/Button/Button';
import { Logo } from '@/shared/components/Logo/Logo';
import styles from './AppHeader.module.css';

type AppHeaderProps = {
  onMainMenu?: () => void;
};

export function AppHeader({ onMainMenu }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <Logo />

      {onMainMenu && (
        <Button
          variant="quiet"
          onClick={onMainMenu}
        >
          ⌂ Main Menu
        </Button>
      )}
    </header>
  );
}
