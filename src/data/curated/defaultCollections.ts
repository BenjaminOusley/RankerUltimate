import type { RankCollection, RankItem } from '@/domain/models';
import manifestJson from './default-manifest.json';

type CuratedManifestCollection = {
  id: string;
  name: string;
  description: string;
  groupId: RankCollection['groupId'];
  rankingDomain: string;
  items: RankItem[];
};

type CuratedDefaultManifest = {
  schemaVersion: number;
  policyVersion: number;
  generatedAt: string;
  collections: CuratedManifestCollection[];
};

const manifest = manifestJson as CuratedDefaultManifest;

export const curatedDefaultManifestGeneratedAt = manifest.generatedAt;

export const curatedDefaultCollections: RankCollection[] = manifest.collections.map(
  (collection) => ({
    ...collection,
    items: collection.items.map((item) => ({ ...item })),
    candidateSource: {
      kind: 'embedded',
      provider: 'curated-default-manifest',
    },
    isBuiltIn: true,
    permissions: {
      edit: false,
      delete: false,
      move: false,
      refresh: false,
    },
  }),
);
