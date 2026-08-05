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
// The default seed ('rooms-13' as of item 22 — see RoomRunPage.tsx's own
// comment on why 'rooms-1' no longer works) and CONFIG are fixed, so this
// entire sequence is a deterministic path verified offline (a throwaway
// script against `expedition.ts` directly, run and discarded, not
// committed). Item 22 recalibrated Round Room's threshold from item 6's
// placeholder (50, clearable in 3 placements) to its own measured greedy
// median (1027, over the room's full 12-placement budget) — so unlike the
// old sequence, reaching the exit (move 1) and clearing the room (now move
// 12, the last placement in the budget) are far apart: "reached but short"
// is true for most of the room, not a fleeting moment before an early win.
await p.locator('button:has-text("Rooms"):visible').first().click();
await p.waitForTimeout(400);
// Item 21: the default run is now a 3-room graph (Round Room -> Hourglass or
// Cribbage Vault, depending on which of Round Room's two exits is reached),
// not the 2-room flat list items 7-20 built against — hence "/ 3" rather
// than the old "/ 2". Every placement below still lands on the *east* exit
// only, the one path item 21's graph routes to the Hourglass, so the entire
// established sequence through item 20 (scores, tiles, items) is otherwise
// untouched; the room graph's west branch (-> Cribbage Vault) gets its own,
// separate demonstration near the end of this file.
ok('rooms page opens', (await text()).includes('Room 1 / 3'));
ok('round room renders', (await p.locator('[data-room="Round Room"] [data-room-cell]').count()) > 0);
ok(
  'round room exit is marked',
  (await p.locator('[data-room="Round Room"] [data-room-cell="2,0"]').getAttribute('data-room-exit')) ===
    'true',
);

const roomPanel = () => p.locator('[data-room-panel="Round Room"]');
ok('room starts not reached', (await roomPanel().locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false');
ok('leave is disabled before clearing', await p.locator('[data-room-leave]').isDisabled());

// Item 14: the inventory substrate. Nothing in the game grants an item yet
// (that starts at item 15), so the panel reads "none" for the whole run —
// this only proves the substrate is wired into the page, not that it does
// anything, matching the item's own "no items yet" scope.
ok('inventory starts empty', (await p.locator('[data-expedition-items]').innerText()) === 'Items: none');

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

/** Item 22: the higher, real threshold means clearing needs cards other than
 * whichever one happens to be hand[0] — see the file header for why. Mirrors
 * `placeHand0` exactly, parameterised on which hand slot to click. */
async function placeHandAt(i, cell) {
  await p.locator(`[data-hand-index="${i}"]`).click();
  await p.waitForTimeout(120);
  await p.locator(`[data-room-cell="${cell}"]`).click();
  await p.waitForTimeout(200);
}

await placeHand0('2,0'); // lands on the exit — reach true, but score (40) is nowhere near the threshold (1027)
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

await placeHand0('1,0'); // still short (total 91)
ok('still short after the second placement', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
ok(
  'the tile is still there once a card is placed on the same cell',
  (await p.locator('[data-room-cell="1,0"]').getAttribute('data-room-tile')) === 'marker',
);
ok(
  'the card is also there, on top of the tile, not instead of it',
  (await p.locator('[data-room-cell="1,0"] .card-face').count()) === 1,
);

await placeHand0('0,0'); // still nowhere close (total 126) — reach was already true, score is the long pole here
ok('still short after the third placement, unlike the pre-item-22 sequence', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');

// The room also carries a real 'cardMultiplier' tile at (0,-1) (item 9). The
// exact score below was worked out offline against `expedition.ts` directly
// (same throwaway-script convention every prior item's numbers used, run and
// discarded, not committed).
ok(
  'the cardMultiplier tile renders before anything is placed on it',
  (await p.locator('[data-room-cell="0,-1"]').getAttribute('data-room-tile')) === 'cardMultiplier',
);
await placeHand0('0,-1');
ok('the tile boosted the placement to the expected score', (await text()).includes('scored 87'));

// The room also carries a real 'lineMultiplier' tile at (-1,-1) (item 10) —
// a word square doubling the *whole* E-W line's value rather than just the
// placed card's own contribution to it (the distinction item 10 exists to
// draw). Same offline-verified convention as item 9.
ok(
  'the lineMultiplier tile renders before anything is placed on it',
  (await p.locator('[data-room-cell="-1,-1"]').getAttribute('data-room-tile')) === 'lineMultiplier',
);
await placeHand0('-1,-1');
ok('the line tile boosted the placement to the expected score', (await text()).includes('scored 130'));

// The room also carries a real 'trap' tile at (-2,1) (item 12) — hidden
// until a placement lands on or beside it. The next cell in the placement
// chain, (-1,0), neighbours the trap without sitting on it, so this move
// demonstrates the "beside" trigger case rather than the more obvious "on"
// one. A trap costs a card, not points, so the score itself is untouched by
// the reveal happening on the same move.
ok(
  'the trap tile is hidden before anything triggers it',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === null,
);
await placeHand0('-1,0');
ok('the placement beside the trap scored normally', (await text()).includes('scored 97'));
ok(
  'the trap is revealed once triggered',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === 'trap',
);
ok('the log reports the trap cost', (await text()).includes('a trap sprang'));

// The room also carries a real 'artifact' tile at (-1,2) (item 13) — a card
// sitting on the board, always visible (no hidden/revealed state, unlike a
// trap), that joins the deck once the structure detours beside it. The next
// cell in the chain, (0,1), neighbours the artifact without landing on it —
// an artifact cell is never a legal placement target (the card is already
// there), so "beside" is the only case there is to demonstrate.
ok(
  'the artifact tile renders before anything triggers it, badged with its own card',
  (await p.locator('[data-room-cell="-1,2"]').getAttribute('data-room-tile')) === 'artifact' &&
    (await p.locator('[data-room-cell="-1,2"]').innerText()).includes('A♠'),
);
ok(
  'the artifact starts uncollected',
  (await p.locator('[data-room-cell="-1,2"]').getAttribute('data-room-artifact-collected')) === 'false',
);
await placeHand0('0,1');
ok('the placement beside the artifact scored normally', (await text()).includes('scored 70'));
ok(
  'the artifact is marked collected once triggered',
  (await p.locator('[data-room-cell="-1,2"]').getAttribute('data-room-artifact-collected')) === 'true',
);
ok('the log reports the card gained', (await text()).includes('an artifact joined the deck'));
const scoreAfterTour = Number((await text()).match(/Score (\d+) \/ 1027/)?.[1] ?? -1);
ok('every item 8-13 tile has now triggered, and the room is still nowhere near cleared', scoreAfterTour === 510);
ok('reached long ago, still short on score — the dual condition item 22 exists to test', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');

// Item 22: with a real (not placeholder) threshold, clearing Round Room needs
// most of its 12-placement budget, and needs cards other than whichever one
// happens to be hand[0] — a real player chooses which card to play, so this
// continuation plays the highest-scoring (card, cell) pair each turn, same as
// the calibration probe's own `greedy` agent, worked out offline the same way
// as every score above. It deliberately avoids the *west* exit ((-2,0)) even
// though it would be legally reachable, so this run stays a clean
// single-exit demonstration — the west branch gets its own run, further down.
await placeHandAt(6, '0,-2'); // the just-collected artifact card
ok('still short after the first continuation placement', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
await placeHandAt(5, '0,2');
await placeHandAt(3, '1,1');
await placeHandAt(4, '-1,1');
await placeHandAt(3, '-2,1'); // the trap cell itself — already sprung, so no second cost

ok('reach + score together clear the room, right at the end of the budget', (await roomPanel().locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true');
ok('leave is enabled once cleared', !(await p.locator('[data-room-leave]').isDisabled()));

const clearedScore = Number((await text()).match(/Score (\d+) \/ 1027/)?.[1] ?? -1);
ok('cleared room scored above its threshold', clearedScore > 1027);
const finalScoreWithArtifact = clearedScore;

// Item 18: temporary vs permanent items. Picked up here, right before
// leaving Round Room 1 — a room-duration item should read distinctly from a
// permanent one in the inventory line now, and be gone the moment the
// transition below fires, proving `leaveRoom` actually strips it rather than
// the post-transition "Items: none" check just meaning nothing was ever
// carried (true up through item 17, no longer the case once this runs).
ok('temporary marker pickup is available', await p.locator('[data-pickup-temp-marker]').isEnabled());
await p.locator('[data-pickup-temp-marker]').click();
await p.waitForTimeout(150);
ok(
  'inventory shows the room-scoped item tagged distinctly from a permanent one',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: Temporary marker (this room only)',
);

// Item 21: the leave button itself now previews its destination — "something
// known about each [next room] before you commit" — rather than an
// unlabelled "leave through exit". Only one button renders here since only
// the east exit has been reached; the west exit's own destination
// (Cribbage Vault) gets its own demonstration further down.
ok(
  'the leave button previews its destination before being clicked',
  (await p.locator('[data-room-leave]').getAttribute('data-room-leave-to')) === 'Hourglass',
);
await p.locator('[data-room-leave]').click();
await p.waitForTimeout(300);
ok('leaving moves to the next room', (await text()).includes('Room 2 / 3'));
ok('the next room is the Hourglass', (await p.locator('[data-room="Hourglass"] [data-room-cell]').count()) > 0);
ok('the new room starts unreached and unscored', (await p.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'false');
ok(
  "the running total carried the cleared room's score forward",
  (await text()).includes(`Running total ${finalScoreWithArtifact}`),
);
ok('placement budget is fresh in the new room', (await text()).includes('placements left 12'));
ok('the new room\'s board has no cards on it', (await p.locator('[data-room="Hourglass"] .card-face').count()) === 0);
ok(
  'the room-duration item was dropped by the transition, not just never carried',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: none',
);

// Item 15: the first item with a real effect — a carried second counter,
// via item 2's own combining machinery. There is no in-room pickup mechanic
// yet (nothing in the backlog through item 18 asks for one), so a small dev
// button stands in for it — see RoomRunPage.tsx's own comment on why. Picked
// up here, in the fresh Hourglass, before any placement, so every score
// below is already the combo (cribbage + poker) figure, not a single
// before/after placement the way item 15 first demonstrated it against the
// old placeholder threshold — item 22's real threshold (967, the room's own
// measured greedy median) needs most of the room's budget to reach, the same
// reason Round Room's own continuation above does.
ok('cribbage counter pickup is available', await p.locator('[data-pickup-second-counter]').isEnabled());
await p.locator('[data-pickup-second-counter]').click();
await p.waitForTimeout(150);
ok(
  'inventory shows the carried counter',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: Cribbage (2nd counter)',
);
ok('the pickup control disables once carried', await p.locator('[data-pickup-second-counter]').isDisabled());

// Same offline-verified convention as Round Room's own continuation above:
// the highest-scoring (card, cell) pair each turn, played under the combo
// counter from the very first placement.
await placeHandAt(1, '0,-4'); // the Hourglass's own north exit
ok('landing on the exit reaches it', (await p.locator('[data-room-reach]').getAttribute('data-room-reach')) === 'true');
ok('reached, but nowhere near the 967 threshold yet', (await p.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
await placeHandAt(2, '1,-4');
await placeHandAt(5, '0,-3');
await placeHandAt(5, '-1,-3');
await placeHandAt(3, '1,-3');
await placeHandAt(6, '-1,-2');
await placeHandAt(6, '0,-2');
await placeHandAt(2, '0,-1');
await placeHandAt(2, '0,0');
ok('still short with one placement left in the budget', (await p.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'false');
await placeHandAt(6, '0,1');
ok(
  'the combo counter carried the room past its threshold with placements to spare',
  (await p.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true',
);
ok('the Hourglass cleared under a real, non-placeholder threshold', (await text()).includes('Score 1043 / 967'));

// Item 16: sight — a carried item that reveals a room's hidden tiles (traps)
// ahead of triggering any of them, without touching score or their cost —
// "changes decisions without touching score" is the whole point of keeping
// items away from multipliers. The established Round Room sequence above
// already sprang its one trap by the time this point in the run is reached,
// so demonstrating "hidden until sight reveals it" needs a fresh room —
// "New expedition" resets to a brand-new Round Room with an empty inventory.
await p.locator('button:has-text("New expedition")').click();
await p.waitForTimeout(300);
ok('a fresh expedition starts back in the Round Room', (await text()).includes('Room 1 / 3 — Round Room'));
ok(
  'the trap is still hidden by default on a fresh expedition — sight has not been picked up yet',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === null,
);
ok('sight pickup is available', await p.locator('[data-pickup-sight]').isEnabled());
await p.locator('[data-pickup-sight]').click();
await p.waitForTimeout(150);
ok(
  'inventory shows the carried sight item',
  (await p.locator('[data-expedition-items]').innerText()).includes('Sight'),
);
ok('the sight pickup control disables once carried', await p.locator('[data-pickup-sight]').isDisabled());
ok(
  'the trap is now visible without anything having triggered it',
  (await p.locator('[data-room-cell="-2,1"]').getAttribute('data-room-tile')) === 'trap',
);
ok(
  'nothing has actually been placed near the trap, so its cost has not been paid',
  (await text()).includes('placements left 12'),
);

// Item 17: reach anchor — a carried charge that lets exactly one placement
// skip the adjacency requirement, i.e. "place one card unconnected". This is
// a pure legality/inventory effect, not a scoring one (unlike items 9/10 it
// needs no offline-computed score to prove — the fact under test is whether
// a cell is placeable at all). Same fresh, empty-board expedition the sight
// check above left in place (still carrying only sight).
await placeHand0('0,0'); // the opening placement — always legal on an empty board
ok('placements left after the opening placement', (await text()).includes('placements left 11'));

// (2,-1) is two steps from the origin — not adjacent to the card just
// placed there, and nothing else is on the board — so without a reach
// anchor it must be rejected exactly like item 11's blocked-cell case:
// nothing appears, and no placement is spent.
await p.locator('[data-hand-index="0"]').click();
await p.waitForTimeout(120);
await p.locator('[data-room-cell="2,-1"]').click();
await p.waitForTimeout(200);
ok(
  'an unconnected cell is rejected with no reach anchor carried',
  (await p.locator('[data-room-cell="2,-1"] .card-face').count()) === 0,
);
ok('the failed click spent no placement', (await text()).includes('placements left 11'));
await p.locator('[data-hand-index="0"]').click(); // deselect

ok('reach anchor pickup is available', await p.locator('[data-pickup-reach-anchor]').isEnabled());
await p.locator('[data-pickup-reach-anchor]').click();
await p.waitForTimeout(150);
ok(
  'inventory shows the carried reach anchor alongside sight',
  (await p.locator('[data-expedition-items]').innerText()) ===
    'Items: Sight (reveals traps), Reach anchor (place one card unconnected)',
);
ok('the reach anchor pickup control disables once carried', await p.locator('[data-pickup-reach-anchor]').isDisabled());

await placeHand0('2,-1'); // now legal — the carried charge covers exactly this one unconnected cell
ok(
  'the previously-illegal cell now holds a real card',
  (await p.locator('[data-room-cell="2,-1"] .card-face').count()) === 1,
);
ok('placements left after spending the reach anchor', (await text()).includes('placements left 10'));
ok(
  'the charge is spent the moment a placement actually relies on it — inventory drops back to just sight',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: Sight (reveals traps)',
);
ok(
  'the pickup control re-enables once the one charge it granted is gone',
  await p.locator('[data-pickup-reach-anchor]').isEnabled(),
);

// (2,-2) neighbours only the card just dropped at (2,-1), not the origin —
// legal proof that the unconnected placement became a real second origin
// the ordinary adjacency rule now grows from on its own, with no charge left
// to spend.
await placeHand0('2,-2');
ok(
  'growth from the new island needs no further charge',
  (await p.locator('[data-room-cell="2,-2"] .card-face').count()) === 1,
);
ok('placements left after the unassisted follow-up placement', (await text()).includes('placements left 9'));
ok(
  'inventory is unchanged — nothing was spent on a placement that was already legal on its own',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: Sight (reveals traps)',
);

// Item 19: room archetypes — a room's own active counters (and tile density,
// and threshold) overriding whatever the run's own Config carries. The
// default run above is entirely CONFIG's own poker; "Dev: load archetype
// rooms" swaps in ARCHETYPE_ROOMS (shapes.ts), starting fresh in the
// Cribbage Vault — a 7-cell room with cribbage-only counters and a sparse
// (~14%) tile density, the opposite end of both axes from the dense,
// combo-countered Combo Bazaar that follows it. hand[0] onto (0,0) scoring
// exactly 9 — cribbage's flat "3 points/card, no count" on a lone 3S across
// all three lines — is a deterministic path verified offline the same way
// the Round Room sequence above was (a throwaway script against
// `expedition.ts`, run and discarded, not committed): CONFIG's own lensId is
// 'poker', so this score is only reachable if the room's counters actually
// won.
await p.locator('[data-load-archetypes]').click();
await p.waitForTimeout(400);
ok('the archetype-rooms run opens in the Cribbage Vault', (await text()).includes('Room 1 / 2 — Cribbage Vault'));
ok('the vault renders its 7 cells', (await p.locator('[data-room="Cribbage Vault"] [data-room-cell]').count()) === 7);
ok(
  'the vault panel reports its own cribbage counter, not the run cfg\'s poker',
  (await p.locator('[data-room-archetype]').innerText()).includes('Cribbage'),
);
ok(
  'the vault reports a sparser tile density than the Combo Bazaar will',
  (await p.locator('[data-room-archetype]').innerText()).includes('14% tiled'),
);
await placeHand0('0,0');
ok(
  'the opening placement scored under the vault\'s own cribbage counter, not CONFIG\'s poker default',
  (await text()).includes('scored 9'),
);

// Item 20: seeded room generation (`generate.ts`). "Dev: load generated
// room" starts a fresh single-room expedition built from a fixed seed
// ('rooms-1-generated') so this room's exact shape is a known quantity,
// worked out offline against `generate.ts` directly (a throwaway
// `vite-node` script, same convention items 9/15/19 used, run and
// discarded, not committed): 19 cells, exits at (0,2) and (0,-2), threshold
// 60, a hidden trap at the origin (0,0), and two always-visible tiles —
// lineMultiplier at (-2,2), cardMultiplier at (-1,2). Checking a placement
// actually triggers the trap (not just that the tile substrate renders)
// proves a generated room is playable, not merely well-formed data.
await p.locator('[data-load-generated]').click();
await p.waitForTimeout(400);
ok(
  'the generated-room run opens in its own single-room expedition',
  (await text()).includes('Room 1 / 1 — Generated (rooms-1-generated)'),
);
ok(
  'the generated room renders all 19 of its cells',
  (await p.locator('[data-room="Generated (rooms-1-generated)"] [data-room-cell]').count()) === 19,
);
ok('the generated room reports its offline-computed threshold', (await text()).includes('threshold 60'));
ok(
  'both generated exits render as exits',
  (await p.locator('[data-room-cell="0,2"]').getAttribute('data-room-exit')) === 'true' &&
    (await p.locator('[data-room-cell="0,-2"]').getAttribute('data-room-exit')) === 'true',
);
ok(
  'the generated line-multiplier tile renders before anything is placed',
  (await p.locator('[data-room-cell="-2,2"]').getAttribute('data-room-tile')) === 'lineMultiplier',
);
ok(
  'the generated card-multiplier tile renders before anything is placed',
  (await p.locator('[data-room-cell="-1,2"]').getAttribute('data-room-tile')) === 'cardMultiplier',
);
ok(
  'the generated trap stays hidden until triggered',
  (await p.locator('[data-room-cell="0,0"]').getAttribute('data-room-tile')) === null,
);
await placeHand0('0,0');
ok(
  'placing on the hidden trap springs it, the same mechanic item 12 built for the hand-authored rooms',
  (await p.locator('[data-room-cell="0,0"]').getAttribute('data-room-tile')) === 'trap',
);
ok('the sprung trap cost a card, logged the same way as any hand-authored room', (await text()).includes('a trap sprang'));

// Item 21: prove the room graph's west branch actually leads somewhere
// different from the east branch's Hourglass — the whole point of the item.
// Round Room's west exit (-2,0) is never touched by the primary sequence
// above, which only ever walks east. A fresh expedition this time, bounded
// by the room's own 12-placement budget so this can never hang even if it
// needed every last placement.
//
// "New expedition" does not reseed from the bare `DEFAULT_SEED` — its own
// handler (`RoomRunPage.tsx`'s `restart`) derives
// `${DEFAULT_SEED}-${state.roomIndex}-${state.log.length}` from whatever
// state was active the moment it's clicked, so the seed actually in play
// here depends on everything that happened earlier in this same run (the
// item 20 generated-room detour immediately above it, in particular). Found
// by instrumenting `restart` with a temporary `console.log` and reading it
// back off a Playwright console listener (reverted before committing, not
// left in) rather than assumed — the seed here is `rooms-13-0-1`, not
// `rooms-13`. A plain greedy walk on that seed, avoiding the east exit,
// falls 10 points short of the 1027 threshold using the full budget; a
// one-ply lookahead (best move plus best immediate follow-up, same shape as
// `lookahead` in `tools/probe.test.ts`) closes the gap, worked out offline
// the same way as every other score in this file.
await p.locator('button:has-text("New expedition")').click();
await p.waitForTimeout(300);
ok('a fresh default expedition starts back in the Round Room', (await text()).includes('Room 1 / 3 — Round Room'));

const westPath = [
  [4, '0,-1'],
  [1, '0,-2'],
  [2, '-1,0'],
  [4, '-1,-1'],
  [4, '-2,0'], // the west exit
  [4, '-2,1'],
  [3, '-1,1'],
  [6, '0,0'],
  [0, '0,1'],
  [4, '0,2'],
  [6, '1,-2'],
  [6, '1,0'],
];
let westCleared = false;
for (const [i, cell] of westPath) {
  await placeHandAt(i, cell);
  westCleared = (await p.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true';
  if (westCleared) break;
}
ok('walking toward the west exit eventually clears the room', westCleared);
ok(
  'the west exit itself is occupied — this run reached west, not east',
  (await p.locator('[data-room-cell="-2,0"] .card-face').count()) === 1,
);
ok(
  'only one leave button renders — the east exit was never reached this run',
  (await p.locator('[data-room-leave]').count()) === 1,
);
ok(
  "the leave button previews the room graph's west branch, distinct from the east branch's Hourglass",
  (await p.locator('[data-room-leave]').getAttribute('data-room-leave-to')) === 'Cribbage Vault',
);
await p.locator('[data-room-leave]').click();
await p.waitForTimeout(300);
ok(
  "the west exit led to a genuinely different room than the east exit's Hourglass",
  (await text()).includes('Room 3 / 3 — Cribbage Vault'),
);
ok(
  'the destination room actually rendered, not just the header text',
  (await p.locator('[data-room="Cribbage Vault"] [data-room-cell]').count()) === 7,
);

await p.locator('button:has-text("Back to the board")').click();
await p.waitForTimeout(300);

// --- item 23: the room metrics page -----------------------------------------
//
// Rebuilds the Metrics page's own idea (clear rate, reach pressure, spread,
// a highlighted baseline row) for rooms instead of flat rulesets. Hex Sprawl
// plays the reference-row part Poker Squares plays on the flat page.
await p.locator('button:has-text("Room Metrics"):visible').first().click();
await p.waitForTimeout(400);
const roomMetricsText = await text();
ok('room metrics page opens', roomMetricsText.includes('Room Metrics'));
ok('clear rate column shown', roomMetricsText.includes('Clear rate'));
ok('reach pressure column shown', roomMetricsText.includes('Reach %'));
ok('choice spread column shown', roomMetricsText.includes('Choice spread'));
ok('hex sprawl reference row shown', roomMetricsText.includes('Hex Sprawl'));
ok(
  'all four calibration rooms listed',
  ['Round Room', 'Hourglass', 'Cribbage Vault', 'Combo Bazaar'].every((n) => roomMetricsText.includes(n)),
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
