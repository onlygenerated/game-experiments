import { itemLabel } from '../engine/content.ts';
import { CLEAVE_COST, MEND_COST, xpNeeded, type Game } from '../engine/game.ts';
import type { Item, RuleId, World } from '../engine/types.ts';
import {
  alt,
  derive,
  frontier,
  has,
  hiddenProps,
  MAX_SATIETY,
  previewRule,
  RULE_ORDER,
  RULES,
  weightOf,
  type RuleCtx,
} from '../rules/rules.ts';

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function bar(label: string, cur: number, max: number, cls: string, text = `${Math.ceil(cur)}/${max}`) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<div class="bar ${cls}"><div class="bar-label"><span>${label}</span><span>${text}</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
}

/** A sidebar panel. It plays its reveal animation on the render right after any of `rules` arrives. */
function section(rules: RuleId | 'core' | RuleId[], title: string, body: string, fresh: ReadonlySet<string>) {
  const list = Array.isArray(rules) ? rules : [rules];
  return `<section class="panel${list.some((r) => fresh.has(r)) ? ' reveal' : ''}" data-rule="${list.join(' ')}">
    <h3>${title}</h3>${body}</section>`;
}

export function itemFacts(item: Item, game: Game): string[] {
  const ctx = game.ctx;
  const p = game.run.player;
  const facts: string[] = [];
  if (item.kind === 'potion') facts.push(`Heals ${Math.round((item.heal ?? 0) * (alt(ctx, 'things') ? 1.5 : 1))}`);
  if (item.kind === 'food') facts.push(`Satiety +${item.nourish}`);
  if (item.kind === 'weapon') facts.push(`Attack +${item.atk}`);
  if (item.kind === 'armor') facts.push(`Defense +${item.def}`);
  if (item.kind === 'weapon' || item.kind === 'armor') {
    if (has(ctx, 'weight')) {
      const w = weightOf(item, ctx);
      facts.push(`Weight ${w}${w > p.str ? ' — too heavy' : ''}`);
    }
    if (has(ctx, 'durability')) facts.push(`Durability ${item.dur}/${item.maxDur}`);
    if (has(ctx, 'elements') && item.element) facts.push(item.element === 'ember' ? 'Ember' : 'Frost');
  }
  return facts;
}

function hiddenMark(item: Item, ctx: RuleCtx): string {
  const n = hiddenProps(item, ctx);
  if (!n) return '';
  const tip = `${n} ${n === 1 ? 'thing' : 'things'} about this you cannot perceive yet`;
  return ` <span class="hidden-props" title="${tip}" aria-label="${tip}">${'◇'.repeat(n)}</span>`;
}

function itemRow(item: Item, game: Game, slot?: 'weapon' | 'armor'): string {
  const ctx = game.ctx;
  const facts = itemFacts(item, game);
  const heavy = has(ctx, 'weight') && (item.kind === 'weapon' || item.kind === 'armor') && weightOf(item, ctx) > game.run.player.str;
  const buttons: string[] = [];
  if (slot) buttons.push(`<button data-cmd="unequip" data-slot="${slot}" title="Put away">Unequip</button>`);
  else {
    if (item.kind === 'potion') buttons.push(`<button data-cmd="use" data-id="${item.id}">Drink</button>`);
    if (item.kind === 'food') buttons.push(`<button data-cmd="use" data-id="${item.id}">Eat</button>`);
    if ((item.kind === 'weapon' || item.kind === 'armor') && game.has('arms'))
      buttons.push(`<button data-cmd="equip" data-id="${item.id}">Equip</button>`);
    buttons.push(`<button data-cmd="drop" data-id="${item.id}" class="ghost" title="Drop">Drop</button>`);
  }
  return `<li class="item kind-${item.kind}${heavy ? ' heavy' : ''}">
    <div class="item-main"><span class="item-name">${esc(itemLabel(item, ctx))}</span>${hiddenMark(item, ctx)}
    <span class="item-facts">${facts.map(esc).join(' · ')}</span></div>
    <div class="item-btns">${buttons.join('')}</div></li>`;
}

export function sidebarHTML(game: Game, fresh: ReadonlySet<string>): string {
  const run = game.run;
  const p = run.player;
  const s = game.stats;
  const out: string[] = [];

  // Before Peril there is nothing to measure: no HP, no way to be hurt.
  let vitals = game.has('peril')
    ? bar('HP', p.hp, s.maxHp, 'hp')
    : '<p class="muted small">Nothing here can hurt you. Yet.</p>';
  if (game.has('arcana')) vitals += bar('Mana', p.mana, s.maxMana, 'mana');
  if (game.has('hunger'))
    vitals += bar('Satiety', p.satiety, MAX_SATIETY, p.satiety < 100 ? 'food low' : 'food', p.satiety <= 0 ? 'Starving' : p.satiety < MAX_SATIETY / 2 ? 'Hungry' : 'Fed');
  if (game.has('growth')) vitals += bar(`Level ${p.level}`, p.xp, xpNeeded(p.level, game.ctx), 'xp', `${p.xp}/${xpNeeded(p.level, game.ctx)} XP`);
  out.push(section('core', esc(p.name), vitals, fresh));

  if (game.has('growth') || game.has('arms')) {
    const rows: [string, string][] = [
      ['Attack', String(s.attack)],
      ['Defense', String(s.defense)],
    ];
    if (game.has('growth')) {
      rows.unshift(['STR', String(p.str)], ['AGI', String(p.agi)], ['VIT', String(p.vit)]);
      rows.push(['Hit', `${Math.round(s.hit * 100)}%`], ['Foe hits', `${Math.round(s.enemyHit * 100)}%`]);
    }
    if (game.has('weight')) {
      rows.push(['Atk cost', s.attackCost === 1 ? '1 turn' : `${s.attackCost} turns`]);
      rows.push(['Move cost', s.moveCost === 1 ? '1 turn' : `${s.moveCost} turns`]);
      if (s.stagger) rows.push(['Stagger', `${Math.round(s.stagger * 100)}%`]);
    }
    if (game.has('darkness')) rows.push(['Sneak', `×${s.sneak}`]);
    out.push(
      section(
        ['growth', 'arms', 'weight', 'darkness'],
        'Character',
        `<dl class="stats">${rows.map(([k, v]) => `<div class="${s.attackCost > 1 && k === 'Atk cost' ? 'warn' : s.moveCost > 1 && k === 'Move cost' ? 'warn' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`,
        fresh,
      ),
    );
  }

  if (game.has('arms')) {
    const eq = [
      p.weapon ? itemRow(p.weapon, game, 'weapon') : '<li class="item empty">No weapon — fists</li>',
      p.armor ? itemRow(p.armor, game, 'armor') : '<li class="item empty">No armour</li>',
    ];
    out.push(section('arms', 'Equipped', `<ul class="items">${eq.join('')}</ul>`, fresh));
  }

  if (game.has('arcana')) {
    out.push(
      section(
        'arcana',
        'Abilities',
        `<div class="abilities">
          <button data-cmd="ability" data-ability="cleave" ${p.mana < CLEAVE_COST ? 'disabled' : ''}><kbd>Z</kbd> Cleave <small>${CLEAVE_COST} mana</small></button>
          <button data-cmd="ability" data-ability="mend" ${p.mana < MEND_COST ? 'disabled' : ''}><kbd>X</kbd> Mend <small>${MEND_COST} mana</small></button>
        </div>`,
        fresh,
      ),
    );
  }

  if (game.has('things')) {
    const items = p.inventory.length
      ? `<ul class="items">${p.inventory.map((i) => itemRow(i, game)).join('')}</ul>`
      : '<p class="muted">Empty.</p>';
    out.push(section('things', `Pack <small>${p.inventory.length}/12 · ${p.gold} gold</small>`, items, fresh));
  }

  const rules = game.world.rules;
  out.push(
    section(
      'core',
      `Rules <small>${rules.length}/${RULE_ORDER.length}</small>`,
      rules.length
        ? `<div class="chips">${RULE_ORDER.filter((r) => rules.includes(r))
            .map((r) => `<button class="chip${fresh.has(r) ? ' fresh' : ''}" data-cmd="codex" title="${esc(RULES[r].tagline)}">${RULES[r].name}${game.world.variants[r] === 'alt' ? '<sup>✦</sup>' : ''}</button>`)
            .join('')}</div>`
        : '<p class="muted">This world has no rules yet: one room, a shrine, and stairs down.</p>',
      fresh,
    ),
  );
  return out.join('');
}

export function topbarHTML(game: Game): string {
  const run = game.run;
  return `<span class="brand">Unfolding</span>
    <span class="tb-world">${esc(game.world.name)}</span>
    <span class="tb-heir">${esc(run.player.name)} · heir ${run.gen}</span>
    <span class="tb-depth">Depth ${run.depth}</span>
    ${game.has('peril') ? `<span class="tb-hp${run.player.hp <= game.stats.maxHp / 3 ? ' low' : ''}">HP ${Math.max(0, run.player.hp)}/${game.stats.maxHp}</span>` : ''}
    <span class="spacer"></span>
    ${game.world.rules.length ? '<button data-cmd="codex" class="ghost">Codex <kbd>C</kbd></button>' : ''}
    <button data-cmd="help" class="ghost tb-keys">Keys <kbd>?</kbd></button>
    <button data-cmd="leave" class="ghost">Save &amp; quit</button>`;
}

export function logHTML(game: Game): string {
  const lines = game.run.log.slice(-6);
  return lines
    .map((l, i) => `<p class="tone-${l.tone}" style="opacity:${0.45 + (0.55 * (i + 1)) / lines.length}">${esc(l.text)}</p>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ruleBody(id: RuleId, variants: World['variants']): string {
  const r = RULES[id];
  return `<p class="summary">${esc(r.summary)}</p>
    <p class="up"><b>+</b> ${esc(r.upside)}</p>
    <p class="down"><b>−</b> ${esc(r.downside)}</p>
    ${variants[id] === 'alt' ? `<p class="variant">✦ <b>${esc(r.variant.name)}</b> — ${esc(r.variant.text)}</p>` : ''}`;
}

export function shrineHTML(game: Game): string {
  const offers = game.run.floor.shrine?.offers ?? [];
  const info = { glimmers: Object.keys(game.run.floor.glimmer).length, monsters: game.run.monsters.length };
  const cards = offers.map((id, i) => {
    const pv = previewRule(game.run.player, game.ctx, id, info);
    const changes = pv.changes.length
      ? `<ul class="diff">${pv.changes
          .map((c) => `<li class="${c.good ? 'good' : 'bad'}"><span>${esc(c.label)}</span><span>${esc(c.from)} → <b>${esc(c.to)}</b></span></li>`)
          .join('')}</ul>`
      : '<p class="muted small">No change to your numbers right now.</p>';
    return `<article class="rule-card">
      <header><span class="tier">Tier ${RULES[id].tier}</span><h2>${RULES[id].name}</h2><p class="tagline">${esc(RULES[id].tagline)}</p></header>
      ${ruleBody(id, game.world.variants)}
      <div class="foryou"><h4>For you, right now</h4>${changes}
      ${pv.notes.length ? `<ul class="notes">${pv.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
      <button class="primary" data-cmd="shrine" data-rule="${id}"><kbd>${i + 1}</kbd> Adopt ${RULES[id].name}</button>
    </article>`;
  });
  return `<div class="modal shrine" role="dialog" aria-label="Rule Shrine">
    <header class="modal-head"><span class="eyebrow">Rule Shrine · depth ${game.run.depth}</span>
      <h1>Choose a rule for ${esc(game.world.name)}</h1>
      <p class="muted">Adopting a rule changes this world for every heir who follows${game.has('peril') ? ', and the shrine heals you fully' : ''}. Rules you pass over may be offered again.</p></header>
    <div class="cards">${cards.join('')}</div>
    <footer><button data-cmd="shrine" data-rule="" class="ghost"><kbd>Esc</kbd> Step away — you can return while you’re on this floor</button></footer>
  </div>`;
}

export function levelupHTML(game: Game): string {
  const p = game.run.player;
  const before = derive(p, game.ctx);
  const opt = (stat: 'str' | 'agi' | 'vit', i: number, label: string, blurb: string) => {
    const after = derive({ ...p, [stat]: p[stat] + 1 }, game.ctx);
    const diffs: string[] = [];
    if (after.attack !== before.attack) diffs.push(`Attack ${before.attack} → ${after.attack}`);
    if (after.hit !== before.hit) diffs.push(`Hit ${Math.round(before.hit * 100)}% → ${Math.round(after.hit * 100)}%`);
    if (after.enemyHit !== before.enemyHit) diffs.push(`Foe hits ${Math.round(before.enemyHit * 100)}% → ${Math.round(after.enemyHit * 100)}%`);
    if (after.maxHp !== before.maxHp) diffs.push(`Max HP ${before.maxHp} → ${after.maxHp}`);
    if (after.attackCost !== before.attackCost) diffs.push(`Attack cost ${before.attackCost} → ${after.attackCost} turns`);
    if (after.moveCost !== before.moveCost) diffs.push(`Move cost ${before.moveCost} → ${after.moveCost} turns`);
    if (after.stagger !== before.stagger) diffs.push(`Stagger ${Math.round(before.stagger * 100)}% → ${Math.round(after.stagger * 100)}%`);
    if (after.defense !== before.defense) diffs.push(`Defense ${before.defense} → ${after.defense}`);
    return `<button class="stat-choice" data-cmd="levelup" data-stat="${stat}"><kbd>${i}</kbd>
      <span class="stat-name">${label} ${p[stat]} → ${p[stat] + 1}</span><span class="muted small">${blurb}</span>
      <span class="stat-diff">${diffs.map(esc).join('<br>')}</span></button>`;
  };
  return `<div class="modal levelup" role="dialog" aria-label="Level up">
    <header class="modal-head"><span class="eyebrow">Level ${p.level}</span><h1>You grow stronger</h1></header>
    <div class="stat-choices">
      ${opt('str', 1, 'STR', game.has('weight') ? 'Damage, and what you can wield' : 'Damage')}
      ${opt('agi', 2, 'AGI', 'Hit more, get hit less')}
      ${opt('vit', 3, 'VIT', '+4 max HP')}
    </div></div>`;
}

export function bannerHTML(id: RuleId, how: 'shrine' | 'mastery' | 'milestone', world: World): string {
  const why =
    how === 'mastery' ? 'Earned through mastery' : how === 'milestone' ? 'The world grows deeper' : 'Adopted at a shrine';
  return `<div class="modal banner" role="dialog" aria-label="New rule">
    <span class="eyebrow">${why}</span>
    <p class="new-rule">A new rule</p>
    <h1>${RULES[id].name}</h1>
    <p class="tagline">${esc(RULES[id].tagline)}</p>
    ${ruleBody(id, world.variants)}
    <button class="primary" data-cmd="dismiss"><kbd>Enter</kbd> Continue</button>
  </div>`;
}

export function codexHTML(world: World): string {
  const active = RULE_ORDER.filter((r) => world.rules.includes(r));
  // Only name rules that have already shown themselves somewhere this world has reached.
  const front = frontier(new Set(world.rules), { depth: Math.max(1, world.deepest), emergence: world.emergence ?? {} });
  const unknown = RULE_ORDER.length - active.length - front.length;
  return `<div class="modal codex" role="dialog" aria-label="Codex">
    <header class="modal-head"><span class="eyebrow">Codex of ${esc(world.name)}</span><h1>The rules of this world</h1></header>
    <div class="codex-list">${active
      .map((r) => `<article class="codex-entry"><h2>${RULES[r].name} <span class="tier">Tier ${RULES[r].tier}</span></h2>
        <p class="tagline">${esc(RULES[r].tagline)}</p>${ruleBody(r, world.variants)}</article>`)
      .join('')}</div>
    ${front.length ? `<p class="muted">Shrines may offer next: ${front.map((r) => RULES[r].name).join(', ')}.</p>` : ''}
    ${unknown > 0 ? `<p class="muted">${unknown} more ${unknown === 1 ? 'rule lies' : 'rules lie'} beyond those.</p>` : ''}
    ${world.history.length ? `<h3>Chronicle</h3><ol class="chronicle">${world.history
      .map((h) => `<li><b>${esc(h.name)}</b>, heir ${h.gen} — level ${h.level}, ${esc(h.cause)} after ${h.turns} turns.</li>`)
      .join('')}</ol>` : ''}
    <footer><button data-cmd="dismiss" class="primary"><kbd>Esc</kbd> Close</button></footer>
  </div>`;
}

export function helpHTML(): string {
  return `<div class="modal help" role="dialog" aria-label="Keys">
    <header class="modal-head"><h1>Keys</h1></header>
    <dl class="keys">
      <div><dt>Arrows · hjkl yubn · numpad</dt><dd>Move / attack (walk into a foe)</dd></div>
      <div><dt>. · 5 · Space</dt><dd>Wait a turn</dd></div>
      <div><dt>&gt; · Enter</dt><dd>Descend stairs</dd></div>
      <div><dt>q / e</dt><dd>Drink a potion / eat</dd></div>
      <div><dt>z / x</dt><dd>Cleave / Mend (with Arcana)</dd></div>
      <div><dt>c</dt><dd>Codex</dd></div>
      <div><dt>Tap the map</dt><dd>Step toward that spot; tap yourself to wait</dd></div>
      <div><dt>Drag the map</dt><dd>Look around; your next move recenters</dd></div>
      <div><dt>Press and hold the map</dt><dd>Walk there; stops if a foe appears or you're hurt. Any key or tap stops it</dd></div>
    </dl>
    <p class="muted small">Legend: <b>@</b> you · <b>&gt;</b> stairs · <b>Ω</b> rule shrine · <b>†</b> grave · <b>!</b> potion · <b>$</b> gold · <b>)</b> weapon · <b>[</b> armour · <b>%</b> food · ◇ a property you can't perceive yet</p>
    <footer><button data-cmd="dismiss" class="primary"><kbd>Esc</kbd> Close</button></footer>
  </div>`;
}
