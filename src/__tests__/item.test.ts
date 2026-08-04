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
});
