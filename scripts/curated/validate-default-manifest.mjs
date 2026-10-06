import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertValidDefaultManifest } from './default-manifest-validator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(__dirname, '../../src/data/curated/default-manifest.json');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
assertValidDefaultManifest(manifest);

console.log('Curated default manifest OK.');
for (const collection of manifest.collections) {
  console.log(`- ${collection.name}: ${collection.items.length}`);
}
