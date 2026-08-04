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

// --- rooms: a real room-to-room run (item 7) --------------------------------
//
// The default seed ('rooms-1') and CONFIG are fixed, so this exact sequence —
// hand[0] onto (2,0), (1,0), (0,0) in the Round Room — is a deterministic
// path verified offline (a throwaway script against `expedition.ts`, run and
// discarded, not committed): move 1 lands on the exit (reach true, score 7),
// move 3 crosses the room's threshold of 50 (score 73), so the room reads
// cleared after exactly 3 placements with 9 of the 12-placement budget still
// unspent. That leftover budget is the point being tested next: leaving does
// not require using every placement, only clearing the room.
await p.locator('button:has-text("Rooms"):visible').first().click();
await p.waitForTimeout(400);
ok('rooms page opens', (await text()).includes('Room 1 / 2'));
ok('round room renders', (await p.locator('[data-room="Round Room"] [data-room-cell]').count()) > 0);
ok(
  'round room exit is marked',
  (await p.locator('[data-room="Round Room"] [data-room-cell="2,0"]').getAttribute('data-room-exit')) ===
    'true',
);

const roomPanel = () => p.locator('[data-room-panel="Round Room"]');
ok('room starts not reached', (await roomPanel().locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false');
ok('leave is disabled before clearing', await p.locator('[data-room-leave]').isDisabled());

// The room also carries a real 'blocked' tile at (1,-1) (item 11) — rubble
// that can never be placed on. Checked before any real placement happens, so
// the check doesn't depend on timing elsewhere in the sequence. `placeInRoom`
// is a no-op on a blocked cell, so selection is left as-is by the click —
// deselect explicitly afterward so the placeHand0 helper below still finds
// hand[0] unselected for its first real placement.
ok(
  'the blocked tile renders before anything is attempted on it',
  (await p.locator('[data-room-cell="1,-1"]').getAttribute('data-room-tile')) === 'blocked',
);
await p.locator('[data-hand-index="0"]').click();
await p.waitForTimeout(120);
await p.locator('[data-room-cell="1,-1"]').click();
await p.waitForTimeout(200);
ok('clicking a blocked cell places nothing', (await p.locator('[data-room-cell="1,-1"] .card-face').count()) === 0);
ok('the failed click spent no placement', (await text()).includes('placements left 12'));
await p.locator('[data-hand-index="0"]').click(); // deselect

async function placeHand0(cell) {
  await p.locator('[data-hand-index="0"]').click();
  await p.waitForTimeout(120);
  await p.locator(`[data-room-cell="${cell}"]`).click();
  await p.waitForTimeout(200);
}

await placeHand0('2,0'); // lands on the exit — reach, but score (7) is well short of the threshold (50)
ok('placing on the exit reaches it', (await roomPanel().locator('[data-room-reach]').getAttribute('data-room-reach')) === 'true');
ok('reached but under threshold does not clear', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
ok('a real card renders on the placed cell', (await p.locator('[data-room-cell="2,0"] .card-face').count()) > 0);

// The Round Room carries one placeholder 'marker' tile at (1,0) (item 8) —
// check it renders before anything is placed there, and that it is still in
// the DOM (not replaced or hidden) once a card lands on the same cell, which
// is the whole point of the tile layer existing underneath the card layer.
ok(
  'the marker tile renders before anything is placed on it',
  (await p.locator('[data-room-cell="1,0"]').getAttribute('data-room-tile')) === 'marker',
);

await placeHand0('1,0'); // still short (score 31)
ok('still short after the second placement', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
ok(
  'the tile is still there once a card is placed on the same cell',
  (await p.locator('[data-room-cell="1,0"]').getAttribute('data-room-tile')) === 'marker',
);
ok(
  'the card is also there, on top of the tile, not instead of it',
  (await p.locator('[data-room-cell="1,0"] .card-face').count()) === 1,
);

await placeHand0('0,0'); // crosses the threshold (score 73) — reach was already true
ok('reach + score at the threshold clears the room', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true');
ok('leave is enabled once cleared', !(await p.locator('[data-room-leave]').isDisabled()));

const clearedScore = Number((await text()).match(/Score (\d+) \/ 50/)?.[1] ?? -1);
ok('cleared room scored above its threshold', clearedScore > 50);

// The room also carries a real 'cardMultiplier' tile at (0,-1) (item 9) —
// the room is already cleared, but 9 of the 12-placement budget remain, so
// there's room to prove the tile before leaving. The exact scores below were
// worked out offline against `expedition.ts` directly (same throwaway-script
// convention as items 7-8, run and discarded, not committed): the same card
// at (0,-1) scores 50 with no tile there and 88 with the ×2 tile — a
// 38-point boost, not card luck.
ok(
  'the cardMultiplier tile renders before anything is placed on it',
  (await p.locator('[data-room-cell="0,-1"]').getAttribute('data-room-tile')) === 'cardMultiplier',
);
await placeHand0('0,-1');
ok('the tile boosted the placement to the expected score', (await text()).includes('scored 88'));
const afterCardTile = Number((await text()).match(/Score (\d+) \/ 50/)?.[1] ?? -1);
ok('score after the cardMultiplier placement reflects the boosted placement', afterCardTile === clearedScore + 88);

// The room also carries a real 'lineMultiplier' tile at (-1,-1) (item 10) —
// same offline-verified convention as item 9: the same card at (-1,-1)
// scores 58 with no tile there and 115 with the L×2 tile, since a word
// square doubles the *whole* E-W line's value rather than just the placed
// card's own contribution to it (the distinction item 10 exists to draw).
ok(
  'the lineMultiplier tile renders before anything is placed on it',
  (await p.locator('[data-room-cell="-1,-1"]').getAttribute('data-room-tile')) === 'lineMultiplier',
);
await placeHand0('-1,-1');
ok('the line tile boosted the placement to the expected score', (await text()).includes('scored 115'));
const afterLineTile = Number((await text()).match(/Score (\d+) \/ 50/)?.[1] ?? -1);
ok('score after the line-multiplier placement reflects the boosted placement', afterLineTile === afterCardTile + 115);

// The room also carries a real 'trap' tile at (-2,1) (item 12) — hidden
// until a placement lands on or beside it. The next cell in the placement
// chain, (-1,0), neighbours the trap without sitting on it, so this move
// demonstrates the "beside" trigger case rather than the more obvious "on"
// one. The exact score (70) was worked out offline against `expedition.ts`
// directly (same throwaway-script convention as items 7-10, run and
// discarded, not committed) — a trap costs a card, not points, so the
// score itself is untouched by the reveal happening on the same move.
ok(
  'the trap tile is hidden before anything triggers it',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === null,
);
await placeHand0('-1,0');
ok('the placement beside the trap scored normally', (await text()).includes('scored 70'));
ok(
  'the trap is revealed once triggered',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === 'trap',
);
ok('the log reports the trap cost', (await text()).includes('a trap sprang'));
const finalScore = Number((await text()).match(/Score (\d+) \/ 50/)?.[1] ?? -1);
ok('final score includes the trap-triggering placement', finalScore === afterLineTile + 70);

await p.locator('[data-room-leave]').click();
await p.waitForTimeout(300);
ok('leaving moves to the next room', (await text()).includes('Room 2 / 2'));
ok('the next room is the Hourglass', (await p.locator('[data-room="Hourglass"] [data-room-cell]').count()) > 0);
ok('the new room starts unreached and unscored', (await p.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false');
ok(
  "the running total carried the cleared room's score forward",
  (await text()).includes(`Running total ${finalScore}`),
);
ok('placement budget is fresh in the new room', (await text()).includes('placements left 12'));
ok('the new room\'s board has no cards on it', (await p.locator('[data-room="Hourglass"] .card-face').count()) === 0);

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
