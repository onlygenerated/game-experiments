import { describe, expect, it } from 'vitest';
import { choices, DEFAULT_SETTINGS, restore, ruleStates, snapshotOf, startWorld, Tree, type Choice } from '../sim/driver.ts';
import type { Game } from '../engine/game.ts';

/** A fixed policy: draft the first offer, settle the first option, otherwise go to shrines, fight, collect, descend. */
function pick(g: Game): Choice {
  const cs = choices(g).filter((c) => !c.disabled);
  const by = (k: string, f: (c: Choice) => boolean = () => true) => cs.find((c) => c.intent.kind === k && f(c));
  return (
    by('draft', (c) => (c.intent as { rule: unknown }).rule !== null) ??
    by('axiom', (c) => (c.intent as { option: unknown }).option !== null) ??
    by('levelup') ?? by('leaveShop') ?? by('shrine') ?? by('schism') ?? by('clear') ?? by('items') ?? by('descend') ?? by('heir') ?? cs[0]
  );
}

function play(seed: number, steps: number) {
  let g = startWorld(seed, true);
  const tree = new Tree(g);
  for (let i = 0; i < steps; i++) g = tree.choose(pick(g).intent, true, DEFAULT_SETTINGS).game;
  return { g, tree };
}

describe('branch simulator', () => {
  it('is deterministic: the same choices from the same seed end in the same state', () => {
    const a = play(7, 25);
    const b = play(7, 25);
    // `created` is a wall-clock stamp; everything else must match.
    const strip = (g: Game) => snapshotOf(g).replace(/"created":\d+/, '');
    expect(strip(a.g)).toBe(strip(b.g));
  });

  it('a snapshot restores to the same game, RNG included', () => {
    const { g } = play(11, 12);
    const snap = snapshotOf(g);
    const r = restore(snap, true);
    expect(snapshotOf(r)).toBe(snap);
  });

  it('going back and choosing differently forks the tree; choosing the same again reuses the branch', () => {
    let g = startWorld(3, true);
    const tree = new Tree(g);
    g = tree.choose({ kind: 'shrine' }, true, DEFAULT_SETTINGS).game;
    expect(g.run.pending?.kind).toBe('shrine');
    const offers = g.run.floor.shrine!.offers!;
    expect(offers.length).toBeGreaterThan(1);
    const fork = tree.current;
    const first = tree.choose({ kind: 'draft', rule: offers[0] }, true, DEFAULT_SETTINGS);
    expect(first.game.world.rules).toContain(offers[0]);
    tree.goto(fork, true);
    const second = tree.choose({ kind: 'draft', rule: offers[1] }, true, DEFAULT_SETTINGS);
    expect(second.game.world.rules).toContain(offers[1]);
    expect(second.game.world.rules).not.toContain(offers[0]);
    expect(tree.node(fork).children).toHaveLength(2);
    tree.goto(fork, true);
    const again = tree.choose({ kind: 'draft', rule: offers[0] }, true, DEFAULT_SETTINGS);
    expect(again.reused).toBe(true);
    expect(again.node.id).toBe(first.node.id);
  });

  it('the shrine offers shown are what the engine offers, and the graph marks them', () => {
    let g = startWorld(42, true);
    const tree = new Tree(g);
    g = tree.choose({ kind: 'shrine' }, true, DEFAULT_SETTINGS).game;
    const shown = choices(g).flatMap((c) => (c.intent.kind === 'draft' && c.intent.rule ? [c.intent.rule] : []));
    expect(shown).toEqual(g.run.floor.shrine!.offers);
    const st = ruleStates(g);
    for (const r of shown) expect(st[r]).toBe('offered');
  });

  it('plays many worlds without getting stuck', () => {
    for (const seed of [1, 2, 5, 99, 1234]) {
      const { g, tree } = play(seed, 60);
      expect(tree.nodes.size).toBe(61);
      expect(g.run.depth).toBeGreaterThanOrEqual(1);
    }
  });
});
