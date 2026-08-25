export function formatPreferenceScore(value: number | undefined) {
  return (value ?? 0).toFixed(1);
}

export function getRankStyle(index: number, total: number) {
  if (index === 0) return 'gold';
  if (index === 1) return 'silver';
  if (index === 2) return 'bronze';
  if (index === total - 1) return 'last';
  if (index === total - 2) return 'secondLast';
  if (index === total - 3) return 'thirdLast';

  return null;
}

export function getRankAdornment(index: number) {
  if (index === 0) return '♛';
  if (index === 1) return '◆';
  if (index === 2) return '●';
  return '';
}

export function getDistribution(values: readonly number[]) {
  const buckets = [0, 0, 0, 0, 0];

  for (const value of values) {
    if (value < 2) buckets[0] += 1;
    else if (value < 4) buckets[1] += 1;
    else if (value < 6) buckets[2] += 1;
    else if (value < 8) buckets[3] += 1;
    else buckets[4] += 1;
  }

  const total = values.length;

  return buckets.map((count) => (total === 0 ? 0 : count / total));
}
