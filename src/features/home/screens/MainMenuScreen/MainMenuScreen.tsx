import { useState } from 'react';

import { AppShell } from '@/app/AppShell';
import { Logo } from '@/shared/components/Logo/Logo';
import styles from './MainMenuScreen.module.css';

const menuQuotes = [
  'Your tier list called. It wants receipts.',
  'Objectivity is just confidence with better branding.',
  'Pick favorites. Start arguments. Repeat.',
  'Because “they’re all good” is cowardice.',
  'Turning opinions into unnecessarily precise numbers.',
];

type MainMenuScreenProps = {
  onNewRanking: () => void;
  onCollections: () => void;
};

export function MainMenuScreen({ onNewRanking, onCollections }: MainMenuScreenProps) {
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * menuQuotes.length));

  return (
    <AppShell>
      <section className={styles.card}>
        <div className={styles.topline}>
          <Logo />
          <span className={styles.ghostIcon}>⚙</span>
        </div>

        <div className={styles.copy}>
          <h1>Rank anything.</h1>
          <p>Discover what you actually prefer when you have to pick.</p>
        </div>

        <div className={styles.actions}>
          <button className={`${styles.menuButton} ${styles.primaryButton}`} onClick={onNewRanking}>
            <span>＋</span>
            <strong>New Ranking</strong>
          </button>
          <button className={styles.menuButton} disabled>
            <span>▤</span>
            <strong>My Rankings</strong>
            <small>Later</small>
          </button>
          <button className={styles.menuButton} onClick={onCollections}>
            <span>▣</span>
            <strong>Collections</strong>
          </button>
          <button className={styles.menuButton} disabled>
            <span>★</span>
            <strong>Global Ratings</strong>
            <small>Later</small>
          </button>
          <button className={styles.menuButton} disabled>
            <span>⚙</span>
            <strong>Settings</strong>
            <small>Later</small>
          </button>
        </div>

        <button
          className={styles.quote}
          onClick={() => setQuoteIndex((previous) => (previous + 1) % menuQuotes.length)}
          title="Yes, it changes if you poke it."
        >
          “{menuQuotes[quoteIndex]}”
        </button>
      </section>
    </AppShell>
  );
}
