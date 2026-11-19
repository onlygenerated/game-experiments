import { itemLabel, MONSTERS } from '../engine/content.ts';
import { idx, inBounds } from '../engine/dungeon.ts';
import type { Game } from '../engine/game.ts';
import { T_STAIRS, T_UP, T_WALL } from '../engine/types.ts';
import { alt, hiddenProps, RULES } from '../rules/rules.ts';
import { itemFacts } from './hud.ts';

export interface TileInfo {
  title: string;
  lines: string[];
  /** False when the player has never seen this tile. */
  known: boolean;
  /** Something the player could walk to. */
  walkable: boolean;
}

/**
 * What the player knows about one tile: who's there, what's lying there, what
 * the tile itself is. Only what the current rules let them perceive, and only
 * what they can see — remembered tiles show terrain, not creatures or loot.
 */
export function describeTile(game: Game, x: number, y: number): TileInfo {
  const run = game.run;
  const f = run.floor;
  if (!inBounds(f, x, y)) return { title: 'Nothing', lines: [], known: false, walkable: false };
  const i = idx(f, x, y);
  const dark = game.has('darkness');
  const visible = game.visible.has(i);
  if (dark && !visible && !f.explored[i]) {
    return { title: 'Unknown', lines: ['You haven’t seen this part of the floor.'], known: false, walkable: false };
  }
  const ctx = game.ctx;
  const p = run.player;
  const lines: string[] = [];
  const titles: string[] = [];
  if (dark && !visible) lines.push('Remembered — you can’t see it from here.');

  if (p.x === x && p.y === y) titles.push(`You (${p.name})`);

  const m = visible ? game.monsterAt(x, y) : undefined;
  if (m) {
    const name = game.monsterName(m);
    titles.push(name[0].toUpperCase() + name.slice(1));
    const parts = [`HP ${m.hp}/${m.maxHp}`];
    if (game.has('peril')) parts.push(`hits you for ${Math.max(1, m.atk - game.stats.defense)}`);
    if (m.def) parts.push(`armour ${m.def}`);
    lines.push(parts.join(' · '));
    const def = MONSTERS[m.kind];
    if (def.speed > 1) lines.push('Fast and erratic.');
    if (def.speed < 1) lines.push('Slow: acts every other turn.');
    if (m.stun > 0) lines.push('Stunned.');
    if (dark && !m.aware) lines.push(`It hasn’t noticed you: a sneak attack does ×${game.stats.sneak}.`);
    const w = p.weapon;
    if (m.element && w?.element && game.has('elements') && game.has('arms')) {
      lines.push(w.element === m.element ? `It resists your ${w.element} weapon (½ damage).` : `It’s weak to your ${w.element} weapon (×2 damage).`);
    }
  }

  const items = visible ? run.items.filter((fi) => fi.x === x && fi.y === y) : [];
  for (const fi of items) {
    const label = itemLabel(fi.item, ctx);
    if (!m) titles.push(label);
    const facts = itemFacts(fi.item, game);
    const hidden = hiddenProps(fi.item, ctx);
    const extra = hidden ? ` · ${hidden} ${hidden === 1 ? 'thing' : 'things'} you can’t perceive yet` : '';
    lines.push(`${label}${facts.length ? ` — ${facts.join(' · ')}` : ''}${extra}`);
  }

  const t = f.tiles[i];
  const sh = f.shrine;
  const grave = game.floorGraves().find((g) => g.x === x && g.y === y);
  const gl = f.glimmer[i];
  let terrain = t === T_WALL ? 'Wall' : 'Floor';
  if (t === T_STAIRS) {
    terrain = 'Stairs down';
    lines.push(`Leads to depth ${run.depth + 1}.`);
  }
  if (t === T_UP) {
    terrain = 'Stairs up';
    lines.push(`Leads back to depth ${run.depth - 1}, as you left it.`);
  }
  if (sh && sh.pos.x === x && sh.pos.y === y) {
    terrain = 'Rule Shrine';
    if (sh.dark) lines.push('Dark: you left this floor without answering it.');
    else if (sh.used) lines.push('Spent: it has already changed this world.');
    else if (sh.offers?.length) lines.push(`Offers: ${sh.offers.map((r) => RULES[r].name).join(', ')}. Step onto it to choose.`);
    else lines.push('Step onto it to see what it offers.');
  }
  if (grave) {
    terrain = `Grave of ${grave.name}`;
    lines.push(`Heir ${grave.gen}: ${grave.epitaph}.`);
    lines.push(grave.looted || !grave.item ? 'Nothing is left in it.' : 'Something is buried with them.');
  }
  if (gl) {
    if (game.has('elements')) {
      terrain = gl === 'ember' ? 'Ember stone' : 'Frost stone';
      lines.push(
        gl === 'ember'
          ? `Burns anyone who ends a turn on it for ${alt(ctx, 'elements') ? 4 : 2}.`
          : 'Freezes anyone who steps on it for a turn.',
      );
    } else {
      terrain = 'Glimmering stone';
      lines.push(`It’s faintly ${gl === 'ember' ? 'warm' : 'cold'}. It does nothing — yet.`);
    }
  }
  if (!titles.length || (titles.length === 1 && titles[0].startsWith('You'))) titles.push(terrain);
  else if (terrain !== 'Floor') lines.push(`Underfoot: ${terrain.toLowerCase()}.`);
  if (t === T_WALL) lines.push('Solid rock.');

  return { title: titles.join(' · '), lines, known: true, walkable: t !== T_WALL };
}
