/**
 * End-to-end smoke test: build is served, a real browser plays it.
 *   npm run smoke            (SMOKE_OUT=dir to keep screenshots)
 * Exits non-zero on any failed check or console error.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// The image ships Playwright globally with its matching Chromium; require() finds it from anywhere.
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = Number(process.env.SMOKE_PORT || 4179);
const ORIGIN = `http://localhost:${PORT}`;
const OUT = process.env.SMOKE_OUT || null;

async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return proc;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error(`vite preview never came up on ${PORT}`);
}

const server = await serve();
const browser = await chromium.launch();
let failures = 0;
const ok = (label, v) => {
  if (!v) failures++;
  console.log(`${v ? 'ok  ' : 'FAIL'}  ${label}`);
};
const shot = async (page, name) => OUT && page.screenshot({ path: `${OUT}/${name}.png` });

try {
  for (const vp of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  ]) {
    const page = await browser.newPage({ viewport: vp.viewport, hasTouch: vp.hasTouch, isMobile: vp.isMobile, deviceScaleFactor: 2 });
    const errs = [];
    page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errs.push(m.text()));
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    await page.goto(ORIGIN);
    await page.waitForTimeout(300);
    await shot(page, `${vp.name}-1-title`);
    ok(`${vp.name}: title renders`, await page.isVisible('text=Begin a new world'));

    await page.click('text=Begin a new world');
    await page.waitForTimeout(200);
    ok(`${vp.name}: play screen with canvas`, await page.isVisible('.board canvas'));
    ok(`${vp.name}: tier 0 shows no pack`, !(await page.isVisible('[data-rule="things"]')));
    await shot(page, `${vp.name}-2-tier0`);

    // Walk around with keys (or the pad on phones) for a while.
    for (let i = 0; i < 40; i++) {
      const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      if (vp.isMobile) await page.click(`.dpad button >> nth=${[5, 7, 3, 1][i % 4]}`);
      else await page.keyboard.press(dirs[Math.floor(i / 6) % 4]);
    }
    const turn = await page.evaluate(() => window.unfolding.game?.run.turn ?? -1);
    ok(`${vp.name}: turns pass when moving (${turn})`, turn > 5);

    // Force the moment the game is built around: a Greatsword in hand, a shrine offering Weight.
    await page.evaluate(() => {
      const app = window.unfolding;
      const g = app.game;
      g.world.rules = ['things', 'arms', 'growth'];
      g.run.player.weapon = { id: 9001, kind: 'weapon', name: 'Greatsword', atk: 8, weight: 6, element: 'ember', dur: 45, maxDur: 45 };
      g.run.player.inventory.push({ id: 9002, kind: 'potion', name: 'Healing Potion', heal: 8, weight: 0, element: null, dur: 0, maxDur: 0 });
      g.run.floor.shrine = { pos: { x: g.run.player.x, y: g.run.player.y }, offers: ['weight', 'durability', 'elements'], used: false };
      g.run.pending = { kind: 'shrine' };
      app.refresh();
    });
    await page.waitForTimeout(250);
    ok(`${vp.name}: shrine modal shows`, await page.isVisible('.modal.shrine'));
    const preview = await page.textContent('.modal.shrine');
    ok(`${vp.name}: shrine previews the Greatsword weight cost`, /Attack cost\s*1 turn → 2 turns/.test(preview) && /Greatsword weighs \d/.test(preview));
    await shot(page, `${vp.name}-3-shrine`);

    await page.click('[data-cmd="shrine"][data-rule="weight"]');
    await page.waitForTimeout(250);
    ok(`${vp.name}: adoption banner`, await page.isVisible('.modal.banner'));
    await shot(page, `${vp.name}-4-banner`);
    await page.click('[data-cmd="dismiss"]');
    await page.waitForTimeout(1500);
    const side = await page.textContent('.side');
    ok(`${vp.name}: sidebar shows weight warnings`, /Attack cost2 turns/.test(side.replace(/\s+/g, '')) || /too heavy/.test(side));
    await shot(page, `${vp.name}-5-weighted`);

    // Codex and persistence.
    if (!vp.isMobile) {
      await page.keyboard.press('c');
      ok(`${vp.name}: codex opens`, await page.isVisible('.modal.codex'));
      await page.keyboard.press('Escape');
    }
    await page.click('text=Save & quit');
    ok(`${vp.name}: title lists the world with a resumable run`, await page.isVisible('text=Resume'));
    await page.click('text=Resume');
    ok(`${vp.name}: resumed run keeps the rules`, (await page.evaluate(() => window.unfolding.game.world.rules.length)) === 4);

    // Die, then continue as an heir.
    await page.evaluate(() => {
      const g = window.unfolding.game;
      g.run.player.hp = 1;
      g.run.player.armor = null;
      for (const m of g.run.monsters) m.atk = 50;
      const m = g.run.monsters[0];
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = g.run.player.x + dx, y = g.run.player.y + dy;
        if (g.run.floor.tiles[y * g.run.floor.w + x] !== 0) { m.x = x; m.y = y; break; }
      }
      m.aware = true;
      m.stun = 0;
    });
    for (let i = 0; i < 40 && !(await page.isVisible('.death-screen')); i++) {
      if (vp.isMobile) await page.click('.pad-actions >> text=Wait').catch(() => {});
      else await page.keyboard.press('.');
      await page.waitForTimeout(80);
    }
    ok(`${vp.name}: death screen`, await page.isVisible('.death-screen'));
    await shot(page, `${vp.name}-6-death`);
    await page.click('text=Send the next heir');
    ok(`${vp.name}: heir briefing offers repeal`, await page.isVisible('#repeal-form'));
    const locked = await page.isDisabled('input[value="arms"]');
    const free = !(await page.isDisabled('input[value="weight"]'));
    ok(`${vp.name}: only leaves can be repealed`, locked && free);
    await shot(page, `${vp.name}-7-heir`);
    await page.check('input[value="weight"]');
    await page.click('[data-cmd="begin"]');
    const rules = await page.evaluate(() => window.unfolding.game.world.rules);
    ok(`${vp.name}: repeal removed Weight (${rules})`, !rules.includes('weight') && rules.includes('arms'));
    const graves = await page.evaluate(() => window.unfolding.game.world.graves.length);
    ok(`${vp.name}: grave of the first heir exists (${graves})`, graves === 1);

    ok(`${vp.name}: no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok(`${vp.name}: no console errors${errs.length ? ': ' + errs.join(' | ') : ''}`, errs.length === 0);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
