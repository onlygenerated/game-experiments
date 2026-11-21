# game-experiments

Small game prototypes, one folder each under `games/`. Every game is
self-contained and runs on its own.

| Game | What it is | State |
|---|---|---|
| [`unfolding`](games/unfolding/) | A roguelike that starts almost too simple and drafts its own rulebook as you play. | Playable, in progress |
| [`grid-cards`](games/grid-cards/) | Place a card on a grid, score every line it joins. Three boards (grid, hex sprawl, rooms) and thirty scoring variants. | Playable, explored out |
| [`bury`](games/bury/) | Nine cards, seven positions, a pip cap; buried cards come back with the ghost of that line. | Playable prototype |
| [`kangaroo`](games/kangaroo/) | A word toy for finding kangaroo words (`lager` carries `ale`) by stripping letters off tile racks. | Playable |
| [`qwirkle-3d`](games/qwirkle-3d/) | Qwirkle in a cubic lattice — a placement joins three lines instead of two. | Spec only |

```bash
npm install                      # once, at the root — it's a workspace
cd games/grid-cards && npm run dev
```

## Browsing them all

`site/index.html` is a landing page that links every game. To build it with
every game behind it:

```bash
npm install
npm run site            # builds each game into _site/<game>/
npm run site:preview    # http://localhost:4300
```

On every push to `main`, `.github/workflows/pages.yml` builds the same `_site/`
and publishes it with GitHub Pages (Settings → Pages → Source: GitHub Actions).

When you add a game, give it a `build` script that writes `dist/index.html`
with a relative base (`base: './'` in Vite), and add a card to `site/index.html`.

`CLAUDE.md` has the guidelines that apply across all of them. The short version:
each game is genuinely its own game, ship something playable before you write
much down, and measure only when playing it can't settle a question.

`tools/` at the root is environment infrastructure — commit signing, headless
Chromium launch. No game logic lives there.
