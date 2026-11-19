/**
 * Fold the Vite build into one self-contained HTML file (dist/unfolding.html),
 * for sharing as a single page. Run via `npm run single`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist/', import.meta.url);
let html = readFileSync(new URL('index.html', dir), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, p) =>
  `<style>${readFileSync(new URL(p, dir), 'utf8')}</style>`,
);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, p) =>
  `<script type="module">${readFileSync(new URL(p, dir), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`,
);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('an asset was not inlined');
writeFileSync(new URL('unfolding.html', dir), html);
console.log(`dist/unfolding.html — ${(html.length / 1024).toFixed(1)} KB`);
