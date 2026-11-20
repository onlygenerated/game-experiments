# Unfolding — Roadmap

Where the game goes next. [DESIGN.md](DESIGN.md) describes the game as it stands; this
document describes what to build on top of it, and in what order.

Two goals drive everything here:

1. **Worlds should play differently.** One world may only allow ranged attacks, another
   only magic, another no violence at all. The rule graph branches, and some branches
   close others forever.
2. **Worlds should look and sound unrecognisable from one another.** The same mechanic
   — "a consumable that restores health" — is a potion in one world, a sprig of
   bruise-moss in another, and a sealed compliment in a third. The mechanics are the
   genes; what the player sees is how each world expresses them.

The current build is deliberately classic (rats, potions, swords) because it was built
to prove the mechanics. That classic look survives as one rare premise, *The Old Stone*;
everything else should feel like nothing else.

**Contents**

1. [Structural approach](#1-structural-approach)
2. [Phased plan](#2-phased-plan)
3. [Mechanics catalogue](#3-mechanics-catalogue) — 60 mechanics in 13 families
4. [Premise atlas](#4-premise-atlas) — 14 worlds' worth of themes
5. [Example worlds](#5-example-worlds)
6. [Guardrails](#6-guardrails)
7. [Open questions](#7-open-questions)

---

## 1. Structural approach

### 1.1 Genotype and phenotype

Every mechanic is split into two layers:

| Layer | What it is | Who changes it | Example |
|---|---|---|---|
| **Genotype** | The rule's behaviour and numbers: what it does, its hooks, its balance parameters | Engine code and `balance.ts` | "Restorative: heals 8. Stackable. One turn to use." |
| **Phenotype** | Everything the player perceives: name, glyph colour, verb, log lines, flavour, the name of the meter it fills | Premise data, no code | *Cold brew* ("You chug the cold brew. Your eye twitches. +8 Job Security.") |

Phenotypes may carry a small **tilt** — at most ±20% on one or two parameters — so a
world's version *feels* native (Tidepool shells really are heavier; Court of Barbs
insults really do go stale faster). Tilts are data, bounded, and checked by the probe.

The player is never left guessing what something *does*. Look mode and the Codex always
add a plain mechanical line under the themed one: *Cold brew — "restores 8 Job
Security (health)"*. A **Plain labels** option swaps every themed noun for its
mechanical name, for players who want the genes without the costume.

### 1.2 Roles: the slots every world fills

A **role** is a noun or verb the engine needs. Every world binds every role it uses to
one expression. Glyphs stay tied to the role (a restorative is always `!`) so habits carry
across worlds; names, colours, verbs and text change.

| Role | Genotype | *The Old Stone* (today) | Elsewhere |
|---|---|---|---|
| Avatar | You; what an heir is | Heir | Temp, hermit crab, applicant, spore delegate |
| Vitality | The HP meter's name | HP | Job Security, Dignity, Shell, Sleep, Patience |
| Foe ×4 tiers | Peril's and Bestiary's creatures | Rat, bat, goblin, slime | Interns → The Synergy Committee |
| Implement | Arms: what you harm with | Dagger … Maul | Stapler, a cutting remark, an urchin spine |
| Ward | Arms: what protects you | Leather … Plate | Cardigan, a lace fan, a whelk shell |
| Restorative | Things: heals | Healing Potion | Bruise-moss, cold brew, a sealed compliment |
| Sustenance + meter | Hunger | Ration / Satiety | Vending snacks / Morale; tidewater / Moisture |
| Currency | Things: money | Gold | PTO hours, seeds, favours, sea-glass |
| Hazard pair | Elements: hot and cold | Ember / frost stones | Scandal / The Cold Shoulder |
| Light | Darkness and Light | Sight radius | Motion-sensor lights, fireflies in a jar |
| Power | Arcana's meter and abilities | Mana; Cleave, Mend | Synergy; "Circle Back", "Take It Offline" |
| Shrine | Where rules come from | Rule Shrine Ω | The Suggestion Box, a grafting altar |
| Descent / Ascent | Stairs | `>` / `<` | Freight elevator / fire stairs |
| Remains | Remembrance: graves | Grave † | Exit-interview folder, an empty shell |
| Depth unit | What a floor is called | Depth | Sublevel, Nave, Salon, Pool, Office |
| Death | How dying is phrased | "You die" | "terminated", "laughed out of court" |
| Ammunition, Spell, Barb | Only in worlds whose axioms need them | — | Paper airplanes; Form 9-Q; an extended metaphor |

### 1.3 Premises: how a world chooses its look

A **premise** is a world's elevator pitch plus a bundle of expressions, e.g. *The
Merger: the sub-basements of a conglomerate halfway through digesting a rival.* World
generation goes:

1. **Roll a premise** (weighted; *The Old Stone* is rare).
2. **Bind each role** to an expression. Expressions carry tags (`corporate`, `botanical`,
   `verbal`, `domestic`, `tiny`…); the premise's own expressions are strongly preferred.
3. **Intrusions.** Each world rolls 0–2 roles that are deliberately bound from a
   *different* premise, with a generated line of justification: *"The lobby ficus has
   gone feral. Its leaves heal."* This is where the gonzo juxtapositions come from —
   corporate foes, botanical healing, verbal weapons, all in one place.
4. **Name things** with the premise's grammar: world names, heir names ("Associate
   Dana Okafor, badge 4471"), floor names ("Sublevel 3 — Accounts Receivable"), epitaphs.

Premises also carry **affinities** for axioms (below): the Court of Barbs leans toward
verbal combat, the Tidepool toward the Tide Clock. Affinities weight the rolls; they
never force them. Sometimes the Court has swords, and that's a stranger court.

### 1.4 Axioms and schisms: how worlds play differently

Today every rule is additive. Branching needs rules that **exclude** each other. An
**axiom** is a rule that answers one fundamental question about a world, and its siblings
answer the same question differently:

| Axiom family | The question | Options |
|---|---|---|
| Means of Harm | How do you hurt things? | Strike (today), Volley, Arcanum, Discourse, Evasion, Retinue, Gambit |
| Shape of Space | What is a floor? | Halls (today), Caverns, Drift, Strata, Ring |
| Flow of Time | What is a turn? | Turns (today), Tide Clock, Rewind, Tempo |
| Self | What are you? | One body (today), Party, Swarm, Possession |
| Knowledge | Can you trust what you see? | Plain (today), Mystery, Unreliable Narrator |

Axioms arrive in two ways:

- **Rolled**: some families are decided at world creation and simply *are* (and are
  discovered as you go — the first time you try to hit something in a Volley world, you
  learn you can't).
- **Schism shrines**: a special shrine (distinct glyph) offers 2–4 options from one family.
  Choosing one **closes the others for this world forever**; heirs inherit the choice and
  cannot repeal it. A late Amendment (§3, M-51) can overturn a schism, at a steep price.

**Adapters.** Every drafted rule declares how it behaves under each axiom it can coexist
with, or that it can't. Under Volley, *Arms* yields launchers and *Weight* shortens range
instead of slowing swings. Under Discourse, *Arms* yields barbs, *Weight* becomes
Gravitas, *Durability* becomes Staleness, and *Elements* becomes registers (Mockery vs.
Flattery). Under Evasion, *Arms* is excluded outright and *Growth* is earned by
not being seen. Adapters are the main engineering cost of branching, and the main source
of "this world plays nothing like that one".

### 1.5 The world genome

A world's identity is its genome, rolled once from its seed:

- one **premise**, 0–2 **intrusions**
- one option per **axiom family** (rolled now, or left for a schism shrine to settle)
- a **rule pool**: the subset of drafted rules this world can ever discover (around 60%
  of the catalogue), so two worlds don't converge on the same rulebook
- **emergence depths** and **variants** for each rule in the pool (as today)

Heirs inherit the genome. The Codex shows the genome as it's discovered: "This world
has 23 rules. You have found 9. Means of Harm: Discourse."

### 1.6 Engine work this requires

1. **Rule modules.** Replace the per-rule `switch` statements in `game.ts` with modules
   that implement hooks: `derive`, `onAdopt`, `reinterpretFloor`, `onTurn`, `onHarm`,
   `onKill`, `populate`, `preview`, `describe`, plus `adapters` per axiom.
2. **Lexicon.** Every player-visible word goes through the lexicon: `lex('restorative')`,
   log templates like `"{Foe} {harms} you for {n}."` → "The Middle Manager *CCs* you
   for 3." HUD labels, Codex text, the shrine preview and death screens included.
3. **Content as data.** Premises and expressions live in data files, validated by tests:
   every premise binds every role, names are unique per world, glyphs don't collide on
   a floor, tilts stay in bounds, and the text reads cleanly (no "a an").
4. **Harm channels.** Generalise the attack into channels (strike, projectile, spell,
   verbal, none) with range, line of fire and targeting.
5. **Targeting UI.** Reuse the Look cursor to aim, on keyboard and touch; add "target
   nearest" for quick play.
6. **Status framework.** Durations, stacking and resistances, for Afflictions,
   Composure, Morale and more.
7. **Exclusive groups in the rule graph**, schism shrines, the genome, and emergence for
   every rule.
8. **Save v3 + migration.** Existing worlds become *The Old Stone* with axioms Strike,
   Halls, Turns, One body, Plain.
9. **Probe per axiom.** Bot policies for each Means of Harm; a parity check that each
   axiom's median depth is within about 1.5 floors of the others.
10. **Accessibility.** Colour-blind-safe palettes per premise, Plain labels, and every
    distinction carried by glyph or text, never colour alone.

---

## 2. Phased plan

In priority order. Each phase ends playable, with tests and probe targets met.

### Phase 0 — Foundations (engine only) — **done**

Rule modules, lexicon, content-as-data, save v3 and migration, exclusive groups and
genome in the rule graph. **Exit:** the game plays exactly as today, but *The Old Stone*
is a data file and no player-visible string is hard-coded in the engine.

*Shipped as:* `src/rules/modules.ts` (behaviour and hooks), `src/theme/` (premise type,
*The Old Stone*, lexicon), `World.genome` with v2 → v3 migration, exclusive groups and
the rule pool in `eligible`/`frontier`/`repealable`. Proved by a golden test of 22 seeded
games (identical moves, log lines and rendered panels before and after), a premise
validation suite, and a guard that fails on prose in engine source. Not yet done from
§1.6: harm channels, targeting and the status framework — they arrive with the
features that need them (Phase 2 and 4).

### Phase 1 — First premises — **done**

Six premises fully bound for the twelve existing rules: **The Merger, The Overgrown
Choir, The Court of Barbs, The Tidepool, The Ministry of Forms, The Night Shift.** The
premise roll, intrusions, naming grammar, mechanical glosses, the Plain labels option.
*The Old Stone* becomes rare. **Exit:** two random worlds side by side share no
player-visible noun except the glyphs.

*Shipped as:* `src/theme/base.ts` (36 role words, every message key, rule texts and the
five borrowable bundles), six premise files in `src/theme/premises/`, *The Plain* (the
mechanical vocabulary), and `rollLook` in `world.ts`. A new world rolls its premise on
its own seeded stream (each themed premise weight 5, *The Old Stone* weight 1, about 3%),
then 0–2 intrusions (50/35/15) from other premises; each heir is told where the borrowed
things came from. *The Old Stone* is pure: it lends but never borrows, because its texts
name rats and potions outright. Items carry a genotype key, so their names follow the
world's words and the Plain labels option (Options → Display), which can be toggled
mid-run. Themed rule names, foes, items and bars carry small mechanical glosses
("Headcount · PERIL"); floors have names in the top bar; world cards, the heir screen and
the Codex name the premise and its borrowings. The exit criterion is a test (no two
rollable premises share a noun), with a second test that no host line still names a thing
it has borrowed, over every host × bundle × donor.

### Phase 2 — Means of Harm (the first schism) and a use for money

**Volley**, **Arcanum** and **Discourse**, with harm channels, targeting and adapters for
every existing rule. **Commerce** (M-42), because currency is dead weight today. Schism
shrines. **Exit:** probe parity across Strike / Volley / Arcanum / Discourse; a player
who has only played Strike worlds has to relearn how to fight.

### Phase 3 — Space, time, and an ending

**Caverns**, **Drift**, **Tide Clock**, and **The Heart** (M-55) so worlds can be
completed. **Exit:** at least one world in five plays under a non-default space or time
axiom; worlds record their Age and their winner.

### Phase 4 — Tactics and world systems

**Afflictions, Momentum, Morale, Noise, Light, Thresholds, Traps, Chemistry**
(M-32 to M-36, M-38 to M-40). These deepen every axiom rather than adding a new one.
**Exit:** each has adapters for all four Means of Harm built so far.

### Phase 5 — The rest of the atlas

The remaining premises: **The Last Buffet, The Lost & Found, The Mycelial Commune, The
Weather Carnival, The Museum After Close, The Orbital Retirement Home, The Endless
Reception, The Glass Archive.** Premise-axiom affinities tuned. **Exit:** fourteen
premises; a new world is *The Old Stone* less than 5% of the time.

### Phase 6 — Radical selves and societies

The axioms that change what the player *is* — **Evasion, Retinue, Party, Swarm,
Possession** — and the social layer: **Factions, Bargains, Allies, Crafting, Debt,
Composure, Mutation, Mystery**. **Exit:** probe parity for Evasion and Retinue; a world
where you never harm anything is completable.

### Phase 7 — Rules about rules

**Amendments, Edicts, Vows, Inversion, Wardens, Errands, Unreliable Narrator, Rewind,
Gambit, Strata, Ring, Tempo, Fatigue, Encumbrance, Secrets.** **Exit:** a world's rulebook
can change shape after it has formed.

### Phase 8 — Remembrance (low priority)

**Graves** become a discoverable rule instead of always-on; **Ghosts** and **Lineage** follow.
Until then, graves stay as they work today.

### Smaller ideas, not yet scheduled

- **Attunement:** an heir in an old world receives inherited rules gradually over the
  first floors instead of all at once.
- **Rule-specific item traits:** traits that only exist under certain rules
  ("Featherweight" only means something under Weight).

### First steps for Phase 2

1. Harm channels and targeting in the engine (§1.6): an attack becomes *who, by what
   channel, how much*, so Volley and Arcanum are adapters rather than forks.
2. **Volley** first, as the first exclusive *Means of Harm* member besides Strike, with
   its role words (ammunition, launcher) added to every premise.
3. A schism shrine: offers one axiom family member, once, early, with a clear warning.
4. **Commerce** (M-42) so currency has a use; it needs a merchant role per premise.
5. Probe parity runs for Strike vs Volley before Arcanum and Discourse.

---

## 3. Mechanics catalogue

Sixty mechanics: the twelve that exist, re-expressed, and forty-eight new ones. Each
lists its kind, what it does (genotype) and how worlds express it (phenotypes). Italics
name the premise; see §4 for each premise in full.

**Kinds:** *Axiom* (exclusive within its family), *Drafted* (offered at shrines),
*Imposed* (arrives by itself), *Emergent* (rolled emergence depth, as today).

### A. The existing twelve, re-expressed

#### M-01 · Halls — *Emergent*
One room becomes many rooms and corridors.
- *The Merger* — **Open Plan**: the partition walls are wheeled away overnight.
- *The Overgrown Choir* — **Side Chapels**: the nave splits into bramble aisles.
- *The Court of Barbs* — **The East Wing Reopens**: dust sheets come off a hundred rooms.
- *The Tidepool* — **Low Water**: the tide drops and joins your pool to its neighbours.
- *The Ministry of Forms* — **New Departments**: doors appear, numbered in an order that skips.
- *The Mycelial Commune* — **Hyphal Spread**: the network grows corridors while you sleep.
- *The Orbital Retirement Home* — **Re-pressurised Modules**: sealed wings hiss open.
- *The Endless Reception* — **The Venue Expands**: another ballroom, and another.

#### M-02 · Peril — *Emergent*
Foes exist, and you have a vitality meter to lose.
- *The Merger* — **Headcount**: staff return from lunch. Vitality: Job Security.
- *The Overgrown Choir* — **Infestation**: the garden notices you. Vitality: Sap.
- *The Court of Barbs* — **Society**: the guests arrive. Vitality: Dignity.
- *The Tidepool* — **Predators**: something moves under the weed. Vitality: Shell.
- *The Night Shift* — **The Shift Starts**: the nightmares clock in. Vitality: Sleep.
- *The Ministry of Forms* — **Opening Hours**: the shutters go up. Vitality: Patience.
- *The Endless Reception* — **The Guests Arrive**: and they all know you. Vitality: Poise.
- *The Glass Archive* — **The Readers Return**. Vitality: Clarity.

#### M-03 · Things — *Emergent*
Restoratives and currency exist.
- *The Merger* — cold brew; PTO hours.
- *The Overgrown Choir* — bruise-moss; seeds.
- *The Court of Barbs* — a sealed compliment; favours.
- *The Last Buffet* — a sachet of unexplained relish; tip-jar coins.
- *The Lost & Found* — a photograph someone dropped; buttons.
- *The Tidepool* — a strand of kelp; sea-glass.
- *The Orbital Retirement Home* — a weekly pill organiser (one day's compartment); bingo chips.
- *The Glass Archive* — a vial holding a remembered smell; overdue slips.

#### M-04 · Growth — *Emergent*
Levels and three stats.
- *The Merger* — **Pay Grades**: Hustle, Tact, Stamina.
- *The Overgrown Choir* — **Growth Rings**: Reach, Root, Bloom.
- *The Tidepool* — **Molts**: Pinch, Scuttle, Shell. Each level you're briefly soft (flavour).
- *The Court of Barbs* — **Titles**, Baronet to Marquess: Wit, Poise, Nerve.
- *The Mycelial Commune* — **Fruiting**: Spread, Digest, Mass.
- *The Night Shift* — **Lucidity**: Will, Drift, Rest.
- *The Orbital Retirement Home* — **Seniority**: Grip, Reflex, Ticker.

#### M-05 · Arms — *Drafted*
Implements and wards. (Under Discourse it yields barbs; under Arcanum, foci; under
Evasion it is excluded.)
- *The Merger* — stapler, three-hole punch, laminated binder / lanyard, cardigan, lumbar brace.
- *The Overgrown Choir* — trowel, pruning hook, iron-bound hymnal / bark mantle, beeswax coat.
- *The Tidepool* — urchin spine, bottle shard, a borrowed claw / cockle, whelk, a doll's teacup.
- *The Last Buffet* — butter knife, ladle, cast-iron skillet / bib, oven mitts, apron of many stains.
- *The Lost & Found* — one roller skate, an umbrella, keys to unknown doors / a coat that isn't yours.
- *The Museum After Close* — a foam replica halberd, a rope stanchion / display glass, a docent's blazer.
- *The Orbital Retirement Home* — cane, walking frame / space blanket, compression stockings.

#### M-06 · Weight — *Drafted*
Heft against strength.
- *The Tidepool* — **Shell Mass**: the native home. A heavier shell is safer and slower.
- *The Court of Barbs* — **Gravitas**: a weighty insult takes two turns to deliver, and leaves them speechless.
- *The Orbital Retirement Home* — **Inertia**: heavy things hit hard, and you keep drifting after the swing.
- *The Merger* — **Workload**: binders in triplicate.
- *The Last Buffet* — **Portion Size**.
- *The Ministry of Forms* — **Paperwork**: every form has carbons.
- *The Overgrown Choir* — **Green Wood**: freshly cut tools are heavy with sap.

#### M-07 · Durability — *Drafted*
Things wear out; the last use is the strongest.
- *The Court of Barbs* — **Staleness**: every joke wears out; told once too often, it lands for triple, then dies. The last laugh.
- *The Merger* — **Warranty**: office supplies jam; the final staple goes deep.
- *The Overgrown Choir* — **Rot**.
- *The Last Buffet* — **Spoilage**.
- *The Lost & Found* — **Re-loss**: worn-out things wander off to be lost again.
- *The Museum After Close* — **Conservation**: handling artefacts damages them.
- *The Night Shift* — **Fading**: dream objects dissolve on waking.
- *The Glass Archive* — **Hairline Cracks**.

#### M-08 · Elements — *Drafted*
A pair of opposed hazards and affinities.
- *The Merger* — server-room heat / the break-room freezer.
- *The Overgrown Choir* — fever pollen / dew-frost.
- *The Court of Barbs* — Scandal / The Cold Shoulder.
- *The Tidepool* — sun-baked rock / cold upwelling.
- *The Last Buffet* — the grill / the walk-in.
- *The Ministry of Forms* — URGENT / ON HOLD.
- *The Weather Carnival* — lightning puddles / hailfields.
- *The Endless Reception* — the dance floor / the cold buffet.

#### M-09 · Darkness — *Drafted*
Limited sight; unaware foes are vulnerable.
- *The Merger* — **Power-Saving Mode**: the lights only come on where you move.
- *The Overgrown Choir* — **The Canopy Closes**.
- *The Tidepool* — **Silt**.
- *The Court of Barbs* — **The Chandeliers Are Lowered for Cleaning**.
- *The Museum After Close* — **Lights Out**: only the exit signs glow.
- *The Orbital Retirement Home* — **The Night Side of the Orbit**.
- *The Endless Reception* — **The Slow Dance**.

#### M-10 · Hunger — *Drafted*
A meter that drains; sustenance refills it.
- *The Merger* — **Morale**, refilled from vending machines.
- *The Overgrown Choir* — **Thirst**, rainwater in leaf cups.
- *The Tidepool* — **Moisture**: you dry out; puddles refill you.
- *The Court of Barbs* — **Relevance**: gossip feeds it; starve and you fade from conversation.
- *The Last Buffet* — **Fullness**, inverted (tilt): you start full, eating slows you, and staying peckish is the skill.
- *The Orbital Retirement Home* — **Oxygen**, from canisters.
- *The Night Shift* — **Wakefulness**, from coffee.
- *The Mycelial Commune* — **Nutrients**, from rot.

#### M-11 · Arcana — *Drafted*
A power meter and two abilities.
- *The Merger* — **Synergy**: *Circle Back* (strike everything adjacent), *Take It Offline* (heal).
- *The Overgrown Choir* — **Hymns**: the Pruning Psalm, the Psalm of Mending.
- *The Court of Barbs* — **Wit**: *Riposte*, and *Self-Deprecation* (heals; nobody can mock you better).
- *The Night Shift* — **Lucid Edits**.
- *The Ministry of Forms* — **Exemptions**: stamp yourself NOT APPLICABLE.
- *The Orbital Retirement Home* — **Gadgets**: the grabber arm, the heated blanket.
- *The Mycelial Commune* — **Spore Bursts**.

#### M-12 · Bestiary — *Imposed*
Tiered foes. Each premise names four tiers (§4); a few examples:
- *The Merger* — Interns → Middle Managers → Compliance Officers → The Synergy Committee.
- *The Court of Barbs* — Pages → Sonneteers → Dowagers → The Jester Royal.
- *The Tidepool* — Periwinkles → Shore Crabs → The Gull → The Octopus.
- *The Ministry of Forms* — Clerks → Notaries → Auditors → The Undersecretary.
- *The Endless Reception* — Cousins → The Aunt With Opinions → The Best Man's Speech → The Mother of the Bride.
- *The Glass Archive* — Redactions → Dust Readers → Misfiled Memories → The Forgetting.

### B. Axioms — Means of Harm

#### M-13 · Strike — *Axiom* (the default)
Walk into a foe to harm it, with an implement. Everything built so far.
- *The Merger* — the stapler at close quarters: "You staple the Intern's sleeve to the desk."
- *The Tidepool* — **Pinch**.
- *The Overgrown Choir* — **Prune**.
- *The Last Buffet* — a skillet, applied.
- *The Mycelial Commune* — **Digest on Contact**.
- *The Lost & Found* — a wild swing of an umbrella.

#### M-14 · Volley — *Axiom: ranged only*
No bump attacks (walking into a foe shoves it harmlessly). You fire along a line, up to a
range, and the first body stops the shot. Ammunition is a role; spent shots land where
they fall and can be collected (Durability decides how many survive). Weight shortens
range and hits harder. Half the bestiary become skirmishers that keep their distance and
shoot back. Corridors become killing lanes; ammunition is an economy.
- *The Merger* — **Paper Airplanes**: memos folded into darts, weighted with paperclips. "Your memo banks off the water cooler and catches the Compliance Officer in the ear."
- *The Overgrown Choir* — **Seed Spitting**: spent seeds sprout into brambles where they land.
- *The Tidepool* — **Water Jets**: ammunition is Moisture itself, shared with Hunger.
- *The Orbital Retirement Home* — **Dentures and Recoil**: every throw pushes you a tile backwards.
- *The Endless Reception* — **Rice and Bouquets**: rice is weak and plentiful; the bouquet, one per floor, is devastating.
- *The Last Buffet* — **Food Fight**: you're throwing your own dinner.
- *The Weather Carnival* — **Hailstones**: caught and thrown; they melt if you hold them too long.
- *The Court of Barbs* — **Thrown Gloves**: a challenge across the hall; collect each glove where it falls.

#### M-15 · Arcanum — *Axiom: magic only*
No implements. All harm comes from a spellbook of three to six slots, filled at shrines
and from found pages. Spell shapes: bolt, cone, burst, line, rune (delayed). Power is
everything. Weight becomes casting time; Durability becomes fatigue (a spell cast over
and over weakens until you rest).
- *The Merger* — **Buzzword Incantations**: *Leverage* (bolt), *Circle Back* (returns next turn), *Boil the Ocean* (a burst that hurts you too).
- *The Overgrown Choir* — **Hymnody**: two spells cast on consecutive turns harmonise.
- *The Night Shift* — **Lucid Edits**: rewrite a tile ("that wall was always a door").
- *The Ministry of Forms* — **Forms**: Form 9-Q *Relocation* moves a foe; Form 31 *Cessation* stuns. Each needs a stamp.
- *The Mycelial Commune* — **Spore Craft**: clouds that linger and spread.
- *The Glass Archive* — **Recollection** heals; **Forgetting** erases a foe from a room for a while.
- *The Museum After Close* — **Restoration Rites**: glue, varnish, and re-labelling (change what a foe *is*).
- *The Weather Carnival* — **Forecasts**: name a tile; it happens there next turn.

#### M-16 · Discourse — *Axiom: verbal harm*
Harm is said, not done. Foes have temperaments (Vain, Pedantic, Anxious, Proud,
Earnest); barbs have registers (Mockery, Pedantry, Flattery, Pity, Silence), with a
weak/resist matrix that replaces Elements. Barbs reach anyone within earshot (three
tiles) and go around corners, but bystanders react. Gravitas, Staleness and Flustered
replace Weight, Durability and stagger. Defeated foes leave (sometimes as allies).
- *The Court of Barbs* — **Insult Duels**: the native home.
- *The Merger* — **Feedback**: "I'm going to push back on that" (Pedantry); "Love the energy" (Flattery, weaponised).
- *The Endless Reception* — **Toasts**: a toast that runs long hits the whole room, friends included.
- *The Ministry of Forms* — **Objections and Appeals**: cite the regulation.
- *The Museum After Close* — **Docent Lectures**: tedium damage, devastating against taxidermy (they can't leave).
- *The Weather Carnival* — **Doom Forecasts**: prophecies delivered with total confidence.
- *The Glass Archive* — **Corrections**: telling a memory it's wrong.

#### M-17 · Evasion — *Axiom: no harm at all*
You can't hurt anything. Foes are obstacles with vision cones and patrols; being caught
costs vitality or drags you back. Distractions, hiding places and doors are your tools.
Growth becomes Finesse: experience for floors crossed unseen and for near misses.
- *The Merger* — **Avoid the Meeting**: a manager who spots you pulls you into a meeting (ten turns lost).
- *The Night Shift* — **Don't Wake the Dreamer**.
- *The Museum After Close* — **The Guard's Rounds**.
- *The Lost & Found* — **Stay Lost**: being found sends you back to the claim desk, a floor up.
- *The Tidepool* — **Under the Gull's Shadow**: hide in the weed.
- *The Orbital Retirement Home* — **Skipping Bingo**: caught residents get a sponge bath.
- *The Glass Archive* — **Unremembered**: if a Reader notices you, you start to become one of their memories.

#### M-18 · Retinue — *Axiom: command, don't fight*
You have no attack. You recruit followers and give simple orders (follow, hold, go
there, take that one) with the Look cursor. Followers have their own needs and
morale. Growth raises how many you can lead and how good they are.
- *The Merger* — **Delegation**: interns who report back, eventually.
- *The Mycelial Commune* — **Colonies** you seed.
- *The Court of Barbs* — **Hangers-on** who fight your duels for you.
- *The Lost & Found* — **A Pack of Lost Dogs**.
- *The Overgrown Choir* — **A Hive**.
- *The Endless Reception* — **Bridesmaids**: coordinated and terrifying.
- *The Weather Carnival* — **Your Own Little Cloud**, which grows into a storm.

#### M-19 · Gambit — *Axiom: luck you can see*
Hit chance is replaced by a visible hand of five cards (or dice, or tokens). Each turn
you choose which to play; items add and remove cards; the deck rebuilds each floor.
- *The Weather Carnival* — **Midway Games**: ring toss, the strength bell.
- *The Endless Reception* — **The Bouquet Toss**.
- *The Merger* — **Quarterly Projections**: a hand of forecasts.
- *The Court of Barbs* — **Calling Cards**.
- *The Last Buffet* — **Fortune Cookies**: crack one per strike.
- *The Orbital Retirement Home* — **Bingo Cards**: complete a line for a big move.

### C. Axioms — Shape of Space

#### M-20 · Caverns — *Axiom*
Organic, cellular-automata caves instead of rooms and corridors: wide spaces, no doors.
Good for Volley and Retinue, bad for hiding.
- *The Overgrown Choir* — **Root Hollows**.
- *The Mycelial Commune* — **Hyphal Galleries**.
- *The Tidepool* — **Rock Pools**.
- *The Last Buffet* — **The Spill**: a sea of gravy with islands of tables.
- *The Glass Archive* — **Collapsed Stacks**.
- *The Weather Carnival* — **The Mud Field**.

#### M-21 · Drift — *Axiom*
Every so often, rooms you aren't in change places and corridors reroute; the stairs stay
put. Your map goes stale. Urgency without a timer.
- *The Merger* — **Hot-Desking**: rooms are reassigned every forty turns.
- *The Tidepool* — **Shifting Sand**.
- *The Night Shift* — **Dream Logic**.
- *The Museum After Close* — **Rotating Exhibits**.
- *The Lost & Found* — **Restocking**.
- *The Orbital Retirement Home* — **Centrifuge Rotation**.
- *The Weather Carnival* — **The Tents Blow Away**.

#### M-22 · Strata — *Axiom*
Each floor has two layers joined by ladders and holes. You can fall through; shots and
sight cross between layers through grates.
- *The Orbital Retirement Home* — **Decks**, drifted between in zero-g.
- *The Overgrown Choir* — **Canopy and Roots**.
- *The Museum After Close* — **Mezzanines**.
- *The Merger* — **The Atrium**.
- *The Tidepool* — **Surface and Deep**.
- *The Endless Reception* — **The Balcony**.

#### M-23 · Ring — *Axiom*
Floors wrap at their edges. Walk off the east, arrive from the west. A long shot can hit
your own back.
- *The Orbital Retirement Home* — **The Habitat Ring**: the native home.
- *The Endless Reception* — **The Revolving Restaurant**.
- *The Weather Carnival* — **The Carousel**.
- *The Mycelial Commune* — **The Fairy Ring**.
- *The Glass Archive* — **The Round Reading Room**.

### D. Axioms — Flow of Time

#### M-24 · Tide Clock — *Axiom*
Every floor has a visible clock. At each threshold the floor escalates: water rises,
lights cut, doors lock, reinforcements arrive. Speed against thoroughness.
- *The Tidepool* — **The Tide**: the native home. Low tiles flood; you float or you drown.
- *The Merger* — **End of Quarter**: at zero, Compliance sweeps the floor.
- *The Endless Reception* — **Last Orders**: the bar closes, then the lights, then the doors.
- *The Night Shift* — **The Alarm**: when it rings, the floor collapses into waking.
- *The Orbital Retirement Home* — **Orbital Decay**: the floor tilts and everything slides.
- *The Weather Carnival* — **The Front Arrives**.
- *The Museum After Close* — **Dawn**: every exhibit must be back on its plinth.
- *The Last Buffet* — **Closing Time**.

#### M-25 · Rewind — *Axiom*
A few charges per floor to undo your last several turns. Some foes remember.
- *The Night Shift* — **"It Was Only a Dream"**.
- *The Glass Archive* — **Re-reading**.
- *The Ministry of Forms* — **The Appeals Process**: allowed, but it costs Patience.
- *The Court of Barbs* — **"I Take That Back."**
- *The Orbital Retirement Home* — **Mission Replay**.
- *The Weather Carnival* — **Another Go**: the barker lets you try again, once.

#### M-26 · Tempo — *Axiom*
Actions and creatures have speeds; a turn is no longer one step. Heavy actions take
longer; haste and slow become statuses.
- *The Merger* — **Caffeine**.
- *The Weather Carnival* — **Tailwind**.
- *The Tidepool* — **Current**.
- *The Orbital Retirement Home* — **Mornings**: slow at the start of a floor, quicker as you warm up.
- *The Night Shift* — **Running in Treacle**.
- *The Court of Barbs* — **Etiquette**: a bow costs a turn, and so does not bowing.

### E. Axioms — Self

#### M-27 · Party — *Axiom*
Two or three avatars; you control one at a time and the others follow. Each has its own
vitality; the heir is the whole party.
- *The Endless Reception* — **The Plus-Ones**.
- *The Merger* — **A Project Team**.
- *The Tidepool* — **The Shell Queue**: hermit crabs line up by size and swap shells.
- *The Court of Barbs* — **An Entourage**.
- *The Orbital Retirement Home* — **The Old Crew**.
- *The Lost & Found* — **A Matching Pair**: two socks that must stay next to each other.

#### M-28 · Swarm — *Axiom*
You are many small bodies; vitality is how many remain. Split to cover several tiles,
merge to grow strong.
- *The Mycelial Commune* — **Spores**.
- *The Overgrown Choir* — **Bees**.
- *The Tidepool* — **A Shoal of Fry**.
- *The Merger* — **The Temp Pool**.
- *The Weather Carnival* — **Raindrops** that pool into puddles.
- *The Lost & Found* — **A Jar of Marbles**.

#### M-29 · Possession — *Axiom*
When a foe is badly hurt you can move into it and play as it, with its stats and
abilities, until it dies. Your own body waits, defenceless.
- *The Night Shift* — **Dream-Hopping**.
- *The Merger* — **Lateral Transfer**.
- *The Museum After Close* — **Animating an Exhibit**.
- *The Mycelial Commune* — **Infection**.
- *The Glass Archive* — **Reading Someone**.
- *The Court of Barbs* — **Becoming the Favourite**: they act for you now.

### F. Axioms — Knowledge

#### M-30 · Mystery — *Axiom*
Restoratives and implements appear in per-world shuffled disguises until identified by
use or study. Some are bad.
- *The Merger* — **Unlabelled Mugs** in the shared fridge.
- *The Overgrown Choir* — **Unknown Seedlings**.
- *The Last Buffet* — **Unmarked Tupperware**.
- *The Lost & Found* — **Keys Without Tags**.
- *The Ministry of Forms* — **Forms in an Unknown Language**.
- *The Museum After Close* — **Uncatalogued Acquisitions**.
- *The Tidepool* — **Things in Bottles**.

#### M-31 · Unreliable Narrator — *Axiom*
Some log lines and Look cards lie, shown with a confidence. Seeing something twice, or
keeping Composure high, reveals the truth.
- *The Night Shift* — **Dream Logic**.
- *The Court of Barbs* — **Rumours**.
- *The Merger* — **Internal Comms**.
- *The Glass Archive* — **Faded Memory**.
- *The Endless Reception* — **Gossip**.
- *The Weather Carnival* — **Forecast Accuracy**: "70% chance this is true."

### G. Tactics

#### M-32 · Momentum — *Drafted*
Heavy hits knock foes back; collisions with walls and bodies hurt; push foes into hazards.
- *The Weather Carnival* — **Gusts**.
- *The Orbital Retirement Home* — **Zero-G Collisions**.
- *The Court of Barbs* — **Dismissal**: "Leave us."
- *The Merger* — **Reassignment**: shove them into another cubicle.
- *The Tidepool* — **Surge**.
- *The Endless Reception* — **The Conga Line**.

#### M-33 · Afflictions — *Drafted*
Statuses: damage over time, stun, confusion, charm, fear, slow. Foes resist by type.
- *The Merger* — **Burnout** (over time), **Micromanaged** (slow), **CC'd** (half your moves go astray), **Out of Office** (stun).
- *The Court of Barbs* — **Flustered**, **Smitten**, **Scandalised**.
- *The Overgrown Choir* — **Pollen-Drunk**, **Thorned**.
- *The Last Buffet* — **Food Coma**, **Heartburn**.
- *The Night Shift* — **Déjà Vu** (repeat your last action), **Sleep Paralysis**.
- *The Orbital Retirement Home* — **Vertigo**, **Nostalgia** (stand still, remembering).
- *The Tidepool* — **Sunburn**, **Tangled**.
- *The Glass Archive* — **Misremembering**.

#### M-34 · Morale — *Drafted*
Foes have morale. Wounds, a fallen leader and Afflictions break it; broken foes flee and
can be spared (experience for routing them).
- *The Merger* — **They Hand In Their Notice**.
- *The Court of Barbs* — **They Storm Out**.
- *The Tidepool* — **It Scuttles Off**.
- *The Endless Reception* — **They Leave Early**.
- *The Museum After Close* — **It Returns to Its Plinth**.
- *The Weather Carnival* — **It Blows Over**.

#### M-35 · Noise — *Drafted*
Actions make noise with a radius; foes investigate it. Moving quietly is an option. Pairs
with Darkness and Evasion.
- *The Merger* — **Reply-All**.
- *The Museum After Close* — **The Alarm System**.
- *The Night Shift* — **The Dreamer Stirs**.
- *The Court of Barbs* — **Whispers Carry**.
- *The Orbital Retirement Home* — **Clanging Pipes**.
- *The Glass Archive* — **The Library Hush**: noise costs you Clarity.

#### M-36 · Traps — *Drafted*
Hidden and visible tile traps that you can disarm, avoid or trigger on purpose. Foes
trigger them too.
- *The Merger* — **Wet-Floor Signs** (slide three tiles), **Printer Jams** (stuck).
- *The Overgrown Choir* — **Snapping Flytraps**.
- *The Lost & Found* — **Rakes**, tines up.
- *The Ministry of Forms* — **Red Tape** (rooted in place).
- *The Museum After Close* — **Laser Grids**.
- *The Last Buffet* — **Spilled Gravy**.
- *The Tidepool* — **Anemone Beds**.

#### M-37 · Allies — *Drafted*
Befriend instead of kill: feed, flatter, free from a trap. Allies follow and fight, and
can turn on you.
- *The Merger* — **Make a Work Friend**.
- *The Court of Barbs* — **Win a Patron**.
- *The Tidepool* — **Cleaner Shrimp**.
- *The Last Buffet* — **Feed Them**.
- *The Lost & Found* — **Return the Lost Dog**: it remembers.
- *The Overgrown Choir* — **Pollinators**.

### H. World systems

#### M-38 · Light — *Drafted*
Carried light with fuel; its radius replaces Darkness's sight. Drop lights as markers.
Some foes are drawn to light, some repelled.
- *The Merger* — **Phone Torch** (battery).
- *The Overgrown Choir* — **Fireflies in a Jar** (they escape).
- *The Tidepool* — **Glowing Plankton**.
- *The Museum After Close* — **The Guard's Torch**, stolen.
- *The Night Shift* — **Night-Lights**.
- *The Orbital Retirement Home* — **Emergency Strips**.
- *The Glass Archive* — **Reading Lamps**.

#### M-39 · Thresholds — *Drafted*
Doors and keys: locked areas behind tiered permissions, holding better things or
shortcuts.
- *The Merger* — **Keycard Clearance**.
- *The Ministry of Forms* — **Signatures and Stamps**.
- *The Court of Barbs* — **Invitations**.
- *The Overgrown Choir* — **Thorn Gates**, opened by grafting.
- *The Endless Reception* — **The Seating Plan**.
- *The Orbital Retirement Home* — **Airlocks** (with cycle time).
- *The Museum After Close* — **Staff Only**.

#### M-40 · Chemistry — *Drafted*
Extends Elements into reacting terrain: fire spreads to things that burn, water puts it
out and conducts, ice is slippery, gas ignites.
- *The Last Buffet* — **Grease Fires and Spills**.
- *The Weather Carnival* — **Rain Meets Lightning**.
- *The Merger* — **Coffee on the Server Racks**.
- *The Overgrown Choir* — **Sap Burns, Dew Spreads**.
- *The Tidepool* — **Salt Crust and Fresh Runoff**.
- *The Mycelial Commune* — **Fermentation**.

#### M-41 · Secrets — *Drafted*
Hidden rooms and passages, found by searching or by noticing cracks in Look mode.
- *The Merger* — **The Meeting Room Nobody Books**.
- *The Lost & Found* — **Down the Back of the Sofa**.
- *The Museum After Close* — **Behind the Painting**.
- *The Glass Archive* — **The Marginalia**.
- *The Court of Barbs* — **The Servants' Passages**.
- *The Overgrown Choir* — **Under the Altar Roots**.

### I. Society and economy

#### M-42 · Commerce — *Drafted* (priority: currency has no use today)
Merchants on each floor, priced by depth and by the world's rules (food costs more under
Hunger). Selling, buying, and paying a shrine to re-roll its offers.
- *The Merger* — **The Vending Machine**, which judges you.
- *The Court of Barbs* — **The Favour Market**.
- *The Overgrown Choir* — **The Seed Exchange**.
- *The Tidepool* — **A Hermit Crab With a Better Shell**.
- *The Lost & Found* — **The Claim Desk**: pay to reclaim.
- *The Orbital Retirement Home* — **The Commissary**.
- *The Last Buffet* — **The Till**.
- *The Ministry of Forms* — **The Fee Window**.

#### M-43 · Factions — *Drafted*
Foes belong to factions, and your actions shift your standing. High standing makes a
faction neutral or friendly; low makes it hunt you. Some shrines require standing.
- *The Merger* — **Departments**: Legal against Marketing.
- *The Court of Barbs* — **The Great Houses**.
- *The Mycelial Commune* — **Guilds of Decomposers**.
- *The Endless Reception* — **Whose Side Are You On**.
- *The Museum After Close* — **The Wings**: Natural History against Modern Art.
- *The Tidepool* — **Neighbouring Pools**.

#### M-44 · Bargains — *Drafted*
Speak before fighting: offer items, currency or information to pass or to recruit. Some
foes make demands; refusing angers them.
- *The Ministry of Forms* — **Fees** (not bribes; there's a form).
- *The Court of Barbs* — **Arrangements**.
- *The Merger* — **Negotiation**.
- *The Lost & Found* — **Trades**.
- *The Night Shift* — **Bargaining With the Recurring One**.
- *The Last Buffet* — **Splitting the Bill**.

#### M-45 · Crafting — *Drafted*
Combine two items into a third, by per-world recipes discovered through trying. Look
mode hints at partial recipes.
- *The Overgrown Choir* — **Grafting**.
- *The Last Buffet* — **Recipes**.
- *The Lost & Found* — **Tape**.
- *The Merger* — **Repurposing**.
- *The Mycelial Commune* — **Composting**.
- *The Orbital Retirement Home* — **Bodging**.

#### M-46 · Debt — *Drafted*
Borrow now, pay with interest each floor. Overdue debts send collectors, and unpaid debt
passes to your heirs.
- *The Merger* — **Payday Advance**.
- *The Ministry of Forms* — **Deferred Fees**.
- *The Court of Barbs* — **Owed Favours**.
- *The Lost & Found* — **Overdue Items**.
- *The Orbital Retirement Home* — **Pension Advance**.
- *The Endless Reception* — **The Tab**.

### J. Body and mind

#### M-47 · Composure — *Drafted*
A second meter, drained by horrors, insults and darkness. Low Composure brings imagined
foes and Unreliable messages; rest and certain items restore it.
- *The Merger* — **Stress**.
- *The Night Shift* — **Lucidity**.
- *The Court of Barbs* — **Nerve**.
- *The Orbital Retirement Home* — **Cabin Fever**.
- *The Glass Archive* — **Self**.
- *The Museum After Close* — **Calm**.

#### M-48 · Mutation — *Drafted*
On levelling (or eating strange things) gain random traits, good and bad, for the run.
- *The Mycelial Commune* — **Sporulation**.
- *The Overgrown Choir* — **Grafts**.
- *The Tidepool* — **Molts**.
- *The Merger* — **Role Creep**: your job title grows, and so do your responsibilities.
- *The Night Shift* — **Dream Body**: an extra finger, a door in your chest.
- *The Glass Archive* — **Borrowed Memories**: other people's skills.

#### M-49 · Fatigue — *Drafted*
Stamina for actions. Resting restores it but lets time pass (dangerous with a Tide Clock).
- *The Merger* — **Overtime**.
- *The Endless Reception* — **Sore Feet**.
- *The Orbital Retirement Home* — **Naps**.
- *The Night Shift* — **Inverted**: resting wakes you; you must keep moving to stay asleep.
- *The Tidepool* — **Gill Strain**.
- *The Weather Carnival* — **Dizzy From the Rides**.

#### M-50 · Encumbrance — *Drafted*
Everything carried has weight, not only what you've equipped. Overloaded, you slow.
- *The Lost & Found* — **Too Many Things**.
- *The Merger* — **Binders**.
- *The Tidepool* — **Shell Hoarding**.
- *The Last Buffet* — **Doggy Bags**.
- *The Ministry of Forms* — **Files**.

### K. Rules about rules

#### M-51 · Amendments — *Drafted* (rare)
A shrine that edits an active rule: pick one of three changes ("Hunger drains a quarter
slower, but food is rarer"). The edit lasts for the world. Can overturn a schism, at a
steep price.
- *The Ministry of Forms* — **Bylaws**.
- *The Court of Barbs* — **Royal Decrees**.
- *The Merger* — **Policy Update** (please read and acknowledge).
- *The Overgrown Choir* — **Re-grafting the Rule-Tree**.
- *The Mycelial Commune* — **A Quorum Vote**: the commune decides; you only nudge.
- *The Glass Archive* — **Revisions**.

#### M-52 · Edicts — *Drafted*
Each floor has a local law, shown on arrival: "No running" (every third step costs
extra), "Double foes, double drops", "No healing". Breaking it summons enforcers.
- *The Merger* — **Memo of the Day**.
- *The Court of Barbs* — **The Monarch's Whim**.
- *The Endless Reception* — **The Announcement From the Stage**.
- *The Weather Carnival* — **Today's Forecast**.
- *The Museum After Close* — **Gallery Rules**: "No touching the exhibits."
- *The Ministry of Forms* — **Notice on the Door**.
- *The Tidepool* — **The Moon's Phase**.

#### M-53 · Vows — *Drafted*
At a shrine, take a vow (no restoratives this floor, never retreat, carry no currency).
Keep it for some floors and earn a large boon; break it and earn a curse.
- *The Overgrown Choir* — **Vows of the Order**.
- *The Court of Barbs* — **Oaths**.
- *The Merger* — **KPIs**.
- *The Mycelial Commune* — **Pacts With the Network**.
- *The Endless Reception* — **Promises Made in a Toast**.
- *The Night Shift* — **Promises You Made Yourself at 3 a.m.**

#### M-54 · Inversion — *Drafted* (late)
A rule flips its sign, for a floor or for the world. Light things become slow; you must
stay hungry; light blinds.
- *The Night Shift* — **Upside-Down Dreams**.
- *The Orbital Retirement Home* — **Gravity Flips**.
- *The Court of Barbs* — **The Feast of Fools**.
- *The Weather Carnival* — **The Mirror Maze**.
- *The Glass Archive* — **Reading Backwards**.

### L. Structure

#### M-55 · The Heart — *Imposed* (an ending)
Each world has a Heart at a rolled depth (10–20). Reaching it ends the world's Age with
a victory, records the winner, and writes an epilogue. Later heirs can begin a new Age:
some rules reset, the chronicle stays.
- *The Merger* — **The Corner Office**.
- *The Overgrown Choir* — **The First Seed**.
- *The Court of Barbs* — **The Empty Throne**.
- *The Tidepool* — **The Open Sea**.
- *The Ministry of Forms* — **The Final Stamp**.
- *The Night Shift* — **Waking Up**.
- *The Orbital Retirement Home* — **Re-entry**.
- *The Endless Reception* — **The Last Dance**.
- *The Museum After Close* — **Opening Time**.
- *The Lost & Found* — **Being Found**.

#### M-56 · Wardens — *Imposed*
At milestone depths a unique foe guards the stairs, with a mechanic of its own.
Beating one offers a choice of two Amendments.
- *The Merger* — **The Regional Director**: schedules meetings that summon staff.
- *The Overgrown Choir* — **The Head Gardener**: prunes the room around you, wall by wall.
- *The Court of Barbs* — **The Jester Royal**: repeats your last attack back at you.
- *The Tidepool* — **The Octopus**: eight reaches, and ink that brings Darkness.
- *The Ministry of Forms* — **The Undersecretary**: can't be harmed without the correct form.
- *The Endless Reception* — **The Mother of the Bride**: every relative obeys her.
- *The Glass Archive* — **The Forgetting**: erases your explored map.

#### M-57 · Errands — *Drafted*
Each floor offers an optional objective, rewarded with currency, an item, or a hint about
the world's genome.
- *The Merger* — **Tickets**: "Fix the printer on Sublevel 4."
- *The Endless Reception* — **Deliver the Toast to Table 9**.
- *The Ministry of Forms* — **Collect Three Signatures**.
- *The Tidepool* — **Find a Bigger Shell**.
- *The Lost & Found* — **Reunite a Pair**.
- *The Museum After Close* — **Return the Escaped Exhibit**.

### M. Remembrance (low priority)

#### M-58 · Graves — *Drafted* (today: always on)
Fallen heirs leave remains where they died, holding their best item. Becomes a rule a
world discovers, instead of a given.
- *The Merger* — **Exit-Interview Folders**.
- *The Overgrown Choir* — **Compost Mounds** with name stakes.
- *The Tidepool* — **Empty Shells**.
- *The Court of Barbs* — **Portraits Turned to the Wall**.
- *The Museum After Close* — **Memorial Plaques**.
- *The Lost & Found* — **Unclaimed Bins**.
- *The Orbital Retirement Home* — **Framed Mission Patches**.

#### M-59 · Ghosts — *Drafted*
Fallen heirs return as foes (or allies, with Allies) with their gear and habits. Beating
one returns its item.
- *The Merger* — **The Alumni Network**: they want you to join their new venture.
- *The Night Shift* — **Recurring Characters**.
- *The Museum After Close* — **Wax Likenesses**.
- *The Overgrown Choir* — **Saplings With Your Face**.
- *The Orbital Retirement Home* — **Voice Logs That Walk**.
- *The Glass Archive* — **Echoes on the Shelves**.

#### M-60 · Lineage — *Drafted*
Each heir inherits one trait, mutation or vow from the one before, shown as a family tree.
- *The Court of Barbs* — **Bloodlines**.
- *The Mycelial Commune* — **Clonal Descent**.
- *The Merger* — **Referrals**.
- *The Tidepool* — **The Brood**.
- *The Endless Reception* — **The Family Tree**, on an easel by the door.

---

## 4. Premise atlas

Fourteen premises plus *The Old Stone*. Each entry gives the pitch, tone, palette, which
axioms it leans toward, its key role bindings, and a line of the log.

### The Merger
*The sub-basements of a conglomerate halfway through digesting a rival. The building is
absorbing itself, one department at a time.*
- **Tone:** deadpan corporate absurdism. **Palette:** carpet-tile grey, fluorescent
  white, sticky-note yellow. **Leans toward:** Discourse, Drift, Tide Clock, Factions, Debt.
- **Avatar:** a temp ("Associate"). **Vitality:** Job Security. **Depth:** Sublevel.
  **Death:** terminated.
- **Foes:** Interns → Middle Managers → Compliance Officers → The Synergy Committee
  (always three, moving as one).
- **Restorative:** cold brew. **Sustenance:** vending-machine snacks (Morale).
  **Currency:** PTO hours. **Hazards:** server-room heat / break-room freezer.
- **Shrine:** the Suggestion Box. **Stairs:** freight elevator / fire stairs.
- **Log:** "The Middle Manager schedules a follow-up with you. −3 Job Security."

### The Overgrown Choir
*A cathedral swallowed by a garden that learned to sing. The hymns are how it pollinates.*
- **Tone:** lush, sacred, quietly menacing. **Palette:** moss, stained-glass amber, bone.
  **Leans toward:** Arcanum (Hymnody), Caverns, Strata, Crafting (Grafting).
- **Avatar:** a gardener's apprentice. **Vitality:** Sap. **Depth:** Nave. **Death:**
  returned to the soil.
- **Foes:** Aphid Hounds → Thorn Choristers → Pollen Wraiths → The Head Gardener.
- **Restorative:** bruise-moss. **Sustenance:** rainwater (Thirst). **Currency:** seeds.
  **Hazards:** fever pollen / dew-frost.
- **Shrine:** a grafting altar. **Stairs:** a root-well / a bell-rope.
- **Log:** "The Thorn Chorister holds a note until your ears bleed sap. −2 Sap."

### The Court of Barbs
*A royal court where all violence is verbal, and the verbal is lethal.*
- **Tone:** arch, glittering, cruel. **Palette:** brocade crimson, gilt, powder blue.
  **Leans toward:** Discourse (strongly), Factions, Bargains, Morale.
- **Avatar:** an upstart guest. **Vitality:** Dignity. **Depth:** Salon. **Death:**
  laughed out of court.
- **Foes:** Pages → Sonneteers → Dowagers → The Jester Royal.
- **Implements (as barbs):** a remark about their shoes; an extended metaphor (heavy).
  **Wards:** a lace fan; an impenetrable smile.
- **Restorative:** a sealed compliment. **Sustenance:** gossip (Relevance).
  **Currency:** favours. **Hazards:** Scandal / The Cold Shoulder.
- **Shrine:** the Monarch's Ear, a brass speaking-tube. **Stairs:** the grand staircase /
  the servants' stairs.
- **Log:** "You compare the Dowager's hat to a collapsed soufflé. She is Flustered."

### The Last Buffet
*An all-you-can-eat restaurant at the end of time, where the dishes eat back.*
- **Tone:** warm, greasy, cosmic. **Palette:** ketchup red, mustard, chrome. **Leans
  toward:** Volley (Food Fight), Caverns (The Spill), Chemistry, Tide Clock.
- **Avatar:** a diner who can't pay. **Vitality:** Gut. **Depth:** Course. **Death:**
  eighty-sixed.
- **Foes:** Crumb Mites → Sentient Leftovers → Line Cooks → The Maître d'.
- **Restorative:** a sachet of unexplained relish. **Sustenance:** Fullness (inverted:
  eating slows you). **Currency:** tip-jar coins. **Hazards:** the grill / the walk-in.
- **Shrine:** the Specials Board. **Stairs:** the dumbwaiter / the service hatch.
- **Log:** "The Sentient Leftovers congeal around your ankle."

### The Lost & Found
*The warehouse where everything anyone ever lost ends up. You were lost too, and it
would rather you stayed.*
- **Tone:** wistful, domestic, surreal. **Palette:** cardboard, faded denim, lost-property
  tag orange. **Leans toward:** Evasion (Stay Lost), Encumbrance, Mystery, Drift.
- **Avatar:** something someone misplaced. **Vitality:** Hope (of being found).
  **Depth:** Aisle. **Death:** never found.
- **Foes:** Odd Socks → Umbrellas With Grudges → Lost Dogs (often friendly) → The
  Forgotten Birthday.
- **Restorative:** a photograph someone dropped. **Sustenance:** hand-warmers (Warmth).
  **Currency:** buttons. **Hazards:** the radiator / the draught.
- **Shrine:** the Claim Desk and its little bell. **Stairs:** a chute / the up escalator.
- **Log:** "An Umbrella With a Grudge opens itself in your face."

### The Night Shift
*The department that manufactures nightmares is badly understaffed, and you've just
been hired.*
- **Tone:** eerie, drowsy, bureaucratic horror. **Palette:** bruise purple, nightlight
  amber, static grey. **Leans toward:** Evasion, Rewind, Unreliable Narrator, Possession.
- **Avatar:** a new hire on the dream line. **Vitality:** Sleep. **Depth:** Stage.
  **Death:** never woke.
- **Foes:** Late-for-the-Exam → Loose Teeth → The Crowd of Strangers → The Recurring One.
- **Restorative:** warm milk. **Sustenance:** coffee (Wakefulness). **Currency:**
  counted sheep. **Hazards:** fever dream / numbness.
- **Shrine:** the Dream Journal. **Stairs:** falling / the jolt of waking.
- **Log:** "Loose Teeth rattle toward you. Your own feel loose in sympathy."

### The Tidepool
*You are a hermit crab. A rock pool is a continent, and the tide is a clock.*
- **Tone:** earnest, wondrous, a little brutal. **Palette:** wet slate, anemone pink, kelp
  green. **Leans toward:** Tide Clock (strongly), Weight (shells), Swarm, Volley (water jets).
- **Avatar:** a hermit crab. **Vitality:** Shell. **Depth:** Pool. **Death:** washed out.
- **Foes:** Periwinkles → Shore Crabs → The Gull (strikes from above) → The Octopus.
- **Wards:** shells, with real weight and size; a bigger one is safer and slower.
- **Restorative:** kelp. **Sustenance:** tidewater (Moisture). **Currency:** sea-glass.
  **Hazards:** sun-baked rock / cold upwelling.
- **Shrine:** the Anemone Oracle. **Stairs:** the drop-off / the rising tide.
- **Log:** "The Gull's shadow crosses your pool. You pull in your legs."

### The Ministry of Forms
*A bureaucratic afterlife. Before you can rest, your death must be certified, in
triplicate.*
- **Tone:** Kafkaesque cheer. **Palette:** manila, carbon blue, rubber-stamp red.
  **Leans toward:** Arcanum (Forms), Thresholds, Edicts, Amendments, Bargains.
- **Avatar:** an applicant (deceased). **Vitality:** Patience. **Depth:** Office.
  **Death:** filed under Pending.
- **Foes:** Clerks → Notaries → Auditors → The Undersecretary.
- **Restorative:** a numbered ticket ("You're next!"). **Sustenance:** break-room
  biscuits (Energy). **Currency:** receipts. **Hazards:** URGENT / ON HOLD.
- **Shrine:** the Amendments Window. **Stairs:** "Please proceed to the lower office" /
  "Return to the previous window".
- **Log:** "The Auditor finds an irregularity in your paperwork. −4 Patience."

### The Mycelial Commune
*An underground fungal democracy. Every decision is put to a vote, and the vote takes
weeks.*
- **Tone:** dreamy, collectivist, slow-burning. **Palette:** loam, spore white, bioluminescent
  teal. **Leans toward:** Swarm, Retinue, Caverns, Mutation, Amendments (quorum).
- **Avatar:** a spore delegate. **Vitality:** Biomass. **Depth:** Horizon. **Death:**
  decomposed, gratefully.
- **Foes:** Springtails → Rival Moulds → The Slime-Mould Council → The Rot.
- **Restorative:** a sugar-rich windfall. **Sustenance:** rot (Nutrients). **Currency:**
  sugars. **Hazards:** fermentation heat / frost-crust.
- **Shrine:** a mushroom ring (a quorum). **Stairs:** a rhizomorph down / a fruiting
  body up.
- **Log:** "The Slime-Mould Council moves to table your proposal. Indefinitely."

### The Weather Carnival
*A travelling fair run by storms. Every ride is a weather system, and none of them are
safe.*
- **Tone:** loud, bright, unstable. **Palette:** striped-tent red and white, storm
  green, flash yellow. **Leans toward:** Gambit, Momentum, Chemistry, Drift, Ring.
- **Avatar:** a visitor without a ticket. **Vitality:** Nerve. **Depth:** Midway.
  **Death:** blown away.
- **Foes:** Drizzle Sprites → Gust Barkers → Hail Clowns → The Front.
- **Restorative:** a cloud of candyfloss. **Sustenance:** toffee apples (Sugar).
  **Currency:** ride tickets. **Hazards:** lightning puddles / hailfields.
- **Shrine:** the fortune-teller's booth. **Stairs:** the drop tower / the big wheel.
- **Log:** "The Gust Barker calls out your weight. It's wrong, and you're furious."

### The Museum After Close
*The exhibits wake at night and hold strong opinions about provenance.*
- **Tone:** hushed, uncanny, playful. **Palette:** gallery white, velvet-rope burgundy,
  brass. **Leans toward:** Evasion, Noise, Thresholds, Possession, Tide Clock (Dawn).
- **Avatar:** a visitor locked in. **Vitality:** Calm. **Depth:** Gallery. **Death:**
  acquired.
- **Foes:** Audio Guides → Taxidermy → Diorama Soldiers → The Night Curator.
- **Restorative:** gift-shop fudge. **Sustenance:** placards (Attention). **Currency:**
  admission stubs. **Hazards:** laser grids / the climate-controlled vault.
- **Shrine:** the donations box. **Stairs:** the freight lift / the grand stair.
- **Log:** "The Audio Guide begins its forty-minute introduction. You cannot leave."

### The Orbital Retirement Home
*Elderly cosmonauts on a decaying station. Bingo is the only law.*
- **Tone:** gentle, funny, melancholy. **Palette:** hull grey, hospital mint, mission-patch
  orange. **Leans toward:** Volley (recoil), Ring, Strata, Momentum, Party.
- **Avatar:** a resident, aged 91. **Vitality:** Vitals. **Depth:** Deck. **Death:**
  decommissioned.
- **Foes:** Cleaning Drones → The Bingo Caller → Med-Bots → The Administrator.
- **Restorative:** one day from a weekly pill organiser. **Sustenance:** canisters
  (Oxygen). **Currency:** bingo chips. **Hazards:** the reactor vent / the cold side of
  the hull.
- **Shrine:** the Bingo Wheel. **Stairs:** the airlock down / the lift up.
- **Log:** "You throw your dentures. The recoil carries you gently into a wall."

### The Endless Reception
*A wedding reception that has lasted three hundred years. Nobody may leave until the
speeches are over, and the speeches are never over.*
- **Tone:** festive dread. **Palette:** ivory, champagne, wilting-carnation pink.
  **Leans toward:** Discourse (Toasts), Party, Factions, Tide Clock (Last Orders).
- **Avatar:** a plus-one nobody invited. **Vitality:** Poise. **Depth:** Hour.
  **Death:** left early.
- **Foes:** Cousins → The Aunt With Opinions → The Best Man's Speech (a foe that *is* a
  speech) → The Mother of the Bride.
- **Restorative:** a sip of something from the bar. **Sustenance:** canapés (Stamina).
  **Currency:** party favours. **Hazards:** the dance floor / the cold buffet.
- **Shrine:** the guest book. **Stairs:** down to the after-party / up to the coat check.
- **Log:** "The Aunt With Opinions asks when you're settling down. −3 Poise."

### The Glass Archive
*A library where memories are shelved as glass. Reading one changes it.*
- **Tone:** melancholic, quiet, beautiful. **Palette:** frosted glass, ink black,
  lamplight gold. **Leans toward:** Arcanum (Recollection), Unreliable Narrator, Rewind,
  Noise (the hush).
- **Avatar:** an archivist who has forgotten their own name. **Vitality:** Clarity.
  **Depth:** Stack. **Death:** forgotten.
- **Foes:** Redactions → Dust Readers → Misfiled Memories → The Forgetting.
- **Restorative:** a vial of a remembered smell. **Sustenance:** tea (Focus).
  **Currency:** overdue slips. **Hazards:** kiln-hot glass / frosted panes.
- **Shrine:** the Card Catalogue. **Stairs:** down the reading well / up the library ladder.
- **Log:** "A Redaction passes over you. For a moment you can't recall which floor this is."

### The Old Stone (legacy)
*Rats, bats, goblins, potions, swords. The skin the mechanics were built in.* Kept as a
rare roll and as the migration target for worlds created before premises existed.

---

## 5. Example worlds

How the structure combines into worlds that play nothing alike.

**The Court of Barbs · Discourse · Drift · Composure.** You never touch anyone. The
East Wing rearranges itself every forty turns, so the shortcut you found is gone. Your
best barb is a heavy extended metaphor that takes two turns to deliver, and after three
uses it's stale. When your Nerve runs low, you start hearing whispers that aren't there.

**The Tidepool · Volley · Tide Clock · Swarm.** You are a shoal of fry. Your water jets
spend the same Moisture that keeps you alive. Every floor, the tide rises; stay too
long collecting sea-glass and the low pools flood. Losing fry shrinks you; splitting
the shoal lets you hold two corridors at once.

**The Merger, with an Overgrown intrusion · Evasion · Noise · Debt.** The lobby ficus has
gone feral, and its leaves heal. You can't harm anyone: a Middle Manager who spots you
drags you into a meeting. Reply-alls echo down the corridor. You took a payday advance
on Sublevel 2, and the collectors are getting closer.

**The Orbital Retirement Home · Volley · Ring · Party.** Three residents share one
walking frame between them. Every thrown denture pushes the thrower backwards, and on a
ring station a missed throw can come around and hit you from behind.

---

## 6. Guardrails

**Originality.**
- No stock fantasy bestiary names (goblin, orc, kobold, troll…) outside *The Old Stone*.
- No classic-roguelike item conventions: no "potion of", "scroll of", "wand of",
  amulets as the goal, or familiar dungeon place names.
- Dungeon Crawler Carl is the benchmark for invention, not a source. Nothing borrowed:
  no broadcast or audience framing, no sponsors, no achievement or loot-box rewards, no
  narrating system intelligence, and none of its characters, places or creatures.
- No real brands, companies or people, even in parody.

**Tone.** At least a third of premises are not comedic (*The Glass Archive*, *The Night
Shift*, *The Tidepool*). Jokes come from situation, not references.

**Readability.** Themed names never hide function: the mechanical gloss is always one
look away, and Plain labels is always available. Glyphs stay tied to roles. Two
things on one floor never share a name or glyph.

**Balance.** Tilts are bounded (±20%) and probe-checked. Every new axiom ships with a bot
policy and must land within about 1.5 floors of the default's median depth.

---

## 7. Open questions

- **How often should schisms be rolled versus drafted?** Rolling makes worlds feel
  authored; drafting makes them feel chosen.
- **Can an heir ever escape a schism?** Amendments allow it at a price. Is that enough,
  or should a world's Age ending (The Heart) reopen closed branches?
- **Intrusions per world:** is 0–2 the right amount of gonzo?
- **Should premises themselves be discoverable** (the world's premise revealed gradually,
  starting from a neutral look), or obvious from the first room?
- **Old worlds:** do pre-premise worlds stay *The Old Stone* forever, or get offered a
  one-time reskin?
