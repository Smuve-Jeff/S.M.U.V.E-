import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('Build/api', { recursive: true });
writeFileSync('Build/api/package.json', '{"type":"commonjs"}\n');
