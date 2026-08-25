export function formatPersonalRating(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
