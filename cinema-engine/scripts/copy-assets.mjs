/**
 * Copies non-TypeScript assets that the runtime references by path into dist/.
 * tsc only emits JavaScript and declarations, so shaders need this step.
 */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const source = join(root, 'src', 'shaders');
const target = join(root, 'dist', 'shaders');

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

console.log('Copied WGSL shaders to dist/shaders');
