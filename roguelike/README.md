# Unfolding

A roguelike that starts almost too simple — one quiet room, a shrine, stairs down; no
foes, not even HP — and grows
its own rulebook as you play. You draft which rules each world adopts at Rule Shrines, and
every rule cuts both ways, so the right pick depends on your build and your loot.

Design: [DESIGN.md](DESIGN.md). Playable build: https://claude.ai/artifact/NyhdTzivmYsKK66g5xS9N3
(republish with `npm run single`, then publish `dist/artifact.html` to that URL).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests, including bot-driven fuzz runs under every rule
npm run smoke    # build, serve, and play it in headless Chromium (desktop + phone)
npm run single   # dist/unfolding.html — the whole game in one file (+ dist/artifact.html)
npx vite-node tools/probe.ts 60   # balance probe: per-floor economy + rule-by-rule comparison
PROBE_DEPTH=25 npx vite-node tools/probe.ts 60 full   # how deep the late game goes
```

No framework: TypeScript, a canvas for the map and plain DOM for panels. Worlds and the
run in progress are saved in `localStorage`.

## Controls and options

Arrows / vi keys / numpad move; tap the map to step, hold a spot to walk there, drag to
look around. `;` or `v` (or **Look**) inspects any tile without moving; `g` picks up
what's underfoot. **Options** (`o`) is saved per browser:

| Option | Choices |
|---|---|
| Auto pickup | Everything · Gold only · Off |
| Warn before leaving a shrine behind | On · Off |
| Walk speed (hold-to-walk) | Slow · Normal · Fast |
| Hold to walk after | 0.25 s · 0.4 s · 0.6 s |
| Describe tiles on hover (mouse) | On · Off |
| On-screen controls | Auto · Always · Never |
| Vibrate when a walk starts | On · Off |
| Map tile size | Small · Normal · Large |
| Reduce motion | On · Off |

## Layout

| Path | What |
|---|---|
| `src/rules/rules.ts` | Rule definitions, the rule graph, derived stats, shrine previews |
| `src/engine/game.ts` | Turn loop, combat, shrines, rule adoption, death and graves |
| `src/engine/dungeon.ts` | Floor layout — a pure function of world seed and depth |
| `src/engine/content.ts` | Item and monster catalogues, floor population |
| `src/engine/world.ts` | World creation, heir names, persistence |
| `src/ui/` | Canvas renderer, sidebar/modals, app controller and input |
| `src/ui/describe.ts` | What Look mode / hover says about a tile |
| `src/ui/options.ts` | Play options: definitions, defaults, storage |

## How rules hook in

Every item and the player carry their full property set from the start (weight,
durability, element, STR/AGI/VIT…). Rules decide what gets read:

- `derive(player, ctx)` turns character + active rules into the numbers combat uses.
  The shrine preview is `derive` with the candidate rule minus `derive` without it.
- `Game.adopt(rule)` brings a rule in mid-run and reinterprets the current floor
  (objects appear, the lights go out, glimmering stones awaken).
- Content generation reads the active rules; floor geography never does, so heirs walk
  the same halls and find graves where their predecessors fell.

## Status

MVP: twelve rules (Halls, Peril, Things, Growth, Arms, Weight, Durability, Elements,
Darkness, Hunger, Arcana, Bestiary), shrines with personal previews on every floor,
per-world emergence depths (basic rules usually arrive early, occasionally very late),
mastery and imposed arrivals, rolled world variants, new world / new heir with one repeal, graves and a chronicle, keyboard
and touch controls. Every tuning number is in `src/engine/balance.ts`; see DESIGN.md §8
for what the probe measures and the targets.
