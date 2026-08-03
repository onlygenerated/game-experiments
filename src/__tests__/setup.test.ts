import { describe, expect, it } from 'vitest';
import { CONFIG, type Config } from '../config';
import { RULESETS } from '../rulesets';
import {
  GROUPS,
  getPath,
  matchingPreset,
  normalise,
  sameConfig,
  setPath,
  visibleFields,
} from '../setup';

describe('setPath', () => {
  it('sets a nested value without mutating the original', () => {
    const next = setPath(CONFIG, 'cribbage.flushMin', 3);
    expect(next.cribbage.flushMin).toBe(3);
    expect(CONFIG.cribbage.flushMin).toBe(4);
    expect(next).not.toBe(CONFIG);
  });

  it('leaves untouched branches shared rather than rebuilt', () => {
    const next = setPath(CONFIG, 'gridSize', 5);
    expect(next.hands).toBe(CONFIG.hands);
  });

  it('reads back what it wrote, at any depth', () => {
    expect(getPath(setPath(CONFIG, 'mechanics.axisMode', 'suit'), 'mechanics.axisMode')).toBe(
      'suit',
    );
    expect(getPath(setPath(CONFIG, 'rankChips.7', 99), 'rankChips.7')).toBe(99);
  });
});

describe('normalise', () => {
  it('never lets a line cap exceed the board', () => {
    expect(normalise({ ...CONFIG, gridSize: 4, lineCap: 9 }).lineCap).toBe(4);
  });

  it('never asks for more placements than the board has cells', () => {
    expect(normalise({ ...CONFIG, gridSize: 3, placementsPerRun: 40 }).placementsPerRun).toBe(9);
  });

  it('leaves placements alone on a hex board, which has its own bounds', () => {
    const hex: Config = { ...CONFIG, structure: 'hex', placementsPerRun: 40 };
    expect(normalise(hex).placementsPerRun).toBe(40);
  });

  it('never lets a discard take more cards than the hand holds', () => {
    const lean = normalise({ ...CONFIG, handSize: 2, maxDiscardSelection: 5 });
    expect(lean.maxDiscardSelection).toBe(2);
    expect(lean.minDiscardSelection).toBeLessThanOrEqual(lean.maxDiscardSelection);
  });

  it('resolves the two payout rules rather than leaving one silently outranked', () => {
    const both = normalise({
      ...CONFIG,
      mechanics: { ...CONFIG.mechanics, lockAndCash: true, payOnCompleteOnly: true },
    });
    // The engine checks lock-and-cash first, so the other would do nothing.
    expect(both.mechanics.payOnCompleteOnly).toBe(false);
  });

  it('is idempotent', () => {
    for (const rs of RULESETS) {
      const once = normalise(rs.config);
      expect(sameConfig(normalise(once), once)).toBe(true);
    }
  });
});

describe('the setup screen covers the whole shipped catalogue', () => {
  /**
   * The claim the setup screen makes is that no preset is anything more than a
   * point in this parameter space. If a preset could not be recognised from its
   * own config, that claim would be false and the long list would be load-
   * bearing after all.
   */
  it('recognises every preset from its own config', () => {
    for (const rs of RULESETS) {
      expect(matchingPreset(rs.config)?.id).toBe(rs.id);
    }
  });

  it('tells a hand-built config apart from the presets', () => {
    expect(matchingPreset({ ...CONFIG, targetScore: 12345 })).toBeUndefined();
  });

  it('exposes a control for every field that distinguishes one preset from another', () => {
    // Anything two presets disagree on has to be reachable from the form, or
    // the form cannot reproduce the catalogue. Hand and rank tables are edited
    // by their own panel rather than a Field, so they are named explicitly.
    const editable = new Set([
      ...GROUPS.flatMap((g) => g.fields.map((f) => f.path.split('.')[0])),
      'hands',
      'rankChips',
      'minDiscardSelection',
    ]);
    const differing = new Set<string>();
    for (const rs of RULESETS) {
      for (const key of Object.keys(CONFIG) as (keyof Config)[]) {
        if (!sameConfig(rs.config[key] as never, CONFIG[key] as never)) differing.add(key);
      }
    }
    for (const key of differing) expect([...editable]).toContain(key);
  });
});

describe('visibleFields', () => {
  const paths = (cfg: Config) =>
    GROUPS.flatMap((g) => visibleFields(g, cfg)).map((f) => f.path);

  it('hides grid-only settings on a hex board', () => {
    const hex = paths({ ...CONFIG, structure: 'hex' });
    for (const p of ['gridSize', 'lineCap', 'mechanics.axisMode', 'mechanics.lockAndCash']) {
      expect(hex).not.toContain(p);
    }
    expect(hex).toContain('hexRadius');
    expect(hex).toContain('hexRingBonus');
  });

  it('hides hex-only settings on a grid', () => {
    const grid = paths(CONFIG);
    for (const p of ['hexRadius', 'hexWindow', 'hexRingBonus']) expect(grid).not.toContain(p);
    expect(grid).toContain('lineCap');
  });

  it('shows each lens only its own numbers', () => {
    const poker = paths({ ...CONFIG, lensId: 'poker' });
    const crib = paths({ ...CONFIG, lensId: 'cribbage' });
    expect(poker).toContain('partialHands.enabled');
    expect(poker).not.toContain('cribbage.flushMin');
    expect(crib).toContain('cribbage.flushMin');
    expect(crib).not.toContain('partialHands.enabled');
  });

  it('hides the partial-hand rates until partial hands are switched on', () => {
    expect(paths(CONFIG)).not.toContain('partialHands.scaleByLength.3');
    const on = { ...CONFIG, partialHands: { ...CONFIG.partialHands, enabled: true } };
    expect(paths(on)).toContain('partialHands.scaleByLength.3');
  });

  it('hides deferred payout once lock-and-cash outranks it', () => {
    const cash = { ...CONFIG, mechanics: { ...CONFIG.mechanics, lockAndCash: true } };
    expect(paths(cash)).not.toContain('mechanics.payOnCompleteOnly');
    expect(paths(CONFIG)).toContain('mechanics.payOnCompleteOnly');
  });

  it('hides the discard size when there is no hand to discard from', () => {
    expect(paths({ ...CONFIG, handSize: 1 })).not.toContain('maxDiscardSelection');
  });
});
