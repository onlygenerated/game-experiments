import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { applyItemEffects, itemLabel, type Item } from '../rooms/item';

describe('itemLabel', () => {
  it('returns a placeholder item\'s own label', () => {
    const item: Item = { kind: 'placeholder', label: 'Test Item' };
    expect(itemLabel(item)).toBe('Test Item');
  });
});

describe('applyItemEffects', () => {
  it('returns the same config, unchanged, with an empty inventory', () => {
    expect(applyItemEffects(CONFIG, [])).toBe(CONFIG);
  });

  it('is still the identity transform with one or more placeholder items', () => {
    const items: Item[] = [
      { kind: 'placeholder', label: 'A' },
      { kind: 'placeholder', label: 'B' },
    ];
    expect(applyItemEffects(CONFIG, items)).toBe(CONFIG);
  });

  it('a secondCounter item sets secondLensId to a lens the primary counter is not already using', () => {
    const cfg = { ...CONFIG, lensId: 'cribbage', secondLensId: '' };
    const items: Item[] = [{ kind: 'secondCounter', lensId: 'poker' }];
    const next = applyItemEffects(cfg, items);
    expect(next.secondLensId).toBe('poker');
    expect(next.lensId).toBe('cribbage');
  });

  it('is the identity transform when the granted counter is already the primary one', () => {
    const cfg = { ...CONFIG, lensId: 'cribbage', secondLensId: '' };
    const items: Item[] = [{ kind: 'secondCounter', lensId: 'cribbage' }];
    expect(applyItemEffects(cfg, items)).toBe(cfg);
  });

  it('a no-op secondCounter item does not clear an earlier one — Config only has room for one second lens', () => {
    const cfg = { ...CONFIG, lensId: 'cribbage', secondLensId: '' };
    // Grant poker, then a (redundant) cribbage item — cribbage is already the
    // primary, so that second item is a no-op rather than wiping the first.
    const items: Item[] = [
      { kind: 'secondCounter', lensId: 'poker' },
      { kind: 'secondCounter', lensId: 'cribbage' },
    ];
    expect(applyItemEffects(cfg, items).secondLensId).toBe('poker');
  });

  it('mixes harmlessly with placeholder items in either order', () => {
    const cfg = { ...CONFIG, lensId: 'cribbage', secondLensId: '' };
    const items: Item[] = [
      { kind: 'placeholder', label: 'A' },
      { kind: 'secondCounter', lensId: 'poker' },
      { kind: 'placeholder', label: 'B' },
    ];
    expect(applyItemEffects(cfg, items).secondLensId).toBe('poker');
  });
});

describe('itemLabel (secondCounter)', () => {
  it("names the lens it grants, not the raw id", () => {
    expect(itemLabel({ kind: 'secondCounter', lensId: 'cribbage' })).toBe('Cribbage (2nd counter)');
    expect(itemLabel({ kind: 'secondCounter', lensId: 'poker' })).toBe('Poker (2nd counter)');
  });
});
