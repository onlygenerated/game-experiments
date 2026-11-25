import './sim.css';
import type { Game } from '../engine/game.ts';
import { randomSeed } from '../engine/world.ts';
import { RULES, RULE_ORDER, emergenceOf } from '../rules/rules.ts';
import { xpNeeded } from '../engine/game.ts';
import { PREMISES } from '../theme/lexicon.ts';
import { tideLeft, driftLeft } from '../rules/axioms.ts';
import type { RuleId } from '../engine/types.ts';
import {
  choices,
  DEFAULT_SETTINGS,
  FAMILY_WORD,
  foeGroups,
  itemText,
  ruleStates,
  shrineState,
  startWorld,
  Tree,
  type BranchNode,
  type Choice,
  type Settings,
} from './driver.ts';
import { ARRIVAL, foeFacts, harmFacts, HAZARDS, KIND, PLAIN, RULE_STATE, SHAPES, TIMES } from './legend.ts';

const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* fine: settings just won't stick */
  }
}

const state = {
  seed: 0,
  plain: true,
  settings: load<Settings>('unfolding.sim.settings', DEFAULT_SETTINGS),
  game: null as unknown as Game,
  tree: null as unknown as Tree,
  /** The rule the graph's detail box shows. */
  focus: null as RuleId | null,
};

function newWorld(seed: number) {
  state.seed = seed >>> 0;
  state.game = startWorld(state.seed, state.plain);
  state.tree = new Tree(state.game);
  state.focus = null;
  render();
}

function chip(kind: keyof typeof KIND, text?: string) {
  const k = KIND[kind];
  return `<span class="chip" style="--c:${k.color}"><b>${k.icon}</b>${esc(text ?? k.name)}</span>`;
}

// ---------------------------------------------------------------------------
// World and character
// ---------------------------------------------------------------------------

function worldPanel(g: Game): string {
  const w = g.world;
  const L = g.lex;
  const ax = w.genome.axioms;
  const p = g.run.player;
  const s = g.stats;
  const premise = PREMISES[w.genome.premise];
  const axiom = (fam: 'harm' | 'space' | 'time') => {
    const v = ax[fam];
    if (!v) {
      const when = fam === 'space' ? 'once Halls arrives' : 'once foes exist';
      return `<dd class="open">${chip('schism', 'Open')} <span class="muted">A schism shrine settles it ${when}.</span></dd>`;
    }
    const words = fam === 'harm' ? L.means(v as never) : fam === 'space' ? L.space(v as never) : L.time(v as never);
    return `<dd><b>${esc(words.name)}</b> <span class="muted">${esc(words.tagline)}</span></dd>`;
  };
  const growth = g.has('growth');
  const bar = (v: number, max: number, cls: string) => `<span class="bar ${cls}"><i style="width:${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%"></i></span>`;
  const stat = (label: string, v: string | number, on = true) => (on ? `<div><dt>${label}</dt><dd>${esc(v)}</dd></div>` : '');
  const potions = p.inventory.filter((i) => i.kind === 'potion').length;
  const arrivals = state.tree.path().flatMap((n) => n.outcome?.arrivals ?? []);
  const how = new Map(arrivals.map((a) => [a.rule, a.how]));
  return `
    <section class="panel world">
      <p class="eyebrow">${esc(premise.name)} · seed ${state.seed}</p>
      <h2>${esc(w.name)}</h2>
      <dl class="axioms">
        <dt>Means of Harm</dt>${axiom('harm')}
        <dt>Shape of Space</dt>${axiom('space')}
        <dt>Flow of Time</dt>${axiom('time')}
        <dt>The Heart</dt><dd>Depth ${w.heart ?? '?'}${(w.age ?? 1) > 1 ? ` <span class="muted">(Age ${w.age})</span>` : ''}</dd>
      </dl>
      <h3>Rules, in the order they came</h3>
      ${w.rules.length ? `<ol class="rulelist">${w.rules.map((r) => `<li><b>${esc(L.rule(r).name)}</b>${w.variants[r] === 'alt' ? ` <span class="alt">${esc(L.rule(r).variant.name)}</span>` : ''} <span class="muted">${esc(ARRIVAL[how.get(r) ?? 'shrine'].name)}</span></li>`).join('')}</ol>` : '<p class="muted">None yet. The first shrine is on depth 1.</p>'}
    </section>
    <section class="panel hero">
      <p class="eyebrow">Heir ${g.run.gen} · depth ${g.run.depth} · turn ${g.run.turn}</p>
      <h2>${esc(p.name)}</h2>
      <div class="meter"><span>HP ${g.run.over ? 0 : p.hp}/${s.maxHp}</span>${bar(g.run.over ? 0 : p.hp, s.maxHp, 'hp')}</div>
      ${s.maxMana ? `<div class="meter"><span>Mana ${p.mana}/${s.maxMana}</span>${bar(p.mana, s.maxMana, 'mana')}</div>` : ''}
      ${g.has('hunger') ? `<div class="meter"><span>Satiety ${p.satiety}</span>${bar(p.satiety, 500, 'food')}</div>` : ''}
      ${growth ? `<div class="meter"><span>Level ${p.level} · XP ${p.xp}/${xpNeeded(p.level, g.ctx)}</span>${bar(p.xp, xpNeeded(p.level, g.ctx), 'xp')}</div>` : ''}
      <dl class="stats">
        ${stat('Attack', s.attack)}${stat('Defense', s.defense)}
        ${stat('Hit', `${Math.round(s.hit * 100)}%`, growth)}${stat('Foes hit', `${Math.round(s.enemyHit * 100)}%`, growth)}
        ${stat('STR', p.str, growth)}${stat('AGI', p.agi, growth)}${stat('VIT', p.vit, growth)}
        ${stat('Reach', s.range, s.range > 1)}${stat('Sight', s.sight === Infinity ? 'all' : s.sight, s.sight !== Infinity)}
        ${stat('Shots', p.ammo ?? 0, g.ctx.harm === 'volley' && g.has('peril'))}
        ${stat('Currency', p.gold, g.has('things'))}${stat('Healing', potions, g.has('things'))}
        ${stat('Kills', p.kills, g.has('peril'))}
      </dl>
      ${g.has('arms') ? `<p class="gear">Weapon: <b>${p.weapon ? esc(itemText(g, p.weapon)) : 'none'}</b><br>Armour: <b>${p.armor ? esc(itemText(g, p.armor)) : 'none'}</b></p>` : ''}
    </section>
    <section class="panel auto">
      <h3>Autopilot</h3>
      <p class="muted small">Choices walk for you, turn by turn. These decide what happens on the way.</p>
      <label><input type="checkbox" id="set-defend" ${state.settings.defend ? 'checked' : ''}> Fight back when a foe reaches you</label>
      <label>Use healing below <select id="set-heal">${[0, 0.25, 0.35, 0.5].map((v) => `<option value="${v}" ${state.settings.healBelow === v ? 'selected' : ''}>${v ? `${v * 100}% HP` : 'never'}</option>`).join('')}</select></label>
      <label>Pause below <select id="set-pause">${[0, 0.2, 0.3, 0.5].map((v) => `<option value="${v}" ${state.settings.pauseBelow === v ? 'selected' : ''}>${v ? `${v * 100}% HP` : 'never'}</option>`).join('')}</select></label>
    </section>`;
}

// ---------------------------------------------------------------------------
// The floor and the choices
// ---------------------------------------------------------------------------

function floorPanel(g: Game): string {
  const f = g.run.floor;
  const L = g.lex;
  const space = f.solo ? 'solo' : f.caverns ? 'caverns' : g.ctx.space === 'drift' && g.has('halls') ? 'drift' : 'rooms';
  const shape = SHAPES[space];
  const tags: string[] = [`<span class="tag" title="${esc(shape.text)}">${shape.icon} ${shape.name}</span>`];
  if (space === 'drift') tags.push(`<span class="tag">Shifts in ${driftLeft(f.driftClock ?? 0)} turns</span>`);
  if (g.ctx.time === 'tide' && g.has('peril')) {
    const left = tideLeft(f.clock ?? 0);
    tags.push(`<span class="tag warn" title="${esc(TIMES.tide.text)}">${TIMES.tide.icon} Tide stage ${f.tide ?? 0}/3${left !== null ? `, next in ${left}` : ''}</span>`);
  }
  if (g.has('darkness')) tags.push(`<span class="tag">◐ Dark: sight ${g.stats.sight}</span>`);

  const rows: string[] = [];
  for (const grp of foeGroups(g)) {
    const look = PLAIN.foe(grp.kind);
    const m = grp.foes[0];
    rows.push(`<li>${chip('fight', `${grp.foes.length} ${grp.foes.length === 1 ? look.name : look.plural}`)}<span class="muted">${m.maxHp} HP, atk ${m.atk}, def ${m.def}, ${m.xp} XP${grp.foes.some((x) => x.aware) ? ' · some have noticed you' : ''}</span>${state.plain ? '' : `<span class="themed">${esc(L.foe(grp.kind).plural)}</span>`}</li>`);
  }
  if (g.run.items.length) {
    const counts = new Map<string, number>();
    for (const fi of g.run.items) {
      const k = fi.item.kind === 'gold' ? 'currency' : fi.item.kind === 'ammo' ? 'shots' : itemText(g, fi.item);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    rows.push(`<li>${chip('items', `${g.run.items.length} items`)}<span class="muted">${esc([...counts].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', '))}</span></li>`);
  }
  const sh = shrineState(g);
  if (sh !== 'none') {
    const t = { open: 'Unanswered', used: 'Answered', dark: 'Dark: left behind', silent: 'Silent: nothing to offer yet' }[sh];
    rows.push(`<li>${chip('shrine')}<span class="muted">${t}</span></li>`);
  }
  if (f.schism) {
    const fam = f.schism.family ?? 'harm';
    rows.push(`<li>${chip('schism')}<span class="muted">${g.schismOpen(f.schism) ? `Asks: ${FAMILY_WORD[fam]}` : 'Answered'}</span></li>`);
  }
  if (f.merchant && g.has('commerce')) rows.push(`<li>${chip('merchant')}<span class="muted">${f.merchant.stock.length} for sale</span></li>`);
  if (g.has('elements')) {
    const v = Object.values(f.glimmer);
    const hot = v.filter((e) => e === 'ember').length;
    if (v.length) rows.push(`<li><span class="chip" style="--c:var(--ember)"><b>▲</b>${hot} hot · ${v.length - hot} cold stones</span></li>`);
  }
  const graves = g.floorGraves().filter((gr) => !gr.looted).length;
  if (graves) rows.push(`<li>${chip('death', `${graves} grave${graves > 1 ? 's' : ''}`)}<span class="muted">Earlier heirs fell here.</span></li>`);
  rows.push(`<li>${chip(f.heart ? 'heart' : 'stairs')}<span class="muted">${f.heart ? 'This is the deepest floor of the Age.' : `Down to depth ${g.run.depth + 1}`}</span></li>`);

  return `
    <header class="floorhead">
      <div><p class="eyebrow">Now</p><h2>Depth ${g.run.depth}${!state.plain && L.floorName(g.world.seed, g.run.depth) ? ` <span class="themed">${esc(L.floorName(g.world.seed, g.run.depth)!)}</span>` : ''}</h2></div>
      <div class="tags">${tags.join('')}</div>
    </header>
    <ul class="contents">${rows.join('')}</ul>`;
}

function pendingTitle(g: Game): string {
  const run = g.run;
  if (run.over) return run.won ? 'The Age is over' : `Dead: ${run.cause ?? ''}`;
  switch (run.pending?.kind) {
    case 'shrine':
      return 'Rule shrine: draft one';
    case 'schism':
      return `Schism shrine: settle ${FAMILY_WORD[run.floor.schism?.family ?? 'harm']}`;
    case 'levelup':
      return `Level ${run.player.level}: raise one stat`;
    case 'shop':
      return 'At the merchant';
    default:
      return 'What next?';
  }
}

function choiceCard(c: Choice, i: number, g: Game): string {
  const k = KIND[c.kind];
  const pv = c.preview;
  const diff = pv?.changes.length
    ? `<ul class="diff">${pv.changes.map((d) => `<li class="${d.good ? 'good' : 'bad'}">${esc(d.label)} ${esc(d.from)} → <b>${esc(d.to)}</b></li>`).join('')}</ul>`
    : '';
  const notes = pv?.notes.length ? `<ul class="notes">${pv.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const unlocks = c.unlocks?.length ? `<p class="unlocks">Opens the way to ${c.unlocks.map((r) => `<span>${esc(g.lex.rule(r).name)}</span>`).join(' ')}</p>` : '';
  const variant = c.intent.kind === 'draft' && c.intent.rule && g.world.variants[c.intent.rule] === 'alt' ? `<p class="unlocks">This world rolls it as <span class="alt">${esc(g.lex.rule(c.intent.rule).variant.name)}</span></p>` : '';
  return `<button class="choice" data-choice="${i}" style="--c:${k.color}" ${c.disabled ? 'disabled' : ''}>
    <span class="icon">${k.icon}</span>
    <span class="body"><b>${esc(c.label)}</b>${c.detail ? `<span class="detail">${esc(c.detail)}</span>` : ''}${diff}${notes}${variant}${unlocks}</span>
  </button>`;
}

function outcomePanel(n: BranchNode, g: Game): string {
  const o = n.outcome;
  if (!o) return '';
  const bits: string[] = [];
  if (o.turns) bits.push(`${o.turns} turn${o.turns > 1 ? 's' : ''}`);
  if (o.hpTo !== o.hpFrom) bits.push(`<span class="${o.hpTo < o.hpFrom ? 'bad' : 'good'}">HP ${o.hpFrom} → ${o.hpTo}</span>`);
  if (o.kills) bits.push(`${o.kills} defeated`);
  for (const a of o.arrivals) bits.push(`<span class="arrive">${esc(ARRIVAL[a.how].name)}: ${esc(g.lex.rule(a.rule).name)}</span>`);
  if (o.interrupted) bits.push('<span class="warn">Stopped for a decision</span>');
  const lines = o.lines.filter((l) => !/^Press /.test(l.text));
  return `<section class="panel outcome">
    <h3>${KIND[n.kind].icon} ${esc(n.label)}</h3>
    ${bits.length ? `<p class="summary">${bits.join(' · ')}</p>` : ''}
    ${lines.length ? `<details ${lines.length <= 8 ? 'open' : ''}><summary>What happened (${lines.length} lines)</summary><ol class="log">${lines.map((l) => `<li class="${esc(l.tone)}">${esc(l.text)}</li>`).join('')}</ol></details>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// The rule graph: every branch the rulebook could take from here
// ---------------------------------------------------------------------------

const COLS: RuleId[][] = [
  ['halls', 'peril', 'things'],
  ['growth', 'arms'],
  ['darkness', 'bestiary', 'commerce', 'hunger', 'durability', 'weight', 'elements'],
  ['arcana'],
];
const NW = 96;
const NH = 34;
const GX = 132;
const GY = 44;
const H = 7 * GY;

function graphPos(): Record<RuleId, { x: number; y: number }> {
  const pos = {} as Record<RuleId, { x: number; y: number }>;
  COLS.forEach((col, c) => {
    const top = (H - col.length * GY) / 2;
    col.forEach((id, r) => (pos[id] = { x: 8 + c * GX, y: top + r * GY + 4 }));
  });
  // Arcana sits level with Growth, its one prerequisite.
  pos.arcana.y = pos.growth.y;
  return pos;
}

function ruleGraph(g: Game): string {
  const st = ruleStates(g);
  const pos = graphPos();
  const L = g.lex;
  const edges: string[] = [];
  for (const id of RULE_ORDER) {
    for (const pre of RULES[id].prereqs) {
      const a = pos[pre];
      const b = pos[id];
      const x1 = a.x + NW;
      const y1 = a.y + NH / 2;
      const x2 = b.x;
      const y2 = b.y + NH / 2;
      const live = st[pre] === 'adopted';
      // Arcana's edge skips over the third column: route it above.
      const d = id === 'arcana' ? `M${x1},${y1} C${x1 + 30},${y1 - 26} ${x2 - 30},${y2 - 26} ${x2},${y2}` : `M${x1},${y1} C${x1 + 18},${y1} ${x2 - 18},${y2} ${x2},${y2}`;
      edges.push(`<path d="${d}" class="edge ${live ? 'live' : ''}" />`);
    }
  }
  const nodes = RULE_ORDER.map((id) => {
    const p = pos[id];
    const s = st[id];
    const sub =
      s === 'waiting' ? `from depth ${emergenceOf(g.world, id)}`
      : s === 'imposed' ? `arrives d${emergenceOf(g.world, id)}`
      : s === 'locked' ? `needs ${RULES[id].prereqs.filter((r) => !g.world.rules.includes(r)).map((r) => L.rule(r).name).join(', ')}`
      : RULE_STATE[s].name;
    const name = L.rule(id).name;
    return `<g class="node ${s} ${state.focus === id ? 'focus' : ''}" data-rule="${id}" tabindex="0" role="button" aria-label="${esc(`${name}: ${RULE_STATE[s].name}`)}">
      <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="6" />
      <text x="${p.x + 8}" y="${p.y + 14}" class="nm">${esc(name.length > 13 ? `${name.slice(0, 12)}…` : name)}${g.world.variants[id] === 'alt' ? ' *' : ''}</text>
      <text x="${p.x + 8}" y="${p.y + 27}" class="sb">${esc(sub.length > 17 ? `${sub.slice(0, 16)}…` : sub)}</text>
    </g>`;
  }).join('');
  const W = 8 + 3 * GX + NW + 8;
  const focus = state.focus;
  let detail = '<p class="muted small">Tap a rule to see what it does. <b>*</b> marks a rule this world rolls in its variant form.</p>';
  if (focus) {
    const r = L.rule(focus);
    const def = RULES[focus];
    detail = `<div class="ruledetail">
      <h4>${esc(r.name)} <span class="muted">Tier ${def.tier} · ${esc(RULE_STATE[st[focus]].name)}</span></h4>
      <p>${esc(r.summary)}</p>
      <p><span class="good">+</span> ${esc(r.upside)}<br><span class="bad">−</span> ${esc(r.downside)}</p>
      <p class="muted small">Needs: ${def.prereqs.length ? def.prereqs.map((x) => esc(L.rule(x).name)).join(', ') : 'nothing'}. Emerges at depth ${emergenceOf(g.world, focus)}.${def.group ? ' Exclusive.' : ''}${g.world.variants[focus] === 'alt' ? ` This world rolls it as <b>${esc(r.variant.name)}</b>: ${esc(r.variant.text)}` : ''}</p>
    </div>`;
  }
  return `<section class="panel graph">
    <h3>Rulebook branches</h3>
    <div class="svgwrap"><svg viewBox="0 0 ${W} ${H + 8}" style="max-width:${W}px" role="img" aria-label="Rule graph">${edges.join('')}${nodes}</svg></div>
    <div class="statekey">${(['adopted', 'offered', 'available', 'waiting', 'imposed', 'locked'] as const).map((s) => `<span class="sk ${s}"><i></i>${RULE_STATE[s].name}</span>`).join('')}</div>
    ${detail}
  </section>`;
}

// ---------------------------------------------------------------------------
// The branch tree: every choice you've tried, and where you are
// ---------------------------------------------------------------------------

function treePanel(): string {
  const t = state.tree;
  const onPath = new Set(t.path().map((n) => n.id));
  const branches = [...t.nodes.values()].filter((n) => n.children.length > 1).length;
  const row = (n: BranchNode) => {
    const k = KIND[n.kind];
    const cls = `${n.id === t.current ? 'current' : ''} ${onPath.has(n.id) ? 'onpath' : ''}`;
    return `<button class="tnode ${cls}" data-node="${n.id}" style="--c:${k.color}"><b>${k.icon}</b><span>${esc(n.label)}</span><em>d${n.depth} · ${n.over ? (n.won ? 'won' : 'dead') : `${n.hp} HP`}</em></button>`;
  };
  // Long single-child runs stay flat; a fork indents its branches.
  const walk = (id: number): string => {
    let n = t.node(id);
    let html = `<li>${row(n)}`;
    while (n.children.length === 1) {
      n = t.node(n.children[0]);
      html += row(n);
    }
    if (n.children.length > 1) html += `<ul class="fork">${n.children.map((c) => walk(c)).join('')}</ul>`;
    return `${html}</li>`;
  };
  return `<section class="panel tree">
    <h3>Your branches <span class="muted">${t.nodes.size} steps · ${branches} fork${branches === 1 ? '' : 's'}</span></h3>
    <p class="muted small">Tap any step to go back to that moment and choose differently. The game is seeded, so the same choice always plays out the same way.</p>
    <ul class="treeroot">${walk(0)}</ul>
  </section>`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function legend(): string {
  const kinds = (Object.keys(KIND) as (keyof typeof KIND)[]).filter((k) => k !== 'start');
  return `<section class="legend" id="legend">
    <h2>Legend</h2>
    <p class="muted">Every icon and colour means the same thing everywhere on this page. Names are the plain words (the game's Plain labels option), so they say what a thing does; turn on <b>World's own words</b> to see this world's costume.</p>
    <div class="lgrid">
      <div class="lcard"><h3>Choices and moments</h3><dl>${kinds.map((k) => `<div><dt>${chip(k)}</dt><dd>${esc(KIND[k].text)}</dd></div>`).join('')}</dl></div>
      <div class="lcard wide"><h3>Battle types (Means of Harm)</h3><p class="muted small">Each world fights one way, rolled at creation or settled at a schism shrine. Until then you strike.</p>
        <table><thead><tr><th>Means</th><th>Reach</th><th>Cost</th><th>Bump</th><th>Power</th></tr></thead><tbody>
        ${harmFacts().map((h) => `<tr><th><b>${esc(h.name)}</b><br><span class="muted">${esc(h.tagline)}</span></th><td>${esc(h.reach)}</td><td>${esc(h.cost)}</td><td>${esc(h.bump)}</td><td>${esc(h.power)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="lcard"><h3>Foe types</h3><p class="muted small">Base numbers at depth 1. Deeper foes gain HP and attack.</p>
        <table><thead><tr><th>Foe</th><th>HP</th><th>Atk</th><th>Def</th><th>XP</th><th>Appears</th></tr></thead><tbody>
        ${foeFacts().map((f) => `<tr><th><span class="glyph" style="color:${f.color}">${esc(f.glyph)}</span> ${esc(f.name)}<br><span class="muted">${esc(f.trait)}</span></th><td>${f.hp}</td><td>${f.atk}</td><td>${f.def}</td><td>${f.xp}</td><td>${esc(f.from)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="lcard"><h3>How rules arrive</h3><dl>${(Object.keys(ARRIVAL) as (keyof typeof ARRIVAL)[]).map((k) => `<div><dt><span class="arrive">${esc(ARRIVAL[k].name)}</span></dt><dd>${esc(ARRIVAL[k].text)}</dd></div>`).join('')}</dl>
        <h3>Rule states in the graph</h3><dl>${(Object.keys(RULE_STATE) as (keyof typeof RULE_STATE)[]).map((k) => `<div><dt><span class="sk ${k}"><i></i>${esc(RULE_STATE[k].name)}</span></dt><dd>${esc(RULE_STATE[k].text)}</dd></div>`).join('')}</dl></div>
      <div class="lcard"><h3>Floors and time</h3><dl>
        ${Object.values(SHAPES).map((s) => `<div><dt><span class="tag">${s.icon} ${esc(s.name)}</span></dt><dd>${esc(s.text)}</dd></div>`).join('')}
        ${Object.values(TIMES).map((s) => `<div><dt><span class="tag">${s.icon} ${esc(s.name)}</span></dt><dd>${esc(s.text)}</dd></div>`).join('')}
      </dl><h3>Hazards</h3><dl>${HAZARDS.map((h) => `<div><dt><span class="chip" style="--c:${h.color}"><b>${h.icon}</b>${esc(h.name)}</span></dt><dd>${esc(h.text)}</dd></div>`).join('')}</dl></div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------

let current: Choice[] = [];

function render() {
  const g = state.game;
  const node = state.tree.node();
  current = choices(g);
  $('#world').innerHTML = worldPanel(g);
  $('#now').innerHTML = `
    <section class="panel floor">${floorPanel(g)}</section>
    <section class="panel choices">
      <h3>${esc(pendingTitle(g))}</h3>
      <div class="clist">${current.map((c, i) => choiceCard(c, i, g)).join('')}</div>
    </section>
    ${outcomePanel(node, g)}`;
  $('#branches').innerHTML = ruleGraph(g) + treePanel();
  $<HTMLInputElement>('#seed').value = String(state.seed);
  $<HTMLInputElement>('#plain').checked = !state.plain;
  // Keep the current step in view inside the tree's own scroller, without moving the page.
  const root = document.querySelector<HTMLElement>('.treeroot');
  const cur = document.querySelector<HTMLElement>('.tnode.current');
  if (root && cur) {
    const r = root.getBoundingClientRect();
    const c = cur.getBoundingClientRect();
    if (c.top < r.top || c.bottom > r.bottom) root.scrollTop += c.top - r.top - root.clientHeight / 2;
  }
}

function choose(i: number) {
  const c = current[i];
  if (!c || c.disabled) return;
  const { game } = state.tree.choose(c.intent, state.plain, state.settings);
  state.game = game;
  render();
}

function wire() {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const ch = t.closest<HTMLElement>('[data-choice]');
    if (ch) return choose(Number(ch.dataset.choice));
    const nd = t.closest<HTMLElement>('[data-node]');
    if (nd) {
      state.game = state.tree.goto(Number(nd.dataset.node), state.plain);
      return render();
    }
    const rl = t.closest<SVGElement>('[data-rule]');
    if (rl) {
      const id = rl.dataset.rule as RuleId;
      state.focus = state.focus === id ? null : id;
      return render();
    }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.dataset?.rule) {
      e.preventDefault();
      state.focus = t.dataset.rule as RuleId;
      render();
      return;
    }
    if (t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) choose(n - 1);
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'set-defend') state.settings.defend = t.checked;
    if (t.id === 'set-heal') state.settings.healBelow = Number(t.value);
    if (t.id === 'set-pause') state.settings.pauseBelow = Number(t.value);
    if (t.id.startsWith('set-')) save('unfolding.sim.settings', state.settings);
    if (t.id === 'plain') {
      state.plain = !t.checked;
      state.game = state.tree.goto(state.tree.current, state.plain);
      render();
    }
  });
  $('#seedform').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = Number($<HTMLInputElement>('#seed').value);
    if (Number.isFinite(v)) newWorld(v);
  });
  $('#random').addEventListener('click', () => newWorld(randomSeed()));
}

document.getElementById('app')!.innerHTML = `
  <header class="top">
    <div class="brand"><h1>Unfolding <span>Branch simulator</span></h1><p>Step through a real world's choices without walking it. Every choice runs the actual game.</p></div>
    <form id="seedform" class="controls">
      <label for="seed">World seed</label>
      <input id="seed" inputmode="numeric" autocomplete="off">
      <button type="submit">Open world</button>
      <button type="button" id="random">Random world</button>
      <label class="toggle"><input type="checkbox" id="plain"> World's own words</label>
      <a href="#legend">Legend</a>
      <a href="https://onlygenerated.github.io/game-experiments/unfolding/">Play the game</a>
    </form>
  </header>
  <main class="layout">
    <aside id="world"></aside>
    <div id="now"></div>
    <aside id="branches"></aside>
  </main>
  ${legend()}`;
wire();
newWorld(randomSeed());

// For poking at from the console and for the smoke test.
(window as unknown as { sim: typeof state }).sim = state;
