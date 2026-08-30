/**
 * Bundle Kangaroo into one self-contained HTML file.
 *
 *   npm run artifact:kangaroo
 *
 * Everything is inlined — no external stylesheet, no external script, no font
 * or image fetched from anywhere — because the tool is meant to work with the
 * network off. The output is body-only (no doctype/html/head/body tags), which
 * is the shape the artifact host wraps.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const OUT_DIR = 'dist-kangaroo';
const OUT = `${OUT_DIR}/kangaroo.artifact.html`;

execFileSync('npx', ['vite', 'build', '--mode', 'kangaroo'], { stdio: 'inherit' });

const assets = readdirSync(`${OUT_DIR}/assets`);
const pick = (ext) => {
  const hits = assets.filter((f) => f.endsWith(ext));
  if (hits.length !== 1) throw new Error(`expected one ${ext}, found ${hits.length}: ${hits}`);
  return readFileSync(`${OUT_DIR}/assets/${hits[0]}`, 'utf8');
};

const css = pick('.css');
const js = pick('.js');

// A stray `</script>` inside the bundle would close the inline tag early.
const safe = js.replaceAll('</script', '<\\/script');

const html = `<title>Kangaroo Racks</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safe}
</script>
`;

writeFileSync(OUT, html);

// Only things the browser would actually go and fetch count. XML namespace
// URIs and React's error-docs link are strings, not requests, and matching on
// "https://" alone flags both.
for (const [label, pattern] of [
  ['external script', /<script[^>]+\ssrc=/i],
  ['external stylesheet', /<link[^>]+rel=["']?stylesheet/i],
  ['remote css asset', /url\(\s*["']?(?:https?:)?\/\//i],
  ['remote @import', /@import\s+(?:url\()?["']?(?:https?:)?\/\//i],
  ['runtime fetch', /\b(?:fetch|importScripts)\(\s*["'`](?:https?:)?\/\//i],
]) {
  if (pattern.test(html)) throw new Error(`${OUT} still references a ${label}`);
}

console.log(`${OUT} — ${(html.length / 1024).toFixed(0)} kB, nothing external`);
