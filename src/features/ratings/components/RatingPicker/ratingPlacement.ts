const GAP = 10;
const OPTION_HEIGHT = 34;
const MENU_HEIGHT = 22 * OPTION_HEIGHT + 10;

/** Place the full dropdown where it fits, otherwise use the taller side and scroll. */
export function calculateRatingMenuPosition(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  viewport: { width: number; height: number },
) {
  const below = Math.max(0, viewport.height - rect.bottom - GAP);
  const above = Math.max(0, rect.top - GAP);
  const showBelow = below >= MENU_HEIGHT || below >= above;
  const maxHeight = Math.max(OPTION_HEIGHT * 2, Math.min(MENU_HEIGHT, showBelow ? below : above));
  const width = Math.min(Math.max(108, rect.width), Math.max(72, viewport.width - GAP * 2));
  return {
    top: showBelow ? rect.bottom + 4 : Math.max(GAP, rect.top - maxHeight - 4),
    left: Math.min(Math.max(GAP, rect.left), Math.max(GAP, viewport.width - width - GAP)),
    width,
    maxHeight,
  };
}
