import type { RankItem } from '@/domain/models';
import styles from './Poster.module.css';

type PosterProps = {
  item: RankItem;
  className?: string;
};

export function Poster({ item, className = '' }: PosterProps) {
  const classes = [styles.poster, 'poster', className].filter(Boolean).join(' ');

  if (item.image) {
    return (
      <img
        className={classes}
        src={item.image}
        alt=""
      />
    );
  }

  return (
    <div className={`${classes} ${styles.placeholder} poster-placeholder`}>
      {item.name.charAt(0)}
    </div>
  );
}
