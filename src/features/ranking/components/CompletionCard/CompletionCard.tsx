import type { ReactNode } from 'react';

import styles from './CompletionCard.module.css';

type CompletionCardProps = {
  icon: string;
  warm?: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  children: ReactNode;
};

export function CompletionCard({
  icon,
  warm = false,
  title,
  subtitle,
  description,
  children,
}: CompletionCardProps) {
  return (
    <section className={styles.card}>
      <div className={`${styles.icon} ${warm ? styles.warmIcon : ''}`}>{icon}</div>
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
      {description && <p>{description}</p>}
      <div className={styles.actions}>{children}</div>
    </section>
  );
}
