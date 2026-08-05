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

// The room also carries a real 'artifact' tile at (-1,2) (item 13) — a card
// sitting on the board, always visible (no hidden/revealed state, unlike a
// trap), that joins the deck once the structure detours beside it. The next
// cell in the chain, (0,1), neighbours the artifact without landing on it —
// an artifact cell is never a legal placement target (the card is already
// there), so "beside" is the only case there is to demonstrate. The exact
// score (61) and the artifact's badge/id were worked out offline against
// `expedition.ts` directly (same throwaway-script convention as items 7-12,
// run and discarded, not committed).
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
ok('the placement beside the artifact scored normally', (await text()).includes('scored 61'));
ok(
  'the artifact is marked collected once triggered',
  (await p.locator('[data-room-cell="-1,2"]').getAttribute('data-room-artifact-collected')) === 'true',
);
ok('the log reports the card gained', (await text()).includes('an artifact joined the deck'));
const finalScoreWithArtifact = Number((await text()).match(/Score (\d+) \/ 50/)?.[1] ?? -1);
ok('final score includes the artifact-triggering placement', finalScoreWithArtifact === finalScore + 61);

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

await p.locator('[data-room-leave]').click();
await p.waitForTimeout(300);
ok('leaving moves to the next room', (await text()).includes('Room 2 / 2'));
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
// up here, in the fresh Hourglass, then landed on its own north exit: worked
// out offline against `expedition.ts` directly (same throwaway-script
// convention as items 7-13, run and discarded, not committed) that the same
// card at the same cell scores 46 under poker alone (reached, but short of
// the 50 threshold) and 59 once cribbage is carried too (reached AND past
// the threshold) — the item is the entire difference between a near-miss and
// a clear here, not just a bigger number.
ok('cribbage counter pickup is available', await p.locator('[data-pickup-second-counter]').isEnabled());
await p.locator('[data-pickup-second-counter]').click();
await p.waitForTimeout(150);
ok(
  'inventory shows the carried counter',
  (await p.locator('[data-expedition-items]').innerText()) === 'Items: Cribbage (2nd counter)',
);
ok('the pickup control disables once carried', await p.locator('[data-pickup-second-counter]').isDisabled());

await placeHand0('0,-4'); // the Hourglass's own north exit
ok('the carried counter boosted the placement to the expected score', (await text()).includes('scored 59'));
ok(
  'the boosted placement alone clears the room — 46 alone would not have',
  (await p.locator('[data-room-cleared]').getAttribute('data-room-cleared')) === 'true',
);

// Item 16: sight — a carried item that reveals a room's hidden tiles (traps)
// ahead of triggering any of them, without touching score or their cost —
// "changes decisions without touching score" is the whole point of keeping
// items away from multipliers. The established Round Room sequence above
// already sprang its one trap by the time this point in the run is reached,
// so demonstrating "hidden until sight reveals it" needs a fresh room —
// "New expedition" resets to a brand-new Round Room with an empty inventory.
await p.locator('button:has-text("New expedition")').click();
await p.waitForTimeout(300);
ok('a fresh expedition starts back in the Round Room', (await text()).includes('Room 1 / 2 — Round Room'));
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
