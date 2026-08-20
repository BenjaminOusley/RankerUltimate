import type { RankCollection } from '../models';

type CollectionReviewProps = {
  collection: RankCollection;
  selectedItemIds: Set<string>;
  onToggleItem: (itemId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onBack: () => void;
  onStart: () => void;
};

function CollectionReview({
  collection,
  selectedItemIds,
  onToggleItem,
  onSelectAll,
  onClearAll,
  onBack,
  onStart,
}: CollectionReviewProps) {
  return (
    <>
      <header className="header">
        <h1>{collection.name}</h1>

        <p>Choose which items you want to rank.</p>
      </header>

      <section className="review">
        <div className="review-toolbar">
          <strong>
            {selectedItemIds.size} of {collection.items.length} selected
          </strong>

          <div className="review-actions">
            <button
              type="button"
              onClick={onSelectAll}
            >
              Select All
            </button>

            <button
              type="button"
              onClick={onClearAll}
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="review-grid">
          {collection.items.map((item) => {
            const selected = selectedItemIds.has(item.id);

            return (
              <label
                className={`review-item ${selected ? 'review-item-selected' : ''}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleItem(item.id)}
                />

                <div className="review-image-wrapper">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      className="review-image"
                    />
                  ) : (
                    <div className="review-placeholder">{item.name.charAt(0)}</div>
                  )}
                </div>

                <div className="review-item-info">
                  <strong>{item.name}</strong>

                  {item.subtitle && <span>{item.subtitle}</span>}
                </div>
              </label>
            );
          })}
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={onBack}
          >
            Back
          </button>

          <button
            type="button"
            onClick={onStart}
            disabled={selectedItemIds.size < 2}
          >
            Rank {selectedItemIds.size} Items
          </button>
        </div>
      </section>
    </>
  );
}

export default CollectionReview;
