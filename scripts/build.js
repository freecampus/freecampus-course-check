import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: ['src/entry.js'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  outfile: 'dist/index.cjs',
  legalComments: 'eof',
});
mkdirSync('dist', { recursive: true });
copyFileSync('node_modules/yaml/LICENSE', 'dist/yaml-LICENSE');
