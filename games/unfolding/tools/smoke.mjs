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
    ok(`${vp.name}: a new world opens with its story`, await page.isVisible('.modal.story'));
    await shot(page, `${vp.name}-1b-story`);
    if (vp.isMobile) await page.click('.modal.story [data-cmd="dismiss"]');
    else await page.keyboard.press('Enter');
    ok(`${vp.name}: the story card closes`, !(await page.isVisible('.modal.story')));
    // The main walk-through strikes; each other means gets its own section below.
    await page.evaluate(() => { const a = window.unfolding; a.game.world.genome.axioms.harm = 'strike'; a.applyOptions(); a.refresh(); });
    ok(`${vp.name}: play screen with canvas`, await page.isVisible('.board canvas'));
    ok(`${vp.name}: tier 0 shows no pack`, !(await page.isVisible('[data-rule="things"]')));
    const tier0 = await page.evaluate(() => {
      const g = window.unfolding.game;
      return { monsters: g.run.monsters.length, solo: !!g.run.floor.solo, shrine: !!g.run.floor.shrine };
    });
    ok(`${vp.name}: tier 0 is one quiet room with a shrine`, tier0.monsters === 0 && tier0.solo && tier0.shrine);
    ok(`${vp.name}: tier 0 shows no HP`, !(await page.isVisible('.tb-hp')));
    await shot(page, `${vp.name}-2-tier0`);

    // Walk to the shrine and adopt whatever it offers first.
    await page.evaluate(() => {
      const a = window.unfolding;
      a.startTravel(a.game.run.floor.shrine.pos);
    });
    for (let i = 0; i < 60 && !(await page.isVisible('.modal.shrine')); i++) await page.waitForTimeout(50);
    const offers = await page.locator('.modal.shrine .rule-card').count();
    ok(`${vp.name}: the first shrine offers a choice (${offers})`, offers >= 2);
    await shot(page, `${vp.name}-2a-first-shrine`);
    await page.click('.modal.shrine .rule-card >> nth=0 >> button.primary');
    ok(`${vp.name}: first rule announced`, await page.isVisible('.modal.banner'));
    // Peril also says how harm works here: one banner after another.
    while (await page.isVisible('.modal.banner')) await page.click('[data-cmd="dismiss"]');

    // Bring in Peril and Halls (whichever is missing) the way a shrine would, mid-floor.
    const opened = await page.evaluate(() => {
      const a = window.unfolding;
      const g = a.game;
      for (const r of ['peril', 'halls']) if (!g.world.rules.includes(r)) g.adopt(r, 'shrine');
      g.events.splice(0);
      // Keep the test's character alive through its random walking: rats stay put.
      for (const m of g.run.monsters) m.stun = 9999;
      a.refresh();
      return { solo: !!g.run.floor.solo, monsters: g.run.monsters.length };
    });
    ok(`${vp.name}: Halls opened the floor and Peril brought foes`, !opened.solo && opened.monsters > 0);
    ok(`${vp.name}: HP appears with Peril`, await page.isVisible('.tb-hp'));
    await shot(page, `${vp.name}-2b-opened`);

    // Phones: tapping the map walks, so the direction pad is off by default and
    // everything fits on one screen with no page scroll.
    if (vp.isMobile) {
      ok('phone: no direction pad by default', !(await page.isVisible('.dpad')));
      ok('phone: the action bar shows Pack, Wait and Look', (await page.isVisible('.pad-sheet')) && (await page.isVisible('.pad-wait')) && (await page.isVisible('.pad-look')));
      const fits = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
      ok('phone: the play screen fits without scrolling', fits);
      const cell = await page.evaluate(() => window.unfolding.renderer.view.cell);
      ok(`phone: the map is zoomed in (${cell}px tiles)`, cell >= 30);
    }
    // Walk around with keys for a while.
    for (let i = 0; i < 40; i++) {
      const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
      await page.keyboard.press(dirs[Math.floor(i / 6) % 4]);
    }
    const turn = await page.evaluate(() => window.unfolding.game?.run.turn ?? -1);
    ok(`${vp.name}: turns pass when moving (${turn})`, turn > 5);

    // Drag the map to look around (phones: real touch events through CDP).
    if (vp.isMobile) {
      // Panning needs a floor wider than the screen; descend until there is one.
      const wide = await page.evaluate(() => {
        const a = window.unfolding;
        for (let i = 0; i < 12; i++) {
          const f = a.game.run.floor;
          let x0 = f.w, x1 = 0;
          f.tiles.forEach((t, k) => { if (t !== 0) { x0 = Math.min(x0, k % f.w); x1 = Math.max(x1, k % f.w); } });
          a.refresh();
          if ((x1 - x0 + 3) * a.renderer.view.cell > a.renderer.view.w) return true;
          const p = a.game.run.player;
          p.x = f.stairs.x;
          p.y = f.stairs.y;
          a.game.act({ type: 'descend' });
          a.game.events.splice(0);
          a.overlays = [];
          for (const m of a.game.run.monsters) m.stun = 9999;
        }
        a.refresh();
        return false;
      });
      ok('phone: found a floor wider than the screen', wide);
      // Earlier clicks may have scrolled the page; touches are in viewport coordinates.
      await page.evaluate(() => window.scrollTo(0, 0));
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
      await shot(page, 'phone-2c-panned');
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
      // Earlier clicks may have scrolled the page; touches are in viewport coordinates.
      await page.evaluate(() => window.scrollTo(0, 0));
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

      // 1. Tap a tile four steps away: the player walks there.
      const short = await route(4);
      const goal = short.at(-1);
      const at = await screenOf(goal);
      const s0 = await state();
      await touch('touchStart', box.x + at.x, box.y + at.y);
      await touch('touchEnd');
      await settle();
      const s1 = await state();
      ok(`phone: a tap walks to the spot (${s1.x},${s1.y} → goal ${goal.x},${goal.y})`, s1.x === goal.x && s1.y === goal.y);
      ok(`phone: the walk took one turn per step (${s1.turn - s0.turn})`, s1.turn - s0.turn === short.length);

      // 1b. Press and hold describes a tile and doesn't move you.
      const peekAt = await screenOf(short[0]);
      await touch('touchStart', box.x + peekAt.x, box.y + peekAt.y);
      await page.waitForTimeout(520);
      await touch('touchEnd');
      await page.waitForTimeout(80);
      const s1b = await state();
      ok('phone: press-and-hold shows a description card', await page.isVisible('.lookslot .lookcard'));
      ok('phone: press-and-hold does not move you', s1b.turn === s1.turn && s1b.x === s1.x && s1b.y === s1.y);
      await shot(page, 'phone-2c2-peek');

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
      const ratName = await page.evaluate(() => window.unfolding.game.lex.foe('rat').name);
      ok(`phone: a foe coming into range stops the walk ("${s2.log}")`, s2.log.toLowerCase().includes(ratName.toLowerCase()) && !(s2.x === long[13].x && s2.y === long[13].y));
      await shot(page, 'phone-2d-travel-stopped');

      // 3. A tap mid-walk stops it without taking another step.
      await page.evaluate(() => { const a = window.unfolding; a.game.run.monsters = []; a.refresh(); });
      const far = await route(12);
      await page.evaluate((t) => window.unfolding.startTravel(t), far.at(-1));
      await page.waitForTimeout(160);
      await touch('touchStart', box.x + box.width / 2, box.y + box.height / 2);
      await touch('touchEnd');
      const s3 = await state();
      await page.waitForTimeout(250);
      const s4 = await state();
      ok('phone: a tap stops the walk', !s4.travelling && s4.turn === s3.turn && !(s4.x === far.at(-1).x && s4.y === far.at(-1).y));
    }

    // ---- Options, pickup, Look mode, the shrine warning --------------------
    await page.evaluate(() => window.scrollTo(0, 0));
    if (vp.isMobile) await page.click('.topbar [data-cmd="options"]');
    else await page.keyboard.press('o');
    ok(`${vp.name}: options menu opens`, await page.isVisible('.modal.options'));
    await shot(page, `${vp.name}-2e-options`);
    await page.click('label[for="opt-autoPickup-none"]');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('unfolding.options.v1') || '{}').autoPickup);
    ok(`${vp.name}: auto pickup Off is saved (${stored})`, stored === 'none');
    // Plain labels: the world's words give way to mechanical ones, and come back.
    const hpWord = () => page.evaluate(() => document.querySelector('.side .bar.hp .bar-label span')?.textContent ?? '');
    const themedHp = await hpWord();
    await page.click('label[for="opt-plainLabels-true"]');
    const plain = await page.evaluate(() => window.unfolding.game.lex.plain);
    const plainHp = await hpWord();
    await page.click('label[for="opt-plainLabels-false"]');
    ok(`${vp.name}: Plain labels swaps the words ("${themedHp}" → "${plainHp}" → "${await hpWord()}")`, plain && plainHp === 'HP' && (await hpWord()) === themedHp);
    // Testing mode: a badge in the top bar, and the game knows; then off again.
    await page.click('label[for="opt-testing-true"]');
    const testingOn = await page.evaluate(() => window.unfolding.game.testing && !!document.querySelector('.tb-testing'));
    await shot(page, `${vp.name}-2f-testing`);
    await page.click('label[for="opt-testing-false"]');
    const testingOff = await page.evaluate(() => !window.unfolding.game.testing && !document.querySelector('.tb-testing'));
    ok(`${vp.name}: Testing mode switches on and off`, testingOn && testingOff);
    await page.click('.modal.options [data-cmd="dismiss"]');

    // With auto pickup off, walking onto a potion leaves it; the Here panel picks it up.
    await page.evaluate(() => {
      const a = window.unfolding, g = a.game, p = g.run.player, f = g.run.floor;
      g.run.monsters = [];
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const x = p.x + dx, y = p.y + dy;
        if (f.tiles[y * f.w + x] === 0 || (f.shrine && f.shrine.pos.x === x && f.shrine.pos.y === y) || (f.stairs.x === x && f.stairs.y === y)) continue;
        g.run.items = g.run.items.filter((fi) => !(fi.x === x && fi.y === y));
        g.run.items.push({ item: { id: 8800, kind: 'potion', name: 'Healing Potion', heal: 8, weight: 0, element: null, dur: 0, maxDur: 0 }, x, y });
        a.act({ type: 'move', dx, dy });
        return;
      }
    });
    const left = await page.evaluate(() => window.unfolding.game.itemsHere().map((fi) => fi.item.id));
    ok(`${vp.name}: with auto pickup off, the potion stays put`, left.includes(8800));
    if (vp.isMobile) {
      ok('phone: the bar offers Pick up when something is underfoot', await page.isVisible('.pad-pickup'));
      await page.click('.pad-sheet');
      await page.waitForTimeout(300);
      ok('phone: Pack opens the sheet', await page.isVisible('.side .sheet-head'));
    }
    ok(`${vp.name}: the Here panel offers it`, await page.isVisible('[data-cmd="pickup"][data-id="8800"]'));
    await shot(page, `${vp.name}-2f-here`);
    await page.click('[data-cmd="pickup"][data-id="8800"]');
    const packed = await page.evaluate(() => window.unfolding.game.run.player.inventory.some((i) => i.id === 8800));
    ok(`${vp.name}: Pick up puts it in the pack`, packed);
    if (vp.isMobile) {
      await page.click('.sheet-head [data-cmd="sheet"]');
      await page.waitForTimeout(300);
      ok('phone: Close hides the sheet', !(await page.isVisible('.side .sheet-head')));
    }

    // Look mode.
    await page.evaluate(() => window.scrollTo(0, 0));
    if (vp.isMobile) await page.click('.pad-look');
    else await page.keyboard.press(';');
    ok(`${vp.name}: Look mode shows a card for your own tile`, /^You \(/.test((await page.textContent('.lookcard .lc-title')) ?? ''));
    const lookFrom = await page.evaluate(() => ({ ...window.unfolding.look }));
    if (vp.isMobile) {
      // Tap a tile a few steps away, then Walk here.
      // Pressing the pad's Look button may have scrolled the page down to it: bring the board back.
      await page.evaluate(() => document.querySelector('.board').scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(100);
      // A tile a few steps away whose spot on screen is the map itself, not the look card over it.
      const goal = await page.evaluate(() => {
        const a = window.unfolding, g = a.game, p = g.run.player, f = g.run.floor, v = a.renderer.view;
        const canvas = document.querySelector('.board canvas');
        const r0 = canvas.getBoundingClientRect();
        for (let r = 3; r >= 1; r--) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
          const x = p.x + dx * r, y = p.y + dy * r;
          let open = true;
          for (let k = 1; k <= r; k++) if (f.tiles[(p.y + dy * k) * f.w + p.x + dx * k] === 0) open = false;
          if (!open) continue;
          const sx = r0.left + x * v.cell - v.camX + v.cell / 2, sy = r0.top + y * v.cell - v.camY + v.cell / 2;
          if (document.elementFromPoint(sx, sy) === canvas) return { x, y };
        }
      });
      // Let the camera and layout settle (the Look card can reflow the board) before aiming.
      const camKey = () => page.evaluate(() => { const v = window.unfolding.renderer.view, r = document.querySelector('.board canvas').getBoundingClientRect(); return `${v.camX},${v.camY},${v.cell},${r.x},${r.y}`; });
      for (let i = 0, prev = ''; i < 40; i++) { const k = await camKey(); if (k === prev) break; prev = k; await page.waitForTimeout(60); }
      const box = await page.locator('.board canvas').boundingBox();
      const at = await page.evaluate((t) => { const v = window.unfolding.renderer.view; return { x: t.x * v.cell - v.camX + v.cell / 2, y: t.y * v.cell - v.camY + v.cell / 2 }; }, goal);
      await page.mouse.click(box.x + at.x, box.y + at.y);
      const look = await page.evaluate(() => window.unfolding.look);
      ok(`${vp.name}: tapping in Look mode moves the cursor, not you (goal ${goal.x},${goal.y}, look ${look?.x},${look?.y})`, look && look.x === goal.x && look.y === goal.y);
      await shot(page, `${vp.name}-2g-look`);
      await page.click('.lookcard [data-cmd="look-walk"]');
      for (let i = 0; i < 60 && (await page.evaluate(() => !!window.unfolding.travel)); i++) await page.waitForTimeout(50);
      const p = await page.evaluate(() => ({ x: window.unfolding.game.run.player.x, y: window.unfolding.game.run.player.y }));
      ok(`${vp.name}: Walk here goes there`, p.x === goal.x && p.y === goal.y);
      ok(`${vp.name}: and leaves Look mode`, !(await page.isVisible('.lookcard')));
    } else {
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      const look = await page.evaluate(() => window.unfolding.look);
      ok(`${vp.name}: arrow keys move the Look cursor, not you`, look.y === Math.max(0, lookFrom.y - 2) && (await page.evaluate(() => window.unfolding.game.run.player.y)) === lookFrom.y);
      await shot(page, `${vp.name}-2g-look`);
      await page.keyboard.press('Escape');
      ok(`${vp.name}: Escape leaves Look mode`, !(await page.isVisible('.lookcard')));
      // Hover describes the tile under the mouse.
      const box = await page.locator('.board canvas').boundingBox();
      const at = await page.evaluate(() => { const a = window.unfolding, v = a.renderer.view, p = a.game.run.player; return { x: p.x * v.cell - v.camX + v.cell / 2, y: p.y * v.cell - v.camY + v.cell / 2 }; });
      await page.mouse.move(box.x + at.x, box.y + at.y);
      await page.waitForTimeout(50);
      ok(`${vp.name}: hovering describes the tile`, await page.isVisible('.lookcard.hover'));
      await page.mouse.move(box.x + 2, box.y + box.height + 40);
    }

    if (vp.isMobile) {
      const dim = await page.evaluate(() => {
        const g = window.unfolding.game, f = g.run.floor, p = g.run.player, b = document.querySelector('.pad-stairs');
        const on = (p.x === f.stairs.x && p.y === f.stairs.y) || f.tiles[p.y * f.w + p.x] === 3;
        return b.disabled === !on && b.classList.contains('here') === on;
      });
      ok(`${vp.name}: the stairs button is dim off the stairs and lit on them`, dim);
    }
    // Leaving an unanswered shrine behind asks first.
    await page.evaluate(() => {
      const a = window.unfolding, g = a.game, f = g.run.floor;
      if (f.shrine) { f.shrine.used = false; f.shrine.offers = ['things']; }
      g.run.player.x = f.stairs.x;
      g.run.player.y = f.stairs.y;
      a.refresh();
    });
    const depthBefore = await page.evaluate(() => window.unfolding.game.run.depth);
    if (vp.isMobile) ok(`${vp.name}: with the pad up, no extra stairs button covers the map`, !(await page.isVisible('.stairs-fab')));
    else ok(`${vp.name}: on stairs a Descend button floats over the map`, /Descend/.test((await page.textContent('.stairs-fab')) ?? '') && (await page.isVisible('.stairs-fab')));
    if (vp.isMobile) {
      const lit = await page.evaluate(() => { const b = document.querySelector('.pad-stairs'); return { on: !b.disabled && b.classList.contains('here'), text: b.textContent }; });
      ok(`${vp.name}: on stairs down the stairs button lights up as Descend`, lit.on && /Descend/.test(lit.text));
    }
    if (vp.isMobile) await page.click('.pad-stairs');
    else await page.keyboard.press('>');
    ok(`${vp.name}: descending past a live shrine asks first`, await page.isVisible('.modal.confirm'));
    await shot(page, `${vp.name}-2h-confirm`);
    await page.click('.modal.confirm [data-cmd="dismiss"]');
    ok(`${vp.name}: Stay keeps you here`, (await page.evaluate(() => window.unfolding.game.run.depth)) === depthBefore);
    // Phone: the pad's button. Desktop: the one floating over the map.
    await page.click(vp.isMobile ? '.pad-stairs' : '.stairs-fab');
    await page.click('[data-cmd="stairs-confirmed"]');
    ok(`${vp.name}: Descend anyway descends`, (await page.evaluate(() => window.unfolding.game.run.depth)) === depthBefore + 1);

    // Stairs up: you arrived on them. Climbing asks about this floor's shrine, then
    // returns you to the floor above at its stairs down; going down lands you back here.
    const onUp = await page.evaluate(() => {
      const a = window.unfolding, g = a.game, f = g.run.floor, p = g.run.player;
      if (f.shrine) { f.shrine.used = false; f.shrine.offers = ['things']; }
      a.refresh();
      return f.tiles[p.y * f.w + p.x] === 3;
    });
    ok(`${vp.name}: you arrive on stairs up`, onUp);
    if (vp.isMobile) {
      ok(`${vp.name}: the stairs button says Ascend`, /Ascend/.test((await page.textContent('.pad-stairs')) ?? ''));
      await page.click('.pad-stairs');
    } else await page.keyboard.press('<');
    ok(`${vp.name}: climbing past a live shrine asks first`, /Ascend anyway/.test((await page.textContent('.modal.confirm')) ?? ''));
    await page.click('[data-cmd="stairs-confirmed"]');
    const up = await page.evaluate(() => { const g = window.unfolding.game, f = g.run.floor, p = g.run.player; return { depth: g.run.depth, onDown: p.x === f.stairs.x && p.y === f.stairs.y }; });
    ok(`${vp.name}: climbing returns to the floor above, on its stairs down`, up.depth === depthBefore && up.onDown);
    await shot(page, `${vp.name}-2i-climbed`);
    if (vp.isMobile) await page.click('.pad-stairs');
    else await page.keyboard.press('>');
    const down = await page.evaluate(() => { const g = window.unfolding.game, f = g.run.floor, p = g.run.player; return { depth: g.run.depth, onUp: f.tiles[p.y * f.w + p.x] === 3, dark: !!f.shrine?.dark }; });
    ok(`${vp.name}: back down lands on the stairs up, and that floor's shrine went dark`, down.depth === depthBefore + 1 && down.onUp && down.dark);

    // Force the moment the game is built around: a Greatsword in hand, a shrine offering Weight.
    await page.evaluate(() => {
      const app = window.unfolding;
      const g = app.game;
      g.world.rules = ['peril', 'halls', 'things', 'arms', 'growth'];
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
    await page.click('.tb-leave');
    ok(`${vp.name}: title lists the world with a resumable run`, await page.isVisible('text=Resume'));
    ok(`${vp.name}: title offers one-tap Continue`, await page.isVisible('.continue-hero [data-cmd="resume"]'));
    await page.click('text=Resume');
    ok(`${vp.name}: resumed run keeps the rules`, (await page.evaluate(() => window.unfolding.game.world.rules.length)) === 6);

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
    ok(`${vp.name}: an heir opens with their story too`, await page.isVisible('.modal.story'));
    await page.click('.modal.story [data-cmd="dismiss"]');
    const rules = await page.evaluate(() => window.unfolding.game.world.rules);
    ok(`${vp.name}: repeal removed Weight (${rules})`, !rules.includes('weight') && rules.includes('arms'));
    const graves = await page.evaluate(() => window.unfolding.game.world.graves.length);
    ok(`${vp.name}: grave of the first heir exists (${graves})`, graves === 1);

    // ---- Means of Harm: aim, a schism shrine, a merchant --------------------
    await page.click('[data-cmd="leave"]');
    await page.click('text=Begin a new world');
    await page.click('.modal.story [data-cmd="dismiss"]');
    const aimed = await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      g.world.genome.axioms.harm = 'volley';
      a.applyOptions();
      // No Growth here: without it every shot lands, so the check is exact.
      for (const r of ['peril', 'halls', 'things']) if (!g.world.rules.includes(r)) g.adopt(r, 'shrine');
      g.events.splice(0);
      a.overlays = [];
      g.run.pending = null;
      // One rat, three tiles away along an open row or column.
      const { player: p, floor: f } = g.run;
      g.run.monsters = [];
      const open = (x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.tiles[y * f.w + x] !== 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if ([1, 2, 3].every((k) => open(p.x + dx * k, p.y + dy * k))) {
          g.run.monsters.push({ id: 9300, kind: 'rat', x: p.x + dx * 3, y: p.y + dy * 3, hp: 30, maxHp: 30, atk: 0, def: 0, xp: 1, aware: true, stun: 999, element: null });
          break;
        }
      }
      g.run.player.ammo = 5;
      g.refreshVision();
      a.refresh();
      return { foes: g.run.monsters.length, button: !document.querySelector(window.matchMedia('(max-width: 860px)').matches ? '.pad-fire' : '.fire-fab').hidden };
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `${vp.name}-7a0-fire-button`);
    ok(`${vp.name}: under Volley there is something to aim at, and a Fire button on the map`, aimed.foes === 1 && aimed.button);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (vp.isMobile) await page.click('.pad-fire');
    else await page.keyboard.press('f');
    const fired = await page.evaluate(() => { const g = window.unfolding.game; return { hp: g.run.monsters[0]?.hp, ammo: g.run.player.ammo, means: document.querySelector('.side .means')?.textContent ?? '' }; });
    ok(`${vp.name}: aiming harms the foe at range and spends a shot (${fired.hp}/30, ${fired.ammo} left)`, fired.hp < 30 && fired.ammo === 4);
    ok(`${vp.name}: the sidebar says how harm works here ("${fired.means.trim()}")`, /4/.test(fired.means));
    await shot(page, `${vp.name}-7a-volley`);
    // Finishing it off flashes the kill over the map.
    await page.evaluate(() => { window.unfolding.game.run.monsters[0].hp = 1; });
    if (vp.isMobile) await page.click('.pad-fire');
    else await page.keyboard.press('f');
    ok(`${vp.name}: a kill flashes over the map`, await page.isVisible('.toasts .toast'));
    await shot(page, `${vp.name}-7a2-kill`);

    await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      delete g.world.genome.axioms.harm;
      a.applyOptions();
      g.run.floor.schism = null;
      g.placeSchism();
      const sc = g.run.floor.schism;
      g.run.monsters = [];
      g.run.player.x = sc.pos.x;
      g.run.player.y = sc.pos.y;
      g.enterTile();
      a.refresh();
    });
    ok(`${vp.name}: a schism shrine asks how harm should work`, await page.isVisible('.modal.schism'));
    await shot(page, `${vp.name}-7b-schism`);
    await page.click('.modal.schism .schism-card >> nth=0 >> button.primary');
    const settled = await page.evaluate(() => window.unfolding.game.world.genome.axioms.harm);
    ok(`${vp.name}: choosing settles the world (${settled}) and announces it`, !!settled && (await page.isVisible('.modal.banner.axiom')));
    await page.click('[data-cmd="dismiss"]');

    await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      g.adopt('commerce', 'shrine');
      g.events.splice(0);
      a.overlays = [];
      const mc = g.run.floor.merchant;
      g.run.player.gold = 500;
      g.run.player.x = mc.pos.x;
      g.run.player.y = mc.pos.y;
      g.enterTile();
      a.refresh();
    });
    ok(`${vp.name}: a merchant opens shop`, await page.isVisible('.modal.shop'));
    const packBefore = await page.evaluate(() => window.unfolding.game.run.player.inventory.length);
    await page.click('.modal.shop [data-cmd="buy"] >> nth=0');
    const bought = await page.evaluate(() => ({ n: window.unfolding.game.run.player.inventory.length, gold: window.unfolding.game.run.player.gold }));
    ok(`${vp.name}: buying spends currency and fills the pack`, bought.n === packBefore + 1 && bought.gold < 500);
    await shot(page, `${vp.name}-7c-shop`);
    await page.click('.modal.shop [data-cmd="leave-shop"]');
    ok(`${vp.name}: leaving the shop closes it`, !(await page.isVisible('.modal.shop')));

    // ---- Phase 3: the Tide Clock shows, and the Heart ends an Age -----------
    await page.evaluate(() => {
      const a = window.unfolding;
      a.game.world.genome.axioms.time = 'tide';
      a.refresh();
    });
    ok(`${vp.name}: a tide world shows its clock`, (await page.$('.means.tide')) !== null);
    // A space schism shrine, then Drift rearranging the floor.
    await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      g.world.genome.axioms.time = 'turns';
      delete g.world.genome.axioms.space;
      for (const m of g.run.monsters) m.stun = 9999;
      g.run.floor.schism = null;
      g.placeSchism();
      const sc = g.run.floor.schism;
      g.events.splice(0);
      a.overlays = [];
      g.run.pending = null;
      g.run.player.x = sc.pos.x;
      g.run.player.y = sc.pos.y;
      g.enterTile();
      a.refresh();
    });
    ok(`${vp.name}: a schism shrine asks what shape the world should take`, await page.isVisible('.modal.schism >> text=What shape should'));
    await shot(page, `${vp.name}-7c2-space-schism`);
    await page.click('.modal.schism [data-harm="drift"]');
    const shifted = await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      const before = g.run.floor.tiles.join('');
      g.shiftFloor();
      a.overlays = [];
      a.refresh();
      return { space: g.world.genome.axioms.space, changed: g.run.floor.tiles.join('') !== before };
    });
    ok(`${vp.name}: choosing Drift settles space, and the floor can rearrange itself`, shifted.space === 'drift' && shifted.changed);
    ok(`${vp.name}: a drift world shows when the floor next shifts`, (await page.$('.means.tide')) !== null);
    await page.evaluate(() => { window.unfolding.game.world.genome.axioms.space = 'rooms'; });
    await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      g.world.genome.axioms.time = 'turns';
      g.world.heart = g.run.depth + 1;
      for (const m of g.run.monsters) m.stun = 9999;
      g.run.pending = null;
      a.overlays = [];
      g.run.player.x = g.run.floor.stairs.x;
      g.run.player.y = g.run.floor.stairs.y;
      a.act({ type: 'descend' });
      a.overlays = [];
      a.refresh();
    });
    const heartFloor = await page.evaluate(() => !!window.unfolding.game.run.floor.heart);
    ok(`${vp.name}: the Heart's floor is the deepest`, heartFloor);
    await shot(page, `${vp.name}-7d-heart-floor`);
    await page.evaluate(() => {
      const a = window.unfolding, g = a.game;
      for (const m of g.run.monsters) m.stun = 9999;
      g.run.pending = null;
      a.overlays = [];
      g.run.player.x = g.run.floor.stairs.x;
      g.run.player.y = g.run.floor.stairs.y;
      a.act({ type: 'descend' });
    });
    await page.waitForSelector('.victory-screen', { timeout: 3000 }).catch(() => {});
    ok(`${vp.name}: reaching the Heart shows the end of the Age`, await page.isVisible('.victory-screen'));
    await shot(page, `${vp.name}-7e-victory`);
    await page.click('.victory-screen [data-cmd="heir"]');
    if (await page.isVisible('.heir-screen')) await page.click('.heir-screen [data-cmd="begin"]');
    await page.evaluate(() => { const a = window.unfolding; a.overlays = []; a.refresh(); });
    ok(`${vp.name}: a new Age begins`, await page.evaluate(() => window.unfolding.game?.world.age === 2));

    // ---- Every premise speaks its own words -----------------------------
    // New worlds roll their premise; keep making them until each one has shown up.
    const seen = new Set();
    for (let i = 0; i < 80 && seen.size < 7; i++) {
      await page.click('[data-cmd="leave"]');
      await page.click('text=Begin a new world');
      const info = await page.evaluate(() => {
        const a = window.unfolding;
        const g = a.game;
        for (const r of ['peril', 'halls', 'things', 'growth', 'arms']) if (!g.world.rules.includes(r)) g.adopt(r, 'shrine');
        g.events.splice(0);
        g.run.pending = null;
        for (const m of g.run.monsters) m.stun = 9999;
        a.overlays = [];
        a.refresh();
        return { premise: g.world.genome.premise, floor: !!document.querySelector('.tb-floor'), text: document.body.innerText };
      });
      if (seen.has(info.premise)) continue;
      seen.add(info.premise);
      ok(`${vp.name}: ${info.premise} fills every placeholder`, !/\{\w+\}/.test(info.text));
      ok(`${vp.name}: ${info.premise} names its floors in the top bar`, vp.isMobile || info.floor === (info.premise !== 'old-stone'));
      await shot(page, `${vp.name}-8-premise-${info.premise}`);
    }
    ok(`${vp.name}: new worlds rolled several premises (${[...seen].join(', ')})`, seen.size >= 5);

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
