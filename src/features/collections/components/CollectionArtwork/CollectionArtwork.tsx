import type { RankCollection } from '@/models';
import styles from './CollectionArtwork.module.css';

type CollectionArtworkProps = {
  collection: RankCollection;
};

export function CollectionArtwork({ collection }: CollectionArtworkProps) {
  const artworkItems = collection.items.filter((item) => item.image).slice(0, 3);

  if (artworkItems.length === 0) {
    return <div className={`${styles.artwork} ${styles.placeholder}`}>{collection.name.charAt(0)}</div>;
  }

  return (
    <div
      className={styles.artwork}
      aria-hidden="true"
    >
      {artworkItems.map((item) => (
        <img
          key={item.id}
          src={item.image}
          alt=""
        />
      ))}
    </div>
  );
}
