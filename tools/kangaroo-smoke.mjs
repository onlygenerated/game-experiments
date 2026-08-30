/**
 * End-to-end smoke test for the Kangaroo racks page.
 *
 *   node tools/kangaroo-smoke.mjs      (expects a build served on PORT)
 *
 * Drives the one flow the tool exists for — LAGER, take a child, drag the G
 * and the R into the tray, rearrange the rest into ALE — with a real pointer,
 * then checks the tap path, the keyboard path, undo, and that a reload brings
 * the tree back.
 */
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const PORT = Number(process.env.SMOKE_PORT || 4174);
const ORIGIN = `http://localhost:${PORT}`;

async function serve() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(ORIGIN)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('preview server never came up');
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

/** Drag one tile onto a target, by their centres. A real pointer sequence:
 *  the app listens to pointer events, not HTML5 drag-and-drop. */
async function dragTo(page, tile, target, { edge = 'centre' } = {}) {
  const a = await tile.boundingBox();
  const b = await target.boundingBox();
  const x = edge === 'left' ? b.x + 4 : edge === 'right' ? b.x + b.width - 4 : b.x + b.width / 2;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** A drag made of genuine touch pointer events. Playwright's touchscreen can
 *  only tap, and `page.mouse` reports pointerType 'mouse', so the touch path
 *  would otherwise never actually be exercised. */
async function touchDrag(page, x1, y1, x2, y2) {
  await page.evaluate(
    async ([x1, y1, x2, y2]) => {
      const fire = (type, x, y) => {
        const target = document.elementFromPoint(x, y) ?? document.body;
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: y,
          }),
        );
      };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      fire('pointerdown', x1, y1);
      for (let i = 1; i <= 10; i++) {
        fire('pointermove', x1 + ((x2 - x1) * i) / 10, y1 + ((y2 - y1) * i) / 10);
        await frame();
      }
      fire('pointerup', x2, y2);
    },
    [x1, y1, x2, y2],
  );
  await page.waitForTimeout(50);
}

const racks = (page) => page.locator('[data-zone="rack"]');
const trays = (page) => page.locator('[data-zone="tray"]');
const tileIn = (zone, letter) => zone.locator(`[data-tile-id]`).filter({ hasText: letter }).first();
const spelled = async (zone) =>
  (await zone.locator('[data-tile-id]').allTextContents()).map((t) => t.replace(/[^A-Z]/g, '')).join('');

const server = await serve();
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN);

  await page.getByRole('button', { name: 'Kangaroo' }).click();
  await page.getByLabel('Start with a word').fill('lager');
  await page.getByRole('button', { name: 'Make the rack' }).click();

  check('root rack spells LAGER', await spelled(racks(page).first()), 'LAGER');

  // --- the flow: child, remove two letters, rearrange into ALE ---------------
  await page.getByRole('button', { name: '+ child' }).first().click();
  check('two racks after + child', await racks(page).count(), 2);
  const child = racks(page).nth(1);
  const childTray = trays(page).nth(1);
  check('child inherits LAGER', await spelled(child), 'LAGER');

  await dragTo(page, tileIn(child, 'G'), childTray);
  await dragTo(page, tileIn(child, 'R'), childTray);
  check('child rack after removals', await spelled(child), 'LAE');
  check('tray holds the removed letters', await spelled(childTray), 'GR');

  // A onto the left edge of L: the caret lands before it, giving A L E.
  await dragTo(page, tileIn(child, 'A'), tileIn(child, 'L'), { edge: 'left' });
  check('child rack spells ALE', await spelled(child), 'ALE');
  check('caption reads ALE', await page.locator('text=ALE').first().isVisible(), true);

  // --- the parent is untouched by the child's edits -------------------------
  check('parent still spells LAGER', await spelled(racks(page).first()), 'LAGER');

  // --- returning a letter ---------------------------------------------------
  await dragTo(page, tileIn(childTray, 'G'), child, { edge: 'right' });
  check('returned tile lands back on the rack', await spelled(child), 'ALEG');
  check('tray is down to one', await spelled(childTray), 'R');
  await page.getByRole('button', { name: 'Undo' }).click();
  check('undo puts it back in the tray', await spelled(child), 'ALE');

  // --- tap path: tap a tile, tap another, they swap -------------------------
  await tileIn(child, 'E').click();
  await tileIn(child, 'A').click();
  check('tap-then-tap moves the tile', await spelled(child), 'EAL');
  await page.getByRole('button', { name: 'Undo' }).click();
  check('undo restores ALE', await spelled(child), 'ALE');

  // --- keyboard path --------------------------------------------------------
  await tileIn(child, 'A').focus();
  await page.keyboard.press('ArrowRight');
  check('ArrowRight shifts the focused tile', await spelled(child), 'LAE');
  await page.keyboard.press('ArrowDown');
  check('ArrowDown sends it to the tray', await spelled(child), 'LE');
  // G is back in the tray — the undo two steps up restored it there.
  check('tray took it', await spelled(childTray), 'GRA');
  await page.keyboard.press('ArrowUp');
  check('ArrowUp brings it back', await spelled(child), 'LEA');

  // --- a grandchild inherits from the child ---------------------------------
  await page.getByRole('button', { name: '+ child' }).nth(1).click();
  check('three racks', await racks(page).count(), 3);
  check('grandchild inherits LEA', await spelled(racks(page).nth(2)), 'LEA');

  // --- delete takes the subtree, undo brings it back ------------------------
  await page.getByRole('button', { name: 'Delete this rack and its children' }).first().click();
  check('deleting the child takes the grandchild', await racks(page).count(), 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  check('undo restores the subtree', await racks(page).count(), 3);

  // --- persistence ----------------------------------------------------------
  await page.reload();
  await page.getByRole('button', { name: 'Kangaroo' }).click();
  check('the tree survives a reload', await racks(page).count(), 3);
  check('and still spells LEA', await spelled(racks(page).nth(1)), 'LEA');

  // --- shuffle keeps the letters, clear/restore round-trip ------------------
  const first = racks(page).first();
  await page.getByRole('button', { name: 'Send every letter to the tray' }).first().click();
  check('clear empties the rack', await spelled(first), '');
  check('empty rack reads as empty', await page.locator('text=empty').first().isVisible(), true);
  await page.getByRole('button', { name: 'Bring the whole tray back' }).first().click();
  check('restore brings them all back', (await spelled(first)).split('').sort().join(''), 'AEGLR');

  await page.getByRole('button', { name: 'Shuffle the rack' }).first().click();
  check('shuffle keeps every letter', (await spelled(first)).split('').sort().join(''), 'AEGLR');

  // --- collapse -------------------------------------------------------------
  await page.locator('button[aria-expanded="true"]').first().click();
  check('collapsing hides the subtree', await racks(page).count(), 1);

  check('no page errors', errors.join(' | '), '');
  await page.close();

  // --- a phone, with a finger, on a word long enough to wrap ---------------
  // The insertion caret is worked out from tile midpoints, and a wrapped rack
  // is where naive x-only maths puts the caret a whole row out.
  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const phoneErrors = [];
  phone.on('pageerror', (e) => phoneErrors.push(String(e)));
  await phone.goto(ORIGIN);
  await phone.evaluate(() => localStorage.clear());
  await phone.reload();
  await phone.getByRole('button', { name: /^Dev/ }).click();
  await phone.getByRole('button', { name: 'Kangaroo' }).click();
  await phone.getByLabel('Start with a word').fill('illuminated');
  await phone.getByRole('button', { name: 'Make the rack' }).click();

  const rack = racks(phone).first();
  const tray = trays(phone).first();
  check('an 11-letter rack seeds whole', await spelled(rack), 'ILLUMINATED');
  const box = await rack.boundingBox();
  check('the rack fits the phone', box.width <= 390, true);
  check('and wraps rather than overflowing', box.height > 60, true);

  // Tap-to-select, then tap the first tile: the D travels to the front.
  await tileIn(rack, 'D').tap();
  await rack.locator('[data-tile-id]').first().tap();
  check('tap-then-tap works with a finger', await spelled(rack), 'DILLUMINATE');

  // A real touch drag — pointerType 'touch', not a mouse — from the wrapped
  // second row down into the tray.
  const last = rack.locator('[data-tile-id]').last();
  const a = await last.boundingBox();
  const t = await tray.boundingBox();
  await touchDrag(phone, a.x + a.width / 2, a.y + a.height / 2, t.x + t.width / 2, t.y + t.height / 2);
  check('a wrapped tile drags to the tray', await spelled(rack), 'DILLUMINAT');
  check('the tray caught it', await spelled(tray), 'E');
  check('no page errors on the phone', phoneErrors.join(' | '), '');
  await phone.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(failures === 0 ? '\nall good' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
