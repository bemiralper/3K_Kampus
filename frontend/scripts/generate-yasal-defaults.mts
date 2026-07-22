import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildYasalDefaultsPayload } from '../lib/yasal-content-registry.ts';

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../backend/apps/website/data/yasal_defaults.json',
);

const payload = buildYasalDefaultsPayload();
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
