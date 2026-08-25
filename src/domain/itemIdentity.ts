import type { RankItem } from './models';

export function getCanonicalItemKey(item: RankItem) {
  if (item.source) {
    return `${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`;
  }

  return `local:${item.id}`;
}

export function getLegacyItemKeys(item: RankItem) {
  const aliases = new Set<string>([item.id, getCanonicalItemKey(item)]);

  if (item.source) {
    aliases.add(`${String(item.source)}:${item.id}`);
    aliases.add(`${item.source.provider}:${item.id}`);
    aliases.add(`${item.source.provider}:${item.source.type ?? 'item'}:${item.source.id}`);
  }

  return aliases;
}
