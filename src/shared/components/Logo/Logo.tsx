import styles from './Logo.module.css';

export function Logo() {
  return (
    <div
      className={styles.logo}
      aria-label="RankerUltimate"
    >
      <span>Ranker</span>
      <strong>Ultimate</strong>
    </div>
  );
}
