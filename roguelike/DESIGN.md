# Unfolding — Design Doc

A roguelike dungeon crawler that starts out almost insultingly simple and grows its own
rulebook as you play. **New rules are the main progression path, alongside stats and
gear** — and because you choose which rules the world adopts, rule selection is a
strategic decision tied to your build and your loot.

---

## 1. Pillars

1. **The rules are the loot.** Discovering a new mechanic should feel as good as finding a
   legendary weapon.
2. **Rules are a draft, not a ladder.** You pick which rules enter the world. Every rule
   cuts both ways, so the right pick depends on what you are carrying and who you are.
3. **It was always there.** Content for locked rules is generated from turn one and lies
   dormant. When a rule activates, the world you already explored is reinterpreted.
4. **Every world writes its own rulebook.** Rule order, rule variants and rule choices
   differ per world, so no two worlds converge on the same game.
5. **The world remembers.** Characters die; worlds persist. Heirs inherit the rulebook
   their predecessors chose — and the graves they left.

---

## 2. Strategic rule selection (the core idea)

### 2.1 Latent properties

Every item, creature and tile is generated with its **full property set**, including
properties for rules that are not active. Only active rules read them.

| Object | Always active | Latent until a rule turns it on |
|---|---|---|
| Greatsword | attack 9 | weight 6 (Weight), durability 45 (Durability), element ember (Elements) |
| Plate armour | defense 4 | weight 5 (Weight), durability 50 (Durability) |
| Player | HP | STR/AGI/VIT 3 (Growth), satiety (Hunger), mana (Arcana) |
| Glimmering floor stone | nothing | ember / frost hazard (Elements) |

So a Greatsword found while Weight is inactive is simply a huge attack bonus with no
drawback. The moment the world adopts Weight, that same Greatsword is heavier than your
STR and every swing costs two turns — unless you've been pumping STR, in which case your
swings now stagger enemies.

The game tells you an item has hidden depths without spoiling them:
*"There are 2 things about this you cannot perceive yet."*

### 2.2 Every rule is double-edged

Rules are designed so that **no rule is a pure buff or a pure nerf** — the net effect
depends on your current build:

| Rule | Upside | Downside | Good for… |
|---|---|---|---|
| **Weight** | Weapons you can carry stagger foes (chance = weight × 8%); heavy armour absorbs extra damage | Weapon heavier than STR → attacks cost 2 turns; armour heavier than STR → moving costs 2 turns | High-STR builds; anyone wielding a light weapon |
| **Durability** | Newly forged arms are +2 stronger; a breaking weapon deals a triple-damage final blow | Arms lose durability per use and eventually shatter | Loot-rich runs that swap gear often |
| **Darkness** | Unaware enemies take double damage (sneak attacks); enemies only chase what they see | You only see a small radius; the map must be explored | Patient, ambush-oriented play |
| **Hunger** | Natural regeneration while fed (none exists otherwise) | Satiety drains; starving hurts | Players who explore thoroughly and find food |
| **Growth** | XP, levels, stat choices | You can miss; foes scale faster with depth | Long runs |
| **Arms** | Weapons and armour | Bare fists weaken | Almost everyone — but it opens Weight and Durability |
| **Elements** | Elemental weapons, weaknesses, environmental hazards you can lure foes onto | Hazards hurt you too; some foes resist | Players with an elemental weapon |
| **Arcana** | Mana and abilities (Cleave, Mend) | Lower max HP | Growth builds that can afford the HP |

### 2.3 The shrine preview

Rules are chosen at **Rule Shrines** (one on every floor, including the first). A shrine offers up to
three rules from the frontier of the rule graph. Each offer shows a **personal preview**
computed from your exact current character:

```
WEIGHT — "Steel has heft."
  For you, right now:
    Attack cost   1 turn → 2 turns     (Greatsword wt 6 > STR 3)
    Stagger       —      → 0%
    Move cost     1 turn → 1 turn      (Leather wt 1 ≤ STR 3)
```

This is the decision the whole game is built around: *I just found a Greatsword. Do I
take Weight now, or keep it out of this world for as long as I can?*

Taking a rule also grants the shrine's boon (a full heal, once there is HP to heal). You may **step away** and come
back while you're on the same floor — perhaps after seeing what loot the floor holds —
but descending without choosing leaves the shrine dark. Refusing is allowed; it costs
you the boon and the chance to steer the world.

### 2.4 Emergence: when basic rules show up

Each world rolls, once, the depth at which each **basic** rule first shows itself
(Halls, Peril, Things, Growth, Darkness, Bestiary). Shrines only offer rules that have
emerged by the current depth. The roll is skewed early with a long tail:

| Emerges at depth | Chance |
|---|---|
| 1 | ~48% |
| 2 | ~22% |
| 3–4 | ~18% |
| 5–12 (the long wait) | ~12% |

So most worlds offer Halls on the first floor or two — but about one world in eight
keeps you in single rooms until depth 5–12, or never shows you Darkness until the
deep. Exceptions keep the start playable:

- **Peril** always emerges by depth 3: without it there is nothing to fight.
- The **first shrine is always a choice**: at least two of Halls, Peril and Things
  emerge on depth 1.
- **Bestiary** emerges 2 floors later than a basic rule would (depth 3 at the earliest).

Strategic rules (Arms, Weight, Durability, Elements, Hunger, Arcana) don't roll; their
prerequisites pace them instead.

### 2.5 Rules that arrive by themselves

Not everything is chosen:

- **Mastery** — *Things* also arrives on your fifth kill, even if it hasn't emerged yet.
- **Imposed** — *Bestiary* is never offered at a shrine. Once it has emerged (and Peril and
  Growth exist, so you can grow to meet it) it arrives when you descend. The deep wakes up whether you like it or not.

### 2.6 The rule graph

Rules have prerequisites, forming a graph rather than a ladder:

```
Halls                      (no prerequisites)
Things ───────────┐
Peril ──┬─────────┴── Arms ──┬── Weight
        │         └── Hunger ├── Durability
        ├── Growth ─┬─ Arcana └── Elements
        │           └─ Bestiary  (imposed once emerged)
        └── Darkness
```

The **frontier** is every inactive rule whose prerequisites are all active and that has
emerged by the current depth. Shrines draw from it. Declining a rule doesn't remove it
from the frontier — it can come back.

---

## 3. Complexity tiers

The graph roughly maps to tiers, which pace how the game feels:

| Tier | Feels like | Rules |
|---|---|---|
| 0 | Barely a game: one quiet room, a shrine, stairs down. No foes, no HP | — |
| 1 | The world takes shape: danger, space, objects | Peril, Halls, Things |
| 2 | A character exists | Growth, Arms |
| 3 | Gear has trade-offs | Weight, Durability, Elements, Hunger, Darkness |
| 4 | Powers | Arcana |
| 5+ (post-MVP) | Society: NPCs, shops, factions, reputation | — |
| 6+ (post-MVP) | Systems: crafting, light, stealth, terrain chemistry | — |
| 7 (post-MVP) | Meta: rules that edit rules, time, laws of a floor | — |

### The UI grows with the rules

At Tier 0 the HUD has no HP at all — nothing can hurt you. A panel only exists once its system does —
the inventory appears with Things, stats with Growth, satiety with Hunger. When a rule
arrives, a banner announces it and its panel fades in.

---

## 4. Worlds and characters

### 4.1 New World

- Fresh seed; the rulebook starts empty: one room, a shrine, the stairs.
- The seed rolls when each basic rule **emerges** (§2.4) and a **variant** for each rule (e.g. *Iron World: all weights +1*,
  *Moonless: sight radius 3*). Variants are shown at the shrine, so they feed the draft.
- Every floor below the first has **stairs up** where you arrive. Floors you leave are
  remembered for the rest of the run (dead foes stay dead, taken loot stays taken), and a
  remembered floor catches up on rules the world adopted while you were elsewhere. Leaving
  a floor by either stairs darkens its unanswered shrine.
- Floor layouts are deterministic from the world seed and depth — the world has a fixed
  geography that heirs will walk again. Without Halls a floor is just its largest room;
  when Halls arrives mid-floor, that room opens into the rest of the floor and the stairs
  move somewhere you haven't been.

### 4.2 Continue World (new heir)

- The heir inherits the world's full rulebook: every rule their predecessors adopted.
- **Repeal:** each heir may repeal **one** inherited rule before setting out — only a
  rule nothing else depends on (a leaf in the active graph). Your ancestors' choices
  constrain you, but you get one veto. The repealed rule returns to the frontier.
- **Graves:** each dead character leaves a grave at the exact tile they died on, holding
  their best item. Heirs can recover it — if the world's rules still let them use it.
- **World Age** (number of generations) is shown on the world list. Post-MVP: age raises
  the complexity ceiling and unlocks tiers only veteran worlds can reach.
- **History:** the world keeps a chronicle of every character, how deep they got and
  what killed them.

### 4.3 Why both modes matter

- **New World** is the pure experience: start simple, unfold, make the draft decisions
  from scratch.
- **Continue World** is the strategic long game: inherit a rulebook, build *for* it, use
  your one repeal, recover your ancestors' gear.

---

## 5. Core loop

```
explore floor → fight, loot, find shrine → draft a rule (or refuse)
      ↑                                              │
      │                          the world reinterprets itself
      │                                              ↓
 new heir / new world ← die ← descend deeper ← adapt build to new rules
```

---

## 6. Architecture

- **Pure TypeScript engine, no framework.** Canvas renders the map; DOM renders panels.
- **Rules as modules.** Each rule declares id, prerequisites, text, variants and optional
  hooks:
  - `derive(stats, ctx)` — modify derived player stats (attack, attack cost, sight…)
  - `preview(ctx)` — extra lines for the shrine's personal preview
  - `onActivate(game)` — reinterpret the current floor when the rule arrives
  - `populate(floor, ctx)` — place content when a floor is generated
  - `onTurnEnd(game)`, `onPlayerHit(game, hit)` — per-turn and combat effects
- **Derived stats are a pure function** of character + active rules. The shrine preview
  is just `derive(character, rules ∪ {candidate}) − derive(character, rules)`.
- **Persistence:** `localStorage` holds worlds (seed, rules, variants, history, graves)
  and at most one run in progress per world.
- **Determinism:** seeded RNG everywhere. Layout = f(world seed, depth); content =
  f(world seed, generation, depth).

---

## 7. MVP scope (this branch)

- [x] Tier 0: a single quiet room with a shrine and stairs; no foes, no HP
- [x] Rules: Halls, Peril, Things, Growth, Arms, Weight, Durability, Elements, Darkness,
      Hunger, Arcana, Bestiary (imposed)
- [x] Per-world emergence depths for basic rules: usually early, occasionally very late
- [x] Latent properties on items and the player; dormant glimmer tiles
- [x] Rule Shrines with personal previews; mastery and milestone triggers
- [x] One rolled variant per rule per world
- [x] New World / Continue World, heir repeal, graves, chronicle
- [x] Growing UI; codex of active rules
- [x] Keyboard and touch controls

### What's next

See [ROADMAP.md](ROADMAP.md): the genotype/phenotype split, axioms and schisms that make
worlds play differently, a 60-mechanic catalogue, the premise atlas, and the phased plan.
Graves and Ghosts are there as low-priority Remembrance rules.

## 8. Balance

All tuning numbers live in `src/engine/balance.ts`. `tools/probe.ts` plays many runs with
an explorer bot (visits every room, eats when Hungry, judges gear by its real effect)
and reports the economy per floor, plus a rule-by-rule comparison. Targets from the
first balance pass:

- **Food** supplies roughly 1.3–1.6× what a thorough player burns: you stay fed if you
  collect it, starve a little if you don't. Hunger's regen is a real but minor heal.
- **Early Peril** floors are a threat, not a wall: most fresh runs survive past depth 4.
- **Strategic rules are near-even trades** for a sensible player (within about one
  floor of the base ruleset): Weight and Durability cost a little, Darkness, Hunger
  and Arcana give a little. Bestiary is harder by design.
- **Every run ends**: past about depth 14 foes outpace levels.

## 9. Open questions

- **Gold has no use yet.** It needs a sink (shops in a Society tier) or a role as score.

- **Narrative frame.** Why does the world grow rules? (A god relearning reality; a
  simulation booting; the dungeon is dreaming.)
- **Fairness in aged worlds.** Is one repeal enough for a new player inheriting ten rules?
- **Should variants be hidden** until experienced, rather than shown at the shrine?
- **Refusal pressure.** Is "lose the boon" enough of a cost, or should refusing a shrine
  feed a world-level Entropy?
