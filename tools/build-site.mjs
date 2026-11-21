/**
 * Build every game and gather them into _site/, with site/index.html as the
 * landing page:
 *
 *   _site/index.html          the landing page
 *   _site/<game>/             that game's own build output
 *
 *   npm run site              build it
 *   npm run site:preview      serve it on http://localhost:4300
 *
 * A game takes part when its package.json has a `build` script; its output is
 * expected in games/<game>/dist. Games build with a relative base ('./'), so
 * they work from any subfolder. This is infrastructure only: it never reaches
 * into a game's code.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '_site');
const only = process.argv.slice(2);

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(join(root, 'site'), out, { recursive: true });

for (const game of readdirSync(join(root, 'games')).sort()) {
  if (only.length && !only.includes(game)) continue;
  const dir = join(root, 'games', game);
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.build) continue;
  console.log(`\n=== ${game}`);
  execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
  const dist = join(dir, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`${game}: no dist/index.html after build`);
  cpSync(dist, join(out, game), { recursive: true });
}

console.log(`\n_site/ ready`);
