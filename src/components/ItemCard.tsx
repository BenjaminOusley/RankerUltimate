import { useState } from 'react';

import type { RankItem } from '../models';

type ItemCardProps = {
  item: RankItem;
  onClick: () => void;
};

function ItemCard({ item, onClick }: ItemCardProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const showImage = Boolean(item.image) && !imageFailed;

  return (
    <button
      className="item-card"
      onClick={onClick}
      type="button"
    >
      <div className="item-image-wrapper">
        {showImage ? (
          <img
            className="item-image"
            src={item.image}
            alt={item.name}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="poster-placeholder">{item.name.charAt(0)}</div>
        )}
      </div>

      <span className="item-name">{item.name}</span>

      {item.subtitle && <span className="item-subtitle">{item.subtitle}</span>}
    </button>
  );
}

export default ItemCard;
