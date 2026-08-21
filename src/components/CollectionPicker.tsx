import type { RankCollection } from '../models';

type CollectionPickerProps = {
  collections: RankCollection[];
  onSelect: (collection: RankCollection) => void;
  onCreate: () => void;
};

function CollectionPicker({ collections, onSelect, onCreate }: CollectionPickerProps) {
  return (
    <>
      <header className="header">
        <h1>RankerUltimate</h1>

        <p>Choose something to rank.</p>
      </header>

      <section className="collection-picker">
        <button
          className="collection-card"
          type="button"
          onClick={onCreate}
        >
          <span className="collection-name">+ Create Collection</span>

          <span className="collection-count">TMDB generator</span>

          <span className="collection-description">
            Build a custom movie list using company, director, actor, genre, and filters.
          </span>
        </button>

        {collections.map((collection) => (
          <button
            className="collection-card"
            key={collection.id}
            type="button"
            onClick={() => onSelect(collection)}
          >
            <span className="collection-name">{collection.name}</span>

            <span className="collection-count">{collection.items.length} items</span>

            {collection.description && (
              <span className="collection-description">{collection.description}</span>
            )}
          </button>
        ))}
      </section>
    </>
  );
}

export default CollectionPicker;
