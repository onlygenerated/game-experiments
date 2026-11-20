import { itemLabel, MONSTERS } from '../engine/content.ts';
import { idx, inBounds } from '../engine/dungeon.ts';
import type { Game } from '../engine/game.ts';
import { T_STAIRS, T_UP, T_WALL } from '../engine/types.ts';
import { alt, hiddenProps } from '../rules/rules.ts';
import { BALANCE } from '../engine/balance.ts';
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
  const L = game.lex;
  if (!inBounds(f, x, y)) return { title: L.t('look.nothing'), lines: [], known: false, walkable: false };
  const i = idx(f, x, y);
  const dark = game.has('darkness');
  const visible = game.visible.has(i);
  if (dark && !visible && !f.explored[i]) {
    return { title: L.t('look.unknown'), lines: [L.t('look.unseen')], known: false, walkable: false };
  }
  const ctx = game.ctx;
  const p = run.player;
  const lines: string[] = [];
  const titles: string[] = [];
  if (dark && !visible) lines.push(L.t('look.remembered'));

  if (p.x === x && p.y === y) titles.push(L.t('look.you', { name: p.name }));

  const m = visible ? game.monsterAt(x, y) : undefined;
  if (m) {
    const name = game.monsterName(m);
    titles.push(name[0].toUpperCase() + name.slice(1));
    const gloss = L.foeGloss(m.kind);
    if (gloss) lines.push(L.t('look.gloss', { what: gloss }));
    const parts = [L.t('look.foeHp', { n: m.hp, max: m.maxHp })];
    if (game.has('peril')) parts.push(L.t('look.foeHits', { n: Math.max(1, m.atk - game.stats.defense) }));
    if (m.def) parts.push(L.t('look.foeArmor', { n: m.def }));
    lines.push(parts.join(' · '));
    const def = MONSTERS[m.kind];
    if (def.speed > 1) lines.push(L.t('look.fast'));
    if (def.speed < 1) lines.push(L.t('look.slow'));
    if (m.stun > 0) lines.push(L.t('look.stunned'));
    if (dark && !m.aware) lines.push(L.t('look.unaware', { n: game.stats.sneak }));
    const w = p.weapon;
    if (m.element && w?.element && game.has('elements') && game.has('arms')) {
      lines.push(L.t(w.element === m.element ? 'look.resists' : 'look.weak', { el: L.element(w.element).adj }));
    }
  }

  const items = visible ? run.items.filter((fi) => fi.x === x && fi.y === y) : [];
  for (const fi of items) {
    const label = itemLabel(fi.item, ctx, L);
    if (!m) titles.push(label);
    const facts = itemFacts(fi.item, game);
    const hidden = hiddenProps(fi.item, ctx);
    const extra = hidden ? L.t(hidden === 1 ? 'look.hidden.one' : 'look.hidden.many', { n: hidden }) : '';
    const gloss = L.itemGloss(fi.item);
    lines.push(`${label}${gloss ? ` (${gloss})` : ''}${facts.length ? ` — ${facts.join(' · ')}` : ''}${extra}`);
  }

  const t = f.tiles[i];
  const sh = f.shrine;
  const grave = game.floorGraves().find((g) => g.x === x && g.y === y);
  const gl = f.glimmer[i];
  const floorWord = L.t('look.floor');
  let terrain = t === T_WALL ? L.t('look.wall') : floorWord;
  if (t === T_STAIRS) {
    terrain = L.t('look.stairsDown');
    lines.push(L.t('look.stairsDownLine', { n: run.depth + 1 }));
  }
  if (t === T_UP) {
    terrain = L.t('look.stairsUp');
    lines.push(L.t('look.stairsUpLine', { n: run.depth - 1 }));
  }
  if (sh && sh.pos.x === x && sh.pos.y === y) {
    terrain = L.t('look.shrine');
    if (sh.dark) lines.push(L.t('look.shrine.dark'));
    else if (sh.used) lines.push(L.t('look.shrine.spent'));
    else if (sh.offers?.length) lines.push(L.t('look.shrine.offers', { list: sh.offers.map((r) => L.rule(r).name).join(L.t('list.sep')) }));
    else lines.push(L.t('look.shrine.unseen'));
  }
  if (grave) {
    terrain = L.t('look.grave', { name: grave.name });
    lines.push(L.t('look.grave.line', { gen: grave.gen, epitaph: grave.epitaph }));
    lines.push(L.t(grave.looted || !grave.item ? 'look.grave.empty' : 'look.grave.full'));
  }
  if (gl) {
    if (game.has('elements')) {
      terrain = L.t('look.stone', { Element: L.element(gl).Adj });
      lines.push(
        gl === 'ember'
          ? L.t('look.ember', { n: alt(ctx, 'elements') ? BALANCE.elements.wildfireBurn : BALANCE.elements.emberBurn })
          : L.t('look.frost'),
      );
    } else {
      terrain = L.t('look.glimmer');
      lines.push(L.t(gl === 'ember' ? 'look.glimmer.ember' : 'look.glimmer.frost'));
    }
  }
  const you = L.t('look.you', { name: p.name });
  if (!titles.length || (titles.length === 1 && titles[0] === you)) titles.push(terrain);
  else if (terrain !== floorWord) lines.push(L.t('look.underfoot', { terrain: terrain.toLowerCase() }));
  if (t === T_WALL) lines.push(L.t('look.rock'));

  return { title: titles.join(' · '), lines, known: true, walkable: t !== T_WALL };
}
