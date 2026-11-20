/**
 * Golden behaviour: dozens of seeded games, fingerprinted. Refactors that claim
 * "no behaviour change" must keep every fingerprint identical — the moves, the
 * HP, every log line, and the text the HUD and modals render.
 *
 * Fingerprints leave out internal ids (genotype names, item ids) so renaming
 * them is free; anything a player could see is in.
 *
 * After an intended change in play or wording:  UPDATE_GOLDEN=1 npx vitest run golden
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Game } from '../engine/game.ts';
import { Rng } from '../engine/rng.ts';
import type { RuleId } from '../engine/types.ts';
import { newWorld } from '../engine/world.ts';
import { RULE_ORDER } from '../rules/rules.ts';
import { describeTile } from '../ui/describe.ts';
import { bannerHTML, codexHTML, helpHTML, levelupHTML, logHTML, shrineHTML, sidebarHTML, topbarHTML } from '../ui/hud.ts';
import { botAction, explorerAction } from './bot.ts';

const FILE = new URL('./golden.json', import.meta.url);
const UPDATE = process.env.UPDATE_GOLDEN === '1';

interface Case {
  name: string;
  seed: number;
  rules: RuleId[] | null;
  bot: 'greedy' | 'explorer';
  actions: number;
}

const ALL = RULE_ORDER.filter((r) => r !== 'bestiary');
const CASES: Case[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ name: `fresh-greedy-${seed}`, seed, rules: null, bot: 'greedy' as const, actions: 1500 })),
  ...[11, 12, 13, 14, 15, 16].map((seed) => ({ name: `full-explorer-${seed}`, seed, rules: ALL, bot: 'explorer' as const, actions: 2500 })),
  ...[21, 22, 23, 24].map((seed) => ({
    name: `hunger-explorer-${seed}`,
    seed,
    rules: ['peril', 'halls', 'things', 'hunger'] as RuleId[],
    bot: 'explorer' as const,
    actions: 2000,
  })),
  ...[31, 32, 33, 34].map((seed) => ({ name: `full-greedy-${seed}`, seed, rules: ALL, bot: 'greedy' as const, actions: 1500 })),
];

function fingerprint(c: Case): string {
  const world = newWorld(c.seed * 7919);
  if (c.rules) world.rules = [...c.rules];
  const g = Game.start(world);
  const rng = new Rng(c.seed);
  const trace: string[] = [];
  const texts: string[] = [];
  for (let i = 0; i < c.actions && !g.run.over; i++) {
    g.act(c.bot === 'greedy' ? botAction(g, rng) : explorerAction(g, rng));
    const p = g.run.player;
    trace.push(`${g.run.turn},${g.run.depth},${p.x},${p.y},${p.hp}`);
    // Sample the rendered UI as the run goes, so every rule's text shows up.
    if (i % 250 === 0 || g.run.pending) {
      texts.push(sidebarHTML(g, new Set()), topbarHTML(g, false), logHTML(g));
      if (g.run.pending?.kind === 'shrine') texts.push(shrineHTML(g));
      if (g.run.pending?.kind === 'levelup') texts.push(levelupHTML(g));
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, -1], [3, 2]]) {
        const t = describeTile(g, p.x + dx, p.y + dy);
        texts.push(`${t.title}|${t.lines.join('|')}`);
      }
    }
  }
  const run = g.run;
  const p = run.player;
  const final = {
    trace,
    log: run.log.map((l) => `${l.tone}:${l.text}`),
    over: run.over,
    cause: run.cause,
    player: {
      ...p,
      inventory: p.inventory.map((i) => `${i.name}/${i.atk ?? ''}/${i.def ?? ''}/${i.dur}/${i.weight}/${i.element}`),
      weapon: p.weapon?.name ?? null,
      armor: p.armor?.name ?? null,
    },
    monsters: run.monsters.map((m) => `${m.x},${m.y},${m.hp}/${m.maxHp},${m.atk},${m.def},${m.element},${m.aware},${m.stun}`),
    items: run.items.map((fi) => `${fi.x},${fi.y},${fi.item.name}`),
    world: { rules: world.rules, history: world.history, graves: world.graves.map((gr) => ({ ...gr, item: gr.item?.name ?? null })) },
    texts,
    codex: codexHTML(world),
    help: helpHTML(),
    banners: world.rules.map((r) => bannerHTML(r, 'shrine', world)),
  };
  return createHash('sha256').update(JSON.stringify(final)).digest('hex').slice(0, 16);
}

describe('golden behaviour', () => {
  const golden: Record<string, string> = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  const fresh: Record<string, string> = {};
  for (const c of CASES) {
    it(c.name, () => {
      const fp = fingerprint(c);
      fresh[c.name] = fp;
      if (UPDATE) return;
      expect(golden[c.name], `no golden for ${c.name}; run with UPDATE_GOLDEN=1`).toBeDefined();
      expect(fp).toBe(golden[c.name]);
    });
  }
  it('writes the golden file when asked', () => {
    if (UPDATE) writeFileSync(FILE, JSON.stringify(fresh, null, 2) + '\n');
    expect(Object.keys(fresh)).toHaveLength(CASES.length);
  });
});
