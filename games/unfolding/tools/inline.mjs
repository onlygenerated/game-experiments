/**
 * Fold a Vite build into one self-contained HTML file, for sharing as a single
 * page. Run via `npm run single` (the game: dist/unfolding.html) or
 * `npm run single:sim` (the branch simulator: dist-sim/sim-single.html).
 *
 *   node tools/inline.mjs [outDir] [page] [name]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [outDir = 'dist', page = 'index.html', name = 'unfolding'] = process.argv.slice(2);
const dir = new URL(`../${outDir}/`, import.meta.url);
let html = readFileSync(new URL(page, dir), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, p) =>
  `<style>${readFileSync(new URL(p, dir), 'utf8')}</style>`,
);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, p) =>
  `<script type="module">${readFileSync(new URL(p, dir), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`,
);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('an asset was not inlined');
writeFileSync(new URL(`${name}.html`, dir), html);
console.log(`${outDir}/${name}.html — ${(html.length / 1024).toFixed(1)} KB`);

// The claude.ai artifact host supplies its own doctype/head/body skeleton, so the
// artifact build is the same page with that skeleton stripped.
const pick = (re) => (html.match(re) ?? [''])[0];
const artifact = [
  pick(/<title>[\s\S]*?<\/title>/),
  pick(/<meta name="theme-color"[^>]*>/),
  ...(html.match(/<link [^>]*fonts[^>]*>/g) ?? []),
  pick(/<style>[\s\S]*?<\/style>/),
  '<div id="app"></div>',
  pick(/<script type="module">[\s\S]*?<\/script>/),
].join('\n');
const artifactName = name === 'unfolding' ? 'artifact' : `${name}-artifact`;
writeFileSync(new URL(`${artifactName}.html`, dir), artifact);
console.log(`${outDir}/${artifactName}.html — ${(artifact.length / 1024).toFixed(1)} KB`);
