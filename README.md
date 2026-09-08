# game-experiments

Small game prototypes, one folder each under `games/`. Every game is
self-contained and runs on its own.

| Game | What it is | State |
|---|---|---|
| [`grid-cards`](games/grid-cards/) | Place a card on a grid, score every line it joins. Three boards (grid, hex sprawl, rooms) and thirty scoring variants. | Playable, explored out |
| [`qwirkle-3d`](games/qwirkle-3d/) | Qwirkle in a cubic lattice — a placement joins three lines instead of two. | Spec only |

```bash
npm install                      # once, at the root — it's a workspace
cd games/grid-cards && npm run dev
```

`CLAUDE.md` has the guidelines that apply across all of them. The short version:
each game is genuinely its own game, ship something playable before you write
much down, and measure only when playing it can't settle a question.

`tools/` at the root is environment infrastructure — commit signing, headless
Chromium launch. No game logic lives there.
