import type { ComponentPropsWithoutRef } from 'react';
import styles from './AppShell.module.css';

type AppShellProps = ComponentPropsWithoutRef<'main'> & {
  centered?: boolean;
};

export function AppShell({ centered = false, className = '', ...props }: AppShellProps) {
  const classes = [styles.shell, centered ? styles.centered : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <main
      className={classes}
      {...props}
    />
  );
}
