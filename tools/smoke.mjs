/**
 * End-to-end smoke test: does the game still work?
 *
 *   npm run smoke        (builds, serves, drives, tears down)
 *
 * `npm test` proves the scorers are right and `tsc` proves the types line up,
 * but neither notices when a component prop is renamed on one branch while the
 * thing that feeds it changes on another. Git merges that cleanly and the game
 * breaks. This drives the real build in a real browser instead: place, drag,
 * undo, discard, reseed, hex, lock-and-cash, and each of the three screens.
 *
 * Run it after merging the UI branch into main, and after any refactor that
 * moves state between modules. Exits non-zero if anything fails.
 */
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const PORT = Number(process.env.SMOKE_PORT || 4173);
const ORIGIN = `http://localhost:${PORT}`;

/**
 * Serve the build ourselves rather than relying on the caller to start one.
 *
 * An npm script cannot reliably clean up a backgrounded server — `kill %1`
 * needs job control, which npm's non-interactive shell does not have, so the
 * script hangs forever waiting on a server nobody stops. Worse, if a stale
 * server is already on the port, the new one fails to bind and the tests
 * silently pass against the *old* build. Owning the process removes both.
 */
async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(ORIGIN);
      if (r.ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error(`vite preview never came up on ${PORT} — is the port already in use?`);
}

const server = await serve();
const SP = process.env.SMOKE_OUT || '/tmp';
const b = await launch();
const errs = [];
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.goto(ORIGIN);
await p.waitForTimeout(700);

let failures = 0;
const ok = (label, v) => {
  if (!v) failures++;
  console.log(`${v ? 'ok  ' : 'FAIL'}  ${label}`);
};
const text = () => p.evaluate(() => document.body.innerText);
const score = async () => Number((await text()).match(/(\d+)\s*\/\s*\d+/)?.[1] ?? -1);
const pickRules = async (name) => {
  await p.locator('button:has-text("Rules"):visible').first().click();
  await p.waitForTimeout(300);
  const item = p.locator('button', { hasText: name }).last();
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await p.waitForTimeout(500);
};

// --- click to place ---------------------------------------------------------
await p.locator('[data-hand-index="0"]').click();
await p.waitForTimeout(150);
await p.locator('[data-cell="3,4"]').hover();
await p.waitForTimeout(250);
ok('hover opens the side preview', (await text()).includes('ROW'));
await p.locator('[data-cell="3,4"]').click();
await p.waitForTimeout(400);
ok('click places a card', (await p.locator('[data-cell="3,4"] .card-face').count()) > 0);
const afterPlace = await score();
ok('placement banked score', afterPlace > 0);
ok('score log recorded it', (await text()).includes('#1'));

// --- drag to place ----------------------------------------------------------
const card = await p.locator('[data-hand-index="0"]').boundingBox();
const cell = await p.locator('[data-cell="3,5"]').boundingBox();
await p.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
await p.mouse.down();
await p.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 10 });
await p.waitForTimeout(250);
ok('drag badge appears', (await p.locator('span:has-text("=")').count()) > 0);
await p.mouse.up();
await p.waitForTimeout(400);
ok('drag places a card', (await p.locator('[data-cell="3,5"] .card-face').count()) > 0);

// --- undo -------------------------------------------------------------------
await p.locator('button:has-text("Undo"):visible').first().click();
await p.waitForTimeout(400);
ok('undo removes the last placement', (await p.locator('[data-cell="3,5"] .card-face').count()) === 0);
ok('undo restores the score', (await score()) === afterPlace);

// --- discard ----------------------------------------------------------------
const deckBefore = Number((await text()).match(/DECK\s+(\d+)/)?.[1] ?? -1);
await p.locator('[data-hand-index="1"]').click();
await p.waitForTimeout(150);
await p.locator('button:has-text("Discard"):visible').first().click();
await p.waitForTimeout(800);
ok('discard drew replacements', Number((await text()).match(/DECK\s+(\d+)/)?.[1]) < deckBefore);

// --- new run / seed ---------------------------------------------------------
await p.locator('button:has-text("Random seed"):visible').first().click();
await p.waitForTimeout(600);
ok('new run resets the score', (await score()) === 0);

// --- ruleset switch, hex ----------------------------------------------------
await pickRules('Hex Sprawl');
ok('hex board renders', (await p.locator('[data-hex]').count()) > 0);
await p.locator('[data-hand-index="0"]').click();
await p.waitForTimeout(150);
// A known neighbour of the origin — an arbitrary hex is usually not legal.
const hex = await p.locator('[data-hex="1,0"]').boundingBox();
await p.mouse.move(hex.x + hex.width / 2, hex.y + hex.height / 2);
await p.waitForTimeout(300);
await p.mouse.click(hex.x + hex.width / 2, hex.y + hex.height / 2);
await p.waitForTimeout(400);
ok('hex placement works', (await score()) > 0);

// --- lock and cash ----------------------------------------------------------
await pickRules('Lock and cash');
await p.locator('[data-hand-index="0"]').click();
await p.waitForTimeout(150);
await p.locator('[data-cell="3,4"]').click();
await p.waitForTimeout(400);
ok('lock-and-cash banks nothing on placement', (await score()) === 0);
await p.locator('[data-cell="3,3"]').click();
await p.waitForTimeout(500);
ok('cashing a cross banks it', (await score()) > 0);

// --- the other screens ------------------------------------------------------
await p.locator('button:has-text("Scoring"):visible').first().click();
await p.waitForTimeout(400);
ok('scoring panel opens', (await text()).includes('How scoring works'));
await p.locator('button:has-text("Close"):visible').first().click();
await p.waitForTimeout(300);

await p.locator('button:has-text("Metrics"):visible').first().click();
await p.waitForTimeout(400);
ok('metrics page opens', (await text()).includes('Lookahead lift'));
// Item 3 retired the mult axis metric for reach pressure and clear rate —
// guard the rename so a silent partial revert doesn't ship the old column
// back next to stale "mult" language.
const metricsText = await text();
ok('reach pressure column shown', metricsText.includes('Reach pressure'));
ok('clear rate column shown', metricsText.includes('Clear rate'));
ok('no leftover mult-axis language', !metricsText.toLowerCase().includes('mult live'));
await p.locator('button:has-text("Back to the board")').click();
await p.waitForTimeout(400);

await p.locator('button:has-text("Setup"):visible').first().click();
await p.waitForTimeout(400);
ok('setup page opens', (await text()).includes('Game setup'));

// Two counters at once: picking the combo preset should carry both lenses
// through into the actual run, not just the setup form.
await p.locator('select').selectOption({ label: 'Cribbage + Poker' });
await p.waitForTimeout(200);
await p.locator('button:has-text("Start this game")').click();
await p.waitForTimeout(600);
ok('setup starts a run', (await p.locator('[data-cell],[data-hex]').count()) > 0);
ok('combo preset scores under both counters', (await text()).toLowerCase().includes('cribbage + poker'));

// --- rooms preview (item 4: shape substrate; item 5: exits and reach; item 6: threshold and clearing) ---
await p.locator('button:has-text("Rooms"):visible').first().click();
await p.waitForTimeout(400);
ok('rooms preview opens', (await text()).includes('Rooms (dev preview)'));
ok('round room renders', (await p.locator('[data-room="Round Room"] [data-room-cell]').count()) > 0);
ok('hourglass room renders', (await p.locator('[data-room="Hourglass"] [data-room-cell]').count()) > 0);
ok(
  'hourglass neck is border, not interior',
  (await p.locator('[data-room="Hourglass"] [data-room-cell="0,0"]').getAttribute('data-room-border')) ===
    'true',
);
ok(
  'round room exit is marked',
  (await p.locator('[data-room="Round Room"] [data-room-cell="2,0"]').getAttribute('data-room-exit')) ===
    'true',
);

// Clicking cells builds a stand-in structure; reach should track it live.
const roundRoom = p.locator('[data-room-panel="Round Room"]');
ok('round room starts not reached', (await roundRoom.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false');
await roundRoom.locator('[data-room-cell="0,2"]').click();
await p.waitForTimeout(150);
ok(
  'touching the border away from the exit does not reach',
  (await roundRoom.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false',
);
await roundRoom.locator('[data-room-cell="2,0"]').click();
await p.waitForTimeout(150);
ok(
  'clicking the exit cell reaches it',
  (await roundRoom.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'true',
);

// Item 6: reach alone is not clear — score must meet the threshold too, and
// the two conditions must read separately (a near-miss, not a flat "lost").
ok(
  'reached but under threshold does not clear',
  (await roundRoom.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false',
);
ok(
  'the score line reads as short, not met',
  (await roundRoom.locator('[data-room-score-met]').getAttribute('data-room-score-met')) === 'false',
);
await roundRoom.locator('input[type="number"]').fill('50');
await p.waitForTimeout(150);
ok(
  'reach + score at the threshold clears the room',
  (await roundRoom.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true',
);
await roundRoom.locator('[data-room-cell="2,0"]').click();
await p.waitForTimeout(150);
ok(
  'unclicking the exit cell loses reach again',
  (await roundRoom.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false',
);
ok(
  'losing reach loses clear even though score is still met',
  (await roundRoom.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false',
);

await p.locator('button:has-text("Back to the board")').click();
await p.waitForTimeout(300);

await p.screenshot({ path: `${SP}/smoke-final.png` });

// A 404 for the favicon is expected in the preview server and is not a fault.
const real = errs.filter((e) => !e.includes('404'));
if (real.length) {
  failures += real.length;
  console.log('console errors:', real);
}
console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
await b.close();
server.kill();
process.exit(failures ? 1 : 0);
