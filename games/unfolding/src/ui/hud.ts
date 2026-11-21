import { itemLabel } from '../engine/content.ts';
import type { TileInfo } from './describe.ts';
import { OPTION_DEFS, type OptionDef, type Options } from './options.ts';
import { CLEAVE_COST, MEND_COST, xpNeeded, type Game } from '../engine/game.ts';
import { BALANCE } from '../engine/balance.ts';
import { DEFAULT_PREMISE, lexiconFor, lexiconOf, PREMISES, type Lexicon } from '../theme/lexicon.ts';
import type { Item, RuleId, SpaceId, TimeId, World } from '../engine/types.ts';
import { aims, MEANS, type HarmId } from '../rules/harm.ts';
import { driftLeft, tideLeft } from '../rules/axioms.ts';
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

/** The mechanical name beside a themed one, when there is one to show. */
export const glossHTML = (g: string | null) => (g ? ` <span class="gloss">${esc(g)}</span>` : '');

/** What kind of world this is: its premise, and who it borrows from. */
export function premiseLine(world: World): string {
  const premise = PREMISES[world.genome?.premise ?? DEFAULT_PREMISE];
  const donors = [...new Set((world.genome?.intrusions ?? []).map((i) => PREMISES[i.from].name))];
  return donors.length ? `${premise.name}, touched by ${donors.join(' and ')}` : premise.name;
}

function bar(label: string, cur: number, max: number, cls: string, text = `${Math.ceil(cur)}/${max}`, gloss: string | null = null) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return `<div class="bar ${cls}"${gloss ? ` title="${esc(gloss)}"` : ''}><div class="bar-label"><span>${label}</span><span>${text}</span></div>
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
  const L = game.lex;
  const p = game.run.player;
  const facts: string[] = [];
  if (item.kind === 'potion') facts.push(L.t('fact.heals', { n: Math.round((item.heal ?? 0) * (alt(ctx, 'things') ? BALANCE.potion.generousMult : 1)) }));
  if (item.kind === 'food') facts.push(L.t('fact.nourish', { n: item.nourish ?? 0 }));
  if (item.kind === 'weapon') facts.push(L.t('fact.attack', { n: item.atk ?? 0 }));
  if (item.kind === 'armor') facts.push(L.t('fact.defense', { n: item.def ?? 0 }));
  if (item.kind === 'weapon' || item.kind === 'armor') {
    if (has(ctx, 'weight')) {
      const w = weightOf(item, ctx);
      facts.push(L.t('fact.weight', { n: w }) + (w > p.str ? L.t('fact.tooHeavy') : ''));
    }
    if (has(ctx, 'durability')) facts.push(L.t('fact.durability', { n: item.dur, max: item.maxDur }));
    if (has(ctx, 'elements') && item.element) facts.push(L.element(item.element).Adj);
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
    <div class="item-main"><span class="item-name">${esc(itemLabel(item, ctx, game.lex))}</span>${hiddenMark(item, ctx)}
    <span class="item-facts">${facts.map(esc).join(' · ')}</span></div>
    <div class="item-btns">${buttons.join('')}</div></li>`;
}

export function sidebarHTML(game: Game, fresh: ReadonlySet<string>): string {
  const run = game.run;
  const p = run.player;
  const s = game.stats;
  const L = game.lex;
  const out: string[] = [];

  // Before Peril there is nothing to measure: no HP, no way to be hurt.
  let vitals = game.has('peril')
    ? bar(L.t('hud.hp'), p.hp, s.maxHp, 'hp', undefined, L.roleGloss('hp'))
    : `<p class="muted small">${esc(L.t('hud.unhurt'))}</p>`;
  if (s.maxMana > 0) vitals += bar(L.t('hud.mana'), p.mana, s.maxMana, 'mana', undefined, L.roleGloss('mana'));
  if (game.has('hunger'))
    vitals += bar(L.t('hud.satiety'), p.satiety, MAX_SATIETY, p.satiety < 100 ? 'food low' : 'food', L.t(p.satiety <= 0 ? 'hud.starving' : p.satiety < MAX_SATIETY / 2 ? 'hud.hungry' : 'hud.fed'), L.roleGloss('satiety'));
  if (game.has('growth')) vitals += bar(L.t('hud.level', { n: p.level }), p.xp, xpNeeded(p.level, game.ctx), 'xp', L.t('hud.xp', { n: p.xp, max: xpNeeded(p.level, game.ctx) }), L.roleGloss('xp'));
  if (game.has('peril')) vitals += meansHTML(game);
  out.push(section('core', esc(p.name), vitals, fresh));

  if (game.has('growth') || game.has('arms')) {
    const rows: [string, string][] = [
      ['Attack', String(s.attack)],
      ['Defense', String(s.defense)],
    ];
    if (game.has('growth')) {
      rows.unshift([L.t('stat.str'), String(p.str)], [L.t('stat.agi'), String(p.agi)], [L.t('stat.vit'), String(p.vit)]);
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
      p.weapon ? itemRow(p.weapon, game, 'weapon') : `<li class="item empty">${esc(L.t('hud.fists'))}</li>`,
      p.armor ? itemRow(p.armor, game, 'armor') : `<li class="item empty">${esc(L.t('hud.noArmor'))}</li>`,
    ];
    out.push(section('arms', 'Equipped', `<ul class="items">${eq.join('')}</ul>`, fresh));
  }

  if (game.has('arcana')) {
    out.push(
      section(
        'arcana',
        'Abilities',
        `<div class="abilities">
          <button data-cmd="ability" data-ability="cleave" ${p.mana < CLEAVE_COST ? 'disabled' : ''}><kbd>Z</kbd> ${esc(L.t('ability.cleave'))} <small>${esc(L.t('hud.manaCost', { n: CLEAVE_COST }))}</small></button>
          <button data-cmd="ability" data-ability="mend" ${p.mana < MEND_COST ? 'disabled' : ''}><kbd>X</kbd> ${esc(L.t('ability.mend'))} <small>${esc(L.t('hud.manaCost', { n: MEND_COST }))}</small></button>
        </div>`,
        fresh,
      ),
    );
  }

  // Whatever lies underfoot, when it wasn't picked up automatically.
  const here = game.itemsHere();
  if (here.length) {
    const rows = here
      .map((fi) => {
        const facts = itemFacts(fi.item, game);
        return `<li class="item kind-${fi.item.kind}"><div class="item-main"><span class="item-name">${esc(itemLabel(fi.item, game.ctx, L))}</span>${hiddenMark(fi.item, game.ctx)}
          <span class="item-facts">${facts.map(esc).join(' · ')}</span></div>
          <div class="item-btns"><button data-cmd="pickup" data-id="${fi.item.id}">Pick up</button></div></li>`;
      })
      .join('');
    out.push(
      section(
        'things',
        `Here <small>${here.length > 1 ? '<button class="linkish" data-cmd="pickup">Pick up all <kbd>G</kbd></button>' : 'press <kbd>G</kbd>'}</small>`,
        `<ul class="items">${rows}</ul>`,
        fresh,
      ),
    );
  }

  if (game.has('things')) {
    const items = p.inventory.length
      ? `<ul class="items">${p.inventory.map((i) => itemRow(i, game)).join('')}</ul>`
      : '<p class="muted">Empty.</p>';
    out.push(section('things', `${esc(L.t('hud.pack'))} <small>${p.inventory.length}/12 · ${esc(L.t('item.currency', { n: p.gold }))}</small>`, items, fresh));
  }

  const rules = game.world.rules;
  out.push(
    section(
      'core',
      `Rules <small>${rules.length}/${RULE_ORDER.length}</small>`,
      rules.length
        ? `<div class="chips">${RULE_ORDER.filter((r) => rules.includes(r))
            .map((r) => `<button class="chip${fresh.has(r) ? ' fresh' : ''}" data-cmd="codex" title="${esc([L.ruleGloss(r), L.rule(r).tagline].filter(Boolean).join(' — '))}">${esc(L.rule(r).name)}${game.world.variants[r] === 'alt' ? '<sup>✦</sup>' : ''}</button>`)
            .join('')}</div>`
        : `<p class="muted">${esc(L.t('hud.noRules'))}</p>`,
      fresh,
    ),
  );
  return out.join('');
}

export function topbarHTML(game: Game, look: boolean): string {
  const run = game.run;
  const L = game.lex;
  return `<span class="brand">Unfolding</span>
    <span class="tb-world">${esc(game.world.name)}</span>
    <span class="tb-heir">${esc(run.player.name)} · ${esc(L.t('hud.heir', { n: run.gen }))}</span>
    <span class="tb-depth">${esc(L.t('hud.depth', { n: run.depth }))}${floorNameHTML(game)}</span>${game.testing ? '<span class="tb-testing" title="Testing mode is on (Options)">Testing</span>' : ''}
    ${game.has('peril') ? `<span class="tb-hp${run.player.hp <= game.stats.maxHp / 3 ? ' low' : ''}">${esc(L.t('hud.hpOf', { n: Math.max(0, run.player.hp), max: game.stats.maxHp }))}</span>` : ''}
    <span class="spacer"></span>
    <button data-cmd="look" class="ghost tb-look${look ? ' on' : ''}" aria-pressed="${look}">Look <kbd>;</kbd></button>
    ${game.world.rules.length ? '<button data-cmd="codex" class="ghost">Codex <kbd>C</kbd></button>' : ''}
    <button data-cmd="help" class="ghost tb-keys">Keys <kbd>?</kbd></button>
    <button data-cmd="options" class="ghost">Options <kbd>O</kbd></button>
    <button data-cmd="leave" class="ghost">Save &amp; quit</button>`;
}

function floorNameHTML(game: Game): string {
  const name = game.lex.floorName(game.world.seed, game.run.depth);
  return name ? ` <span class="tb-floor">· ${esc(name)}</span>` : '';
}

/** The latest notices, newest on top, fading as they get older. */
export function logHTML(game: Game): string {
  const lines = game.run.log.slice(-6).reverse();
  return lines
    .map((l, i) => `<p class="tone-${l.tone}" style="opacity:${1 - (0.55 * i) / lines.length}">${esc(l.text)}</p>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ruleBody(id: RuleId, variants: World['variants'], L: Lexicon): string {
  const r = L.rule(id);
  return `<p class="summary">${esc(r.summary)}</p>
    <p class="up"><b>+</b> ${esc(r.upside)}</p>
    <p class="down"><b>−</b> ${esc(r.downside)}</p>
    ${variants[id] === 'alt' ? `<p class="variant">✦ <b>${esc(r.variant.name)}</b> — ${esc(r.variant.text)}</p>` : ''}`;
}

export function shrineHTML(game: Game): string {
  const offers = game.run.floor.shrine?.offers ?? [];
  const L = game.lex;
  const info = { glimmers: Object.keys(game.run.floor.glimmer).length, monsters: game.run.monsters.length };
  const cards = offers.map((id, i) => {
    const pv = previewRule(game.run.player, game.ctx, id, info, L);
    const r = L.rule(id);
    const changes = pv.changes.length
      ? `<ul class="diff">${pv.changes
          .map((c) => `<li class="${c.good ? 'good' : 'bad'}"><span>${esc(c.label)}</span><span>${esc(c.from)} → <b>${esc(c.to)}</b></span></li>`)
          .join('')}</ul>`
      : '<p class="muted small">No change to your numbers right now.</p>';
    return `<article class="rule-card">
      <header><span class="tier">Tier ${RULES[id].tier}</span><h2>${esc(r.name)}${glossHTML(L.ruleGloss(id))}</h2><p class="tagline">${esc(r.tagline)}</p></header>
      ${ruleBody(id, game.world.variants, L)}
      <div class="foryou"><h4>For you, right now</h4>${changes}
      ${pv.notes.length ? `<ul class="notes">${pv.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
      <button class="primary" data-cmd="shrine" data-rule="${id}"><kbd>${i + 1}</kbd> Adopt ${esc(r.name)}</button>
    </article>`;
  });
  return `<div class="modal shrine" role="dialog" aria-label="Rule Shrine">
    <header class="modal-head"><span class="eyebrow">${esc(L.t('hud.shrineDepth', { n: game.run.depth }))}</span>
      <h1>Choose a rule for ${esc(game.world.name)}</h1>
      <p class="muted">Adopting a rule changes this world for every ${esc(L.role('heir'))} who follows${game.has('peril') ? `, and the ${esc(L.role('shrine'))} heals you fully` : ''}. Rules you pass over may be offered again.</p></header>
    <div class="cards">${cards.join('')}</div>
    <footer>${rerollHTML(game)}<button data-cmd="shrine" data-rule="" class="ghost"><kbd>Esc</kbd> Step away — you can return while you’re on this ${esc(L.role('floor'))}</button></footer>
  </div>`;
}

export function levelupHTML(game: Game): string {
  const p = game.run.player;
  const L = game.lex;
  const before = derive(p, game.ctx);
  const opt = (stat: 'str' | 'agi' | 'vit', i: number, label: string, blurb: string) => {
    const after = derive({ ...p, [stat]: p[stat] + 1 }, game.ctx);
    const diffs: string[] = [];
    if (after.attack !== before.attack) diffs.push(`Attack ${before.attack} → ${after.attack}`);
    if (after.hit !== before.hit) diffs.push(`Hit ${Math.round(before.hit * 100)}% → ${Math.round(after.hit * 100)}%`);
    if (after.enemyHit !== before.enemyHit) diffs.push(`Foe hits ${Math.round(before.enemyHit * 100)}% → ${Math.round(after.enemyHit * 100)}%`);
    if (after.maxHp !== before.maxHp) diffs.push(L.t('levelup.maxHp', { a: before.maxHp, b: after.maxHp }));
    if (after.attackCost !== before.attackCost) diffs.push(`Attack cost ${before.attackCost} → ${after.attackCost} turns`);
    if (after.moveCost !== before.moveCost) diffs.push(`Move cost ${before.moveCost} → ${after.moveCost} turns`);
    if (after.stagger !== before.stagger) diffs.push(`Stagger ${Math.round(before.stagger * 100)}% → ${Math.round(after.stagger * 100)}%`);
    if (after.defense !== before.defense) diffs.push(`Defense ${before.defense} → ${after.defense}`);
    return `<button class="stat-choice" data-cmd="levelup" data-stat="${stat}"><kbd>${i}</kbd>
      <span class="stat-name">${esc(label)} ${p[stat]} → ${p[stat] + 1}</span><span class="muted small">${esc(blurb)}</span>
      <span class="stat-diff">${diffs.map(esc).join('<br>')}</span></button>`;
  };
  return `<div class="modal levelup" role="dialog" aria-label="Level up">
    <header class="modal-head"><span class="eyebrow">Level ${p.level}</span><h1>You grow stronger</h1></header>
    <div class="stat-choices">
      ${opt('str', 1, L.t('stat.str'), L.t(game.has('weight') ? 'levelup.blurb.strWeight' : 'levelup.blurb.str'))}
      ${opt('agi', 2, L.t('stat.agi'), L.t('levelup.blurb.agi'))}
      ${opt('vit', 3, L.t('stat.vit'), L.t('levelup.blurb.vit'))}
    </div></div>`;
}

export function bannerHTML(id: RuleId, how: 'shrine' | 'mastery' | 'milestone', world: World, L: Lexicon): string {
  const why =
    how === 'mastery' ? 'Earned through mastery' : how === 'milestone' ? 'The world grows deeper' : 'Adopted at a shrine';
  return `<div class="modal banner" role="dialog" aria-label="New rule">
    <span class="eyebrow">${why}</span>
    <p class="new-rule">A new rule</p>
    <h1>${esc(L.rule(id).name)}</h1>${L.ruleGloss(id) ? `<p class="gloss">${esc(L.ruleGloss(id)!)}</p>` : ''}
    <p class="tagline">${esc(L.rule(id).tagline)}</p>
    ${ruleBody(id, world.variants, L)}
    <button class="primary" data-cmd="dismiss"><kbd>Enter</kbd> Continue</button>
  </div>`;
}

export function codexHTML(world: World, L: Lexicon): string {
  const active = RULE_ORDER.filter((r) => world.rules.includes(r));
  // Only name rules that have already shown themselves somewhere this world has reached.
  const front = frontier(new Set(world.rules), { depth: Math.max(1, world.deepest), emergence: world.emergence ?? {}, pool: world.genome?.pool });
  const borrowed = (world.genome?.intrusions ?? []).map((i) => L.t(`intrusion.${i.bundle}`, { donor: PREMISES[i.from].name }));
  const unknown = RULE_ORDER.length - active.length - front.length;
  return `<div class="modal codex" role="dialog" aria-label="Codex">
    <header class="modal-head"><span class="eyebrow">Codex of ${esc(world.name)}</span><h1>The rules of this world</h1>
      <p class="muted premise-name">${esc(premiseLine(world))}</p>
      ${borrowed.length ? `<ul class="borrowed">${borrowed.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</header>
    ${world.rules.includes('peril') ? codexMeansHTML(world, L) : ''}
    ${codexShapeHTML(world, L)}
    <div class="codex-list">${active
      .map((r) => `<article class="codex-entry"><h2>${esc(L.rule(r).name)}${glossHTML(L.ruleGloss(r))} <span class="tier">Tier ${RULES[r].tier}</span></h2>
        <p class="tagline">${esc(L.rule(r).tagline)}</p>${ruleBody(r, world.variants, L)}</article>`)
      .join('')}</div>
    ${front.length ? `<p class="muted">Shrines may offer next: ${esc(front.map((r) => L.rule(r).name).join(', '))}.</p>` : ''}
    ${unknown > 0 ? `<p class="muted">${unknown} more ${unknown === 1 ? 'rule lies' : 'rules lie'} beyond those.</p>` : ''}
    ${world.history.length ? `<h3>Chronicle</h3><ol class="chronicle">${world.history
      .map((h) => `<li${h.won ? ' class="won"' : ''}>${h.won ? '♥ ' : ''}<b>${esc(h.name)}</b>, ${esc(L.role('heir'))} ${h.gen} — ${esc(L.role('level'))} ${h.level}, ${esc(h.cause)} after ${h.turns} turns.</li>`)
      .join('')}</ol>` : ''}
    <footer><button data-cmd="dismiss" class="primary"><kbd>Esc</kbd> Close</button></footer>
  </div>`;
}

export function helpHTML(L: Lexicon = lexiconOf(DEFAULT_PREMISE)): string {
  return `<div class="modal help" role="dialog" aria-label="Keys">
    <header class="modal-head"><h1>Keys</h1></header>
    <dl class="keys">
      <div><dt>Arrows · hjkl yubn · numpad</dt><dd>Move / attack (walk into a foe)</dd></div>
      <div><dt>. · 5 · Space</dt><dd>Wait a turn</dd></div>
      <div><dt>&gt; · &lt; · Enter</dt><dd>Go down / up stairs (Enter takes whichever you're on)</dd></div>
      <div><dt>q / e</dt><dd>${esc(L.t('help.use'))}</dd></div>
      <div><dt>z / x</dt><dd>${esc(L.t('help.abilities'))}</dd></div>
      <div><dt>f</dt><dd>${esc(L.t('help.fire'))}</dd></div>
      <div><dt>g · ,</dt><dd>Pick up what's here</dd></div>
      <div><dt>; · v</dt><dd>Look: inspect any tile (arrows move the cursor, Esc leaves)</dd></div>
      <div><dt>c</dt><dd>Codex</dd></div>
      <div><dt>o</dt><dd>Options</dd></div>
      <div><dt>Tap the map</dt><dd>Step toward that spot; tap yourself to wait. In Look mode, inspect it</dd></div>
      <div><dt>Drag the map</dt><dd>Look around; your next move recenters</dd></div>
      <div><dt>Press and hold the map</dt><dd>Walk there; stops if a foe appears or you're hurt. Any key or tap stops it</dd></div>
    </dl>
    <p class="muted small">${L.t('help.legend')}</p>
    <footer><button data-cmd="dismiss" class="primary"><kbd>Esc</kbd> Close</button></footer>
  </div>`;
}

// ---------------------------------------------------------------------------
// Look card, options, confirmations
// ---------------------------------------------------------------------------

/** `aim`: label for an Aim button (this world's means can be aimed at this tile), or null. */
export function lookCardHTML(info: TileInfo, mode: 'look' | 'hover', aim: string | null = null): string {
  return `<div class="lookcard${mode === 'hover' ? ' hover' : ''}" role="status">
    <p class="lc-title">${esc(info.title)}</p>
    ${info.lines.map((l) => `<p class="lc-line">${esc(l)}</p>`).join('')}
    ${mode === 'look'
      ? `<div class="lc-btns">${aim ? `<button data-cmd="look-fire" class="aim">${esc(aim)} <kbd>F</kbd></button>` : ''}${info.walkable && info.known ? '<button data-cmd="look-walk">Walk here</button>' : ''}<button data-cmd="look" class="ghost">Done <kbd>Esc</kbd></button></div>`
      : ''}
  </div>`;
}

export function optionsHTML(o: Options): string {
  const groups = ['Gameplay', 'Controls', 'Display', 'Testing'] as const;
  const field = (d: OptionDef) => `<fieldset class="opt">
      <legend>${esc(d.label)}</legend>
      <div class="seg" role="radiogroup" aria-label="${esc(d.label)}">${d.choices
        .map((c) => {
          const id = `opt-${d.key}-${c.value}`;
          const on = String(o[d.key]) === c.value;
          return `<input type="radio" id="${id}" name="${d.key}" value="${c.value}" data-opt="${d.key}" ${on ? 'checked' : ''}><label for="${id}">${esc(c.label)}</label>`;
        })
        .join('')}</div>
      <p class="muted small">${esc(d.help)}</p>
    </fieldset>`;
  return `<div class="modal options" role="dialog" aria-label="Options">
    <header class="modal-head"><span class="eyebrow">Saved in this browser</span><h1>Options</h1></header>
    ${groups
      .map((g) => `<section class="opt-group"><h3>${g}</h3>${OPTION_DEFS.filter((d) => d.group === g).map(field).join('')}</section>`)
      .join('')}
    <footer><button data-cmd="dismiss" class="primary"><kbd>Esc</kbd> Done</button></footer>
  </div>`;
}

export function confirmDescendHTML(game: Game, dir: 'up' | 'down'): string {
  const sh = game.run.floor.shrine!;
  const L = game.lex;
  const offered = sh.offers?.length ? ` It offered ${esc(sh.offers.map((r) => L.rule(r).name).join(', '))}.` : ' You haven’t seen what it offers.';
  return `<div class="modal confirm" role="dialog" aria-label="Leave the shrine behind?">
    <header class="modal-head"><span class="eyebrow">${esc(L.t('hud.depth', { n: game.run.depth }))}</span><h1>Leave this ${esc(L.role('floor'))}’s ${esc(L.role('shrine'))} behind?</h1>
    <p class="muted">Once you take the stairs, this shrine is gone.${offered}</p></header>
    <footer class="confirm-btns">
      <button class="primary" data-cmd="stairs-confirmed"><kbd>Enter</kbd> ${dir === 'up' ? 'Climb up anyway' : 'Descend anyway'}</button>
      <button class="ghost" data-cmd="dismiss"><kbd>Esc</kbd> Stay</button>
    </footer>
    <p class="muted small">You can turn this warning off in Options.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Means of Harm and Commerce
// ---------------------------------------------------------------------------

/** One means, as a card or banner body: what it is, and what it costs. */
function meansBody(id: HarmId, L: Lexicon): string {
  const m = L.means(id);
  return `<p class="summary">${esc(m.summary)}</p>
    <p class="up"><b>+</b> ${esc(m.upside)}</p>
    <p class="down"><b>−</b> ${esc(m.downside)}</p>`;
}

/** The sidebar's line on how harm works here, with what you have to harm with. */
function meansHTML(game: Game): string {
  const L = game.lex;
  const p = game.run.player;
  if (!game.harmSettled) return `<p class="means muted small">${esc(L.t('hud.harm.open'))}</p>`;
  const id = game.ctx.harm;
  const m = L.means(id);
  const bits = [`<b>${esc(m.name)}</b>${glossHTML(L.ruleGlossOf(m.name, lexiconOf('plain').means(id).name))}`];
  if (aims(id)) bits.push(`${esc(L.t('preview.range'))} ${game.stats.range}`);
  if (MEANS[id].cost === 'ammo') bits.push(`<span class="ammo${(p.ammo ?? 0) === 0 ? ' out' : ''}">${esc(L.t('hud.ammo'))} ${p.ammo ?? 0}</span>`);
  return `<p class="means small" title="${esc(m.summary)}">${bits.join(' · ')}</p>${tideHTML(game)}`;
}

/** Tide Clock: how long until this floor's next mark. Drift: until the floor next shifts. */
function tideHTML(game: Game): string {
  const f = game.run.floor;
  const drift =
    game.world.genome?.axioms.space === 'drift' && game.has('halls') && !f.solo && !f.caverns
      ? `<p class="means tide small" title="${esc(game.lex.space('drift').summary)}"><b>${esc(game.lex.space('drift').name)}</b>${glossHTML(game.lex.ruleGlossOf(game.lex.space('drift').name, lexiconOf('plain').space('drift').name))} · ${esc(game.lex.t('hud.drift', { n: driftLeft(f.driftClock ?? 0) }))}</p>`
      : '';
  return drift + tideClockHTML(game);
}

function tideClockHTML(game: Game): string {
  if (game.world.genome?.axioms.time !== 'tide') return '';
  const L = game.lex;
  const t = L.time('tide');
  const left = tideLeft(game.run.floor.clock ?? 0);
  const urgent = left === null || left <= 20;
  const line = left === null ? L.t('hud.tide.struck') : L.t('hud.tide', { n: left });
  return `<p class="means tide small${urgent ? ' warn' : ''}" title="${esc(t.summary)}"><b>${esc(t.name)}</b>${glossHTML(L.ruleGlossOf(t.name, lexiconOf('plain').time('tide').name))} · ${esc(line)}</p>`;
}

function codexMeansHTML(world: World, L: Lexicon): string {
  const id = world.genome?.axioms.harm;
  if (!id) return `<section class="codex-axiom"><h2>${esc(L.t('hud.harm'))}</h2><p class="muted">${esc(L.t('hud.harm.open'))}</p></section>`;
  const m = L.means(id);
  return `<section class="codex-axiom"><span class="eyebrow">${esc(L.t('hud.harm'))}</span>
    <h2>${esc(m.name)}${glossHTML(L.ruleGlossOf(m.name, lexiconOf('plain').means(id).name))}</h2><p class="tagline">${esc(m.tagline)}</p>${meansBody(id, L)}</section>`;
}

/** Codex: the world's space and time, and where this Age's Heart lies. */
function codexShapeHTML(world: World, L: Lexicon): string {
  const ax = world.genome?.axioms;
  const plain = lexiconOf('plain');
  const ages = world.ages ?? [];
  const open = (what: string) => `<span class="muted">Unsettled: a ${esc(L.role('schism'))} will decide ${what}.</span>`;
  const space = ax?.space ? L.space(ax.space) : null;
  const time = ax?.time ? L.time(ax.time) : null;
  return `<section class="codex-axiom codex-shape">
    <p><span class="eyebrow">Space</span> ${space ? `<b>${esc(space.name)}</b>${glossHTML(L.ruleGlossOf(space.name, plain.space(ax!.space!).name))} — ${esc(space.summary)}` : open('once the floors open up')}</p>
    <p><span class="eyebrow">Time</span> ${time ? `<b>${esc(time.name)}</b>${glossHTML(L.ruleGlossOf(time.name, plain.time(ax!.time!).name))} — ${esc(time.summary)}` : open('once foes exist')}</p>
    ${world.heart ? `<p><span class="eyebrow">Age ${world.age ?? 1}</span> ${esc(L.t('hud.heart.depth', { n: world.heart }))}</p>` : ''}
    ${ages.length ? `<ol class="ages">${ages.map((a) => `<li>Age ${a.age}: <b>${esc(a.name)}</b>, ${esc(L.role('heir'))} ${a.gen}, after ${a.turns} turns with ${a.rules.length} rules.</li>`).join('')}</ol>` : ''}
  </section>`;
}

/** The banner shown when a world's means becomes known. */
export function axiomBannerHTML(id: HarmId, how: 'rolled' | 'schism', L: Lexicon): string {
  const m = L.means(id);
  return `<div class="modal banner axiom" role="dialog" aria-label="How harm works">
    <span class="eyebrow">${how === 'schism' ? 'Settled for good' : 'This world was always this way'}</span>
    <p class="new-rule">${esc(L.t('hud.harm'))}</p>
    <h1>${esc(m.name)}</h1>
    <p class="tagline">${esc(m.tagline)}</p>
    ${meansBody(id, L)}
    ${aims(id) ? `<p class="muted small">Press <kbd>F</kbd>, tap the <b>${esc(L.t('hud.fire'))}</b> button on the map, or tap a foe in reach. Aim anywhere with Look.</p>` : ''}
    <button class="primary" data-cmd="dismiss"><kbd>Enter</kbd> Continue</button>
  </div>`;
}

/** A schism shrine's question: one card per offered means. */
export function schismHTML(game: Game): string {
  const sc = game.run.floor.schism;
  if (sc?.family === 'space' || sc?.family === 'time') return axiomSchismHTML(game, sc.family, sc.offers);
  const L = game.lex;
  const offers = (sc?.offers ?? []) as HarmId[];
  const cards = offers.map((id, i) => {
    // Each card speaks in the words that means would bring.
    const W = lexiconFor(game.world, L.plain, id);
    const m = W.means(id);
    return `<article class="rule-card schism-card">
      <header><span class="tier">${esc(L.t('hud.harm'))}</span><h2>${esc(m.name)}${glossHTML(L.ruleGlossOf(m.name, lexiconOf('plain').means(id).name))}</h2><p class="tagline">${esc(m.tagline)}</p></header>
      ${meansBody(id, W)}
      <button class="primary" data-cmd="schism" data-harm="${id}"><kbd>${i + 1}</kbd> Choose ${esc(m.name)}</button>
    </article>`;
  });
  return `<div class="modal shrine schism" role="dialog" aria-label="${esc(L.role('schism'))}">
    <header class="modal-head"><span class="eyebrow">${esc(L.t('look.schism'))} · ${esc(L.t('hud.depth', { n: game.run.depth }))}</span>
      <h1>How should harm work in ${esc(game.world.name)}?</h1>
      <p class="muted">This choice is permanent. Every ${esc(L.role('heir'))} who follows lives with it, and it can never be repealed.</p></header>
    <div class="cards">${cards.join('')}</div>
    <footer><button data-cmd="schism" data-harm="" class="ghost"><kbd>Esc</kbd> Not yet — it will ask again</button></footer>
  </div>`;
}

/** A schism shrine for Shape of Space or Flow of Time: one card per option. */
function axiomSchismHTML(game: Game, family: 'space' | 'time', offers: string[]): string {
  const L = game.lex;
  const plain = lexiconOf('plain');
  const label = family === 'space' ? 'Shape of space' : 'Flow of time';
  const words = (id: string) => (family === 'space' ? L.space(id as SpaceId) : L.time(id as TimeId));
  const plainName = (id: string) => (family === 'space' ? plain.space(id as SpaceId) : plain.time(id as TimeId)).name;
  const cards = offers.map((id, i) => {
    const w = words(id);
    return `<article class="rule-card schism-card">
      <header><span class="tier">${esc(label)}</span><h2>${esc(w.name)}${glossHTML(L.ruleGlossOf(w.name, plainName(id)))}</h2><p class="tagline">${esc(w.tagline)}</p></header>
      <p class="summary">${esc(w.summary)}</p>
      <button class="primary" data-cmd="schism" data-harm="${id}"><kbd>${i + 1}</kbd> Choose ${esc(w.name)}</button>
    </article>`;
  });
  const q = family === 'space' ? `What shape should ${game.world.name} take?` : `How should time pass in ${game.world.name}?`;
  return `<div class="modal shrine schism" role="dialog" aria-label="${esc(L.role('schism'))}">
    <header class="modal-head"><span class="eyebrow">${esc(L.t('look.schism'))} · ${esc(L.t('hud.depth', { n: game.run.depth }))}</span>
      <h1>${esc(q)}</h1>
      <p class="muted">This choice is permanent. Every ${esc(L.role('heir'))} who follows lives with it, and it can never be repealed.</p></header>
    <div class="cards">${cards.join('')}</div>
    <footer><button data-cmd="schism" data-harm="" class="ghost"><kbd>Esc</kbd> Not yet — it will ask again</button></footer>
  </div>`;
}

function rerollHTML(game: Game): string {
  const cost = game.rerollCost();
  if (cost === null) return '';
  const L = game.lex;
  const poor = game.run.player.gold < cost;
  return `<button data-cmd="reroll" class="ghost"${poor ? ' disabled' : ''}>${esc(L.t('shrine.reroll.button', { n: cost }))}</button>`;
}

/** A merchant's wares and what you could sell. */
export function shopHTML(game: Game): string {
  const L = game.lex;
  const p = game.run.player;
  const mc = game.run.floor.merchant;
  const stock = mc?.stock ?? [];
  const row = (it: Item, price: number, cmd: 'buy' | 'sell', ok: boolean) => {
    const facts = itemFacts(it, game);
    return `<li class="item kind-${it.kind}"><div class="item-main"><span class="item-name">${esc(itemLabel(it, game.ctx, L))}</span>${glossHTML(L.itemGloss(it))}
      <span class="item-facts">${facts.map(esc).join(' · ')}</span></div>
      <div class="item-btns"><button data-cmd="${cmd}" data-id="${it.id}"${ok ? '' : ' disabled'}>${cmd === 'buy' ? 'Buy' : 'Sell'} · ${esc(L.t('shop.price', { n: price }))}</button></div></li>`;
  };
  const buy = stock.map((it) => row(it, game.priceOf(it), 'buy', p.gold >= game.priceOf(it))).join('');
  const sell = p.inventory.map((it) => row(it, game.sellPriceOf(it), 'sell', true)).join('');
  return `<div class="modal shop" role="dialog" aria-label="${esc(L.role('merchant'))}">
    <header class="modal-head"><span class="eyebrow">${esc(L.t('look.merchant'))} · ${esc(L.t('hud.depth', { n: game.run.depth }))}</span>
      <h1>${esc(L.t('item.currency', { n: p.gold }))}</h1></header>
    <h3>For sale</h3>${buy ? `<ul class="items">${buy}</ul>` : `<p class="muted">${esc(L.t('shop.empty'))}</p>`}
    <h3>Sell</h3>${sell ? `<ul class="items">${sell}</ul>` : '<p class="muted">Nothing to sell.</p>'}
    <footer><button data-cmd="leave-shop" class="primary"><kbd>Esc</kbd> Done</button></footer>
  </div>`;
}

/** A card to read before going on: the start of a run, a world's backstory. */
export function storyHTML(st: { title: string; eyebrow: string; lines: string[]; hint?: string }): string {
  return `<div class="modal story" role="dialog" aria-label="${esc(st.title)}">
    <span class="eyebrow">${esc(st.eyebrow)}</span>
    <h1>${esc(st.title)}</h1>
    ${st.lines.map((l, i) => `<p class="${i === 0 ? 'lede' : ''}">${esc(l)}</p>`).join('')}
    ${st.hint ? `<p class="muted small hint">${esc(st.hint)}</p>` : ''}
    <button class="primary" data-cmd="dismiss"><kbd>Enter</kbd> Begin</button>
  </div>`;
}
