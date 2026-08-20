import type { RankCollection } from '../models';

type CollectionPickerProps = {
  collections: RankCollection[];
  onSelect: (collection: RankCollection) => void;
};

function CollectionPicker({ collections, onSelect }: CollectionPickerProps) {
  return (
    <>
      <header className="header">
        <h1>RankerUltimate</h1>
        <p>Choose something to rank.</p>
      </header>

      <section className="collection-picker">
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
