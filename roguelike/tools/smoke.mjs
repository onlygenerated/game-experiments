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

    // Drag the map to look around (phones: real touch events through CDP).
    if (vp.isMobile) {
      const box = await page.locator('.board canvas').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const cam = () => page.evaluate(() => [window.unfolding.renderer.view.camX, window.unfolding.game.run.turn]);
      const [camBefore, turnBefore] = await cam();
      // Drag toward whichever side has more map to reveal.
      const dir = camBefore > 200 ? 1 : -1;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await touch('touchStart', cx, cy);
      for (let i = 1; i <= 10; i++) await touch('touchMove', cx + dir * i * 18, cy);
      await touch('touchEnd');
      await page.waitForTimeout(100);
      const [camAfter, turnAfter] = await cam();
      ok(`phone: dragging pans the map (camX ${camBefore} → ${camAfter})`, camAfter !== camBefore);
      ok('phone: a drag is not a move', turnAfter === turnBefore);
      ok('phone: recenter button appears while panned', await page.isVisible('.recenter'));
      await shot(page, 'phone-2b-panned');
      await page.click('.recenter');
      const camBack = (await cam())[0];
      const btnGone = !(await page.isVisible('.recenter'));
      ok(`phone: recenter returns the camera (${camBack}, button hidden: ${btnGone})`, camBack === camBefore && btnGone);
      // Standing at the map's edge clamps the camera; that must not count as panned.
      const edgeHidden = await page.evaluate(() => {
        const a = window.unfolding;
        const f = a.game.run.floor;
        let best = null;
        for (let i = 0; i < f.tiles.length; i++) {
          if (f.tiles[i] === 0 || a.game.run.monsters.some((m) => m.y * f.w + m.x === i)) continue;
          if (!best || i % f.w < best % f.w) best = i;
        }
        a.game.run.player.x = best % f.w;
        a.game.run.player.y = Math.floor(best / f.w);
        a.refresh();
        return document.querySelector('.recenter').hidden;
      });
      ok('phone: no recenter button at rest beside a map edge', edgeHidden);
      // A short tap still steps toward the tapped spot.
      // Aim at an open neighbouring tile so the step can't be blocked by a wall.
      const spot = await page.evaluate(() => {
        const a = window.unfolding;
        const { player: p, floor: f, monsters } = a.game.run;
        const v = a.renderer.view;
        for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const x = p.x + dx, y = p.y + dy;
          if (f.tiles[y * f.w + x] === 0 || monsters.some((m) => m.x === x && m.y === y)) continue;
          return { x: x * v.cell - v.camX + v.cell / 2, y: y * v.cell - v.camY + v.cell / 2 };
        }
      });
      const turnsBeforeTap = (await cam())[1];
      await touch('touchStart', box.x + spot.x, box.y + spot.y);
      await touch('touchEnd');
      await page.waitForTimeout(100);
      ok('phone: a tap still moves', (await cam())[1] > turnsBeforeTap);
    }

    // Press and hold to auto-travel (phones, real touch events).
    if (vp.isMobile) {
      const box = await page.locator('.board canvas').boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      // A shortest route from the player, found in the page (8-way BFS over open tiles).
      const route = (minLen) =>
        page.evaluate((minLen) => {
          const a = window.unfolding;
          const { player: p, floor: f } = a.game.run;
          const prev = new Map([[p.y * f.w + p.x, -1]]);
          const q = [p.y * f.w + p.x];
          let end = -1;
          for (let qi = 0; qi < q.length; qi++) {
            const i = q[qi];
            let len = 0;
            for (let k = i; prev.get(k) !== -1; k = prev.get(k)) len++;
            if (len >= minLen) { end = i; break; }
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
              const x = (i % f.w) + dx, y = Math.floor(i / f.w) + dy, n = y * f.w + x;
              if (x < 0 || y < 0 || x >= f.w || y >= f.h || f.tiles[n] === 0 || prev.has(n)) continue;
              prev.set(n, i);
              q.push(n);
            }
          }
          const path = [];
          for (let k = end; k !== -1 && prev.get(k) !== -1; k = prev.get(k)) path.unshift({ x: k % f.w, y: Math.floor(k / f.w) });
          return path;
        }, minLen);
      const screenOf = (t) =>
        page.evaluate((t) => {
          const v = window.unfolding.renderer.view;
          return { x: t.x * v.cell - v.camX + v.cell / 2, y: t.y * v.cell - v.camY + v.cell / 2 };
        }, t);
      const state = () =>
        page.evaluate(() => {
          const a = window.unfolding;
          const p = a.game.run.player;
          return { x: p.x, y: p.y, turn: a.game.run.turn, travelling: !!a.travel, log: a.game.run.log.at(-1)?.text ?? '' };
        });
      const settle = async () => {
        for (let i = 0; i < 80 && (await state()).travelling; i++) await page.waitForTimeout(50);
      };
      await page.evaluate(() => { const a = window.unfolding; a.game.run.monsters = []; a.game.run.pending = null; a.refresh(); });

      // 1. Hold on a tile four steps away: the player walks there.
      const short = await route(4);
      const goal = short.at(-1);
      const at = await screenOf(goal);
      const s0 = await state();
      await touch('touchStart', box.x + at.x, box.y + at.y);
      await page.waitForTimeout(520);
      await touch('touchEnd');
      await settle();
      const s1 = await state();
      ok(`phone: press-and-hold walks to the spot (${s1.x},${s1.y} → goal ${goal.x},${goal.y})`, s1.x === goal.x && s1.y === goal.y);
      ok(`phone: the walk took one turn per step (${s1.turn - s0.turn})`, s1.turn - s0.turn === short.length);

      // 2. A foe coming within range stops the walk.
      const long = await route(14);
      await page.evaluate(([rat, target]) => {
        const a = window.unfolding;
        a.game.run.monsters = [{ id: 777, kind: 'rat', x: rat.x, y: rat.y, hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: false, stun: 999, element: null }];
        a.refresh();
        a.startTravel(target);
      }, [long[11], long[13]]);
      await settle();
      const s2 = await state();
      ok(`phone: a foe coming into range stops the walk ("${s2.log}")`, /You spot a rat/.test(s2.log) && !(s2.x === long[13].x && s2.y === long[13].y));
      await shot(page, 'phone-2c-travel-stopped');

      // 3. A tap mid-walk stops it without taking another step.
      await page.evaluate(() => { const a = window.unfolding; a.game.run.monsters = []; a.refresh(); });
      const far = await route(12);
      await page.evaluate((t) => window.unfolding.startTravel(t), far.at(-1));
      await page.waitForTimeout(160);
      await touch('touchStart', box.x + 20, box.y + 20);
      await touch('touchEnd');
      const s3 = await state();
      await page.waitForTimeout(250);
      const s4 = await state();
      ok('phone: a tap stops the walk', !s4.travelling && s4.turn === s3.turn && !(s4.x === far.at(-1).x && s4.y === far.at(-1).y));
    }

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
      if (!g.run.monsters.length) {
        g.run.monsters.push({ id: 9100, kind: 'rat', x: 0, y: 0, hp: 3, maxHp: 3, atk: 1, def: 0, xp: 2, aware: true, stun: 0, element: null });
      }
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
