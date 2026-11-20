import { article, Game, type Action, type GameEvent } from '../engine/game.ts';
import { canTravelTo, nearbyThreats, travelStep } from '../engine/travel.ts';
import { T_UP, type Pos } from '../engine/types.ts';
import type { RuleId, World } from '../engine/types.ts';
import { defaultKV, heirName, newWorld, randomSeed, Store } from '../engine/world.ts';
import { repealable, RULE_ORDER } from '../rules/rules.ts';
import { lexiconFor } from '../theme/lexicon.ts';
import { describeTile } from './describe.ts';
import { aims, type HarmId } from '../rules/harm.ts';
import {
  axiomBannerHTML,
  bannerHTML,
  codexHTML,
  confirmDescendHTML,
  esc,
  glossHTML,
  helpHTML,
  levelupHTML,
  logHTML,
  lookCardHTML,
  optionsHTML,
  premiseLine,
  schismHTML,
  shopHTML,
  shrineHTML,
  storyHTML,
  sidebarHTML,
  topbarHTML,
} from './hud.ts';
import { HOLD_MS, loadOptions, parseOption, saveOptions, TILE_PX, TRAVEL_STEP_MS, type Options } from './options.ts';
import { COLORS, Renderer } from './render.ts';

type Overlay =
  | { kind: 'banner'; rule: RuleId; how: 'shrine' | 'mastery' | 'milestone' }
  | { kind: 'axiom'; harm: HarmId; how: 'rolled' | 'schism' }
  | { kind: 'story'; title: string; eyebrow: string; lines: string[]; hint?: string }
  | { kind: 'codex' }
  | { kind: 'help' }
  | { kind: 'options' }
  | { kind: 'confirm-stairs'; dir: 'up' | 'down' };

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0], y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '8': [0, -1], '2': [0, 1], '4': [-1, 0], '6': [1, 0], '7': [-1, -1], '9': [1, -1], '1': [-1, 1], '3': [1, 1],
  Home: [-1, -1], PageUp: [1, -1], End: [-1, 1], PageDown: [1, 1],
};

export class App {
  root: HTMLElement;
  store = new Store(defaultKV());
  game: Game | null = null;
  renderer: Renderer | null = null;
  overlays: Overlay[] = [];
  fresh = new Set<string>();
  private lastKey = 0;
  private resizeObs: ResizeObserver | null = null;
  private deathTimer = 0;
  private drawQueued = false;
  private drag: {
    id: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    moved: boolean;
    /** Long-press timer; when it fires the press becomes a travel order instead of a tap. */
    hold: number;
    held: boolean;
    /** This press only stopped a journey in progress; it shouldn't also act. */
    stopper: boolean;
  } | null = null;
  /** Auto-travel in progress: where to, and which nearby foes we've already accounted for. */
  private travel: { target: Pos; timer: number; known: Set<number> } | null = null;
  options: Options;
  /** Look mode: the tile under the inspection cursor. */
  look: Pos | null = null;
  /** Mouse hover inspection (when Look mode is off). */
  private hover: Pos | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.options = loadOptions(this.store.kv);
    this.applyOptions();
    window.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onOptionChange(e));
    document.fonts?.ready.then(() => this.draw());
    this.title();
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------

  title() {
    this.teardownPlay();
    const worlds = this.store.worlds();
    const cards = worlds
      .map((w) => {
        const run = this.store.run(w.id);
        const rules = RULE_ORDER.filter((r) => w.rules.includes(r));
        const L = lexiconFor(w, this.options.plainLabels);
        return `<li class="world-card">
          <div class="wc-head"><h3>${esc(w.name)}</h3><span class="premise-name">${esc(premiseLine(w))}</span><span class="muted small">Age ${w.generation} · deepest ${w.deepest || '—'} · ${esc(L.t(w.graves.length === 1 ? 'screen.graves.one' : 'screen.graves.many', { n: w.graves.length }))}</span></div>
          <div class="chips">${rules.length ? rules.map((r) => `<span class="chip">${esc(L.rule(r).name)}</span>`).join('') : '<span class="muted small">No rules yet</span>'}</div>
          <div class="wc-btns">
            ${run && !run.over ? `<button class="primary" data-cmd="resume" data-world="${w.id}">${esc(L.t('screen.resume', { name: run.player.name, n: run.depth }))}</button>` : `<button class="primary" data-cmd="heir" data-world="${w.id}">New heir</button>`}
            <button class="ghost danger" data-cmd="delete-world" data-world="${w.id}">Forget world</button>
          </div></li>`;
      })
      .join('');
    this.root.innerHTML = `<div class="screen title-screen">
      <header class="hero">
        <h1 class="logo">Unfolding</h1>
        <p class="lede">A dungeon that starts almost too simple, and writes its own rules as you go.
          You choose which rules each world adopts. Every rule cuts both ways.</p>
      </header>
      <div class="title-cols">
        <section class="start-new">
          <h2>New world</h2>
          <p class="muted">Start from nothing: one quiet room, a shrine, stairs down. The world rolls its own variants of every rule, and when each one first shows itself.</p>
          <button class="primary big" data-cmd="new-world">Begin a new world</button>
          <button class="ghost" data-cmd="options">Options</button>
        </section>
        <section class="continue">
          <h2>Your worlds</h2>
          ${worlds.length ? `<p class="muted">Send a new heir into a world you’ve shaped. They inherit every rule, may repeal one, and can find the graves of those before them.</p><ul class="worlds">${cards}</ul>` : '<p class="muted">None yet. Worlds you create are saved in this browser.</p>'}
        </section>
      </div>
      <div class="overlay" hidden></div></div>`;
  }

  /** Briefing for a new heir in an existing world: inherited rules, one optional repeal. */
  heir(world: World) {
    this.teardownPlay();
    const gen = world.generation + 1;
    const name = heirName(world, gen);
    const active = new Set(world.rules);
    const canRepeal = repealable(active);
    const rules = RULE_ORDER.filter((r) => active.has(r));
    const L = lexiconFor(world, this.options.plainLabels);
    if (!rules.length && !world.history.length) {
      this.begin(world, null);
      return;
    }
    const last = world.history[world.history.length - 1];
    this.root.innerHTML = `<div class="screen heir-screen">
      <span class="eyebrow">${esc(world.name)} · ${esc(premiseLine(world))} · age ${world.generation}</span>
      <h1>${esc(name)}, ${esc(L.role('heir'))} ${gen}</h1>
      ${last ? `<p class="lede">${esc(L.t('screen.fell', { name: last.name, cause: last.cause }))}</p>` : ''}
      ${rules.length ? `<h2>The rules you inherit</h2>
      <p class="muted">You may repeal one — only a rule nothing else depends on. A repealed rule leaves the world and can be offered again at shrines.</p>
      <form class="repeal" id="repeal-form">
        <label class="repeal-opt keep"><input type="radio" name="repeal" value="" checked> <span><b>Keep every rule</b></span></label>
        ${rules
          .map((r) => {
            const ok = canRepeal.includes(r);
            return `<label class="repeal-opt${ok ? '' : ' locked'}"><input type="radio" name="repeal" value="${r}" ${ok ? '' : 'disabled'}>
              <span><b>${esc(L.rule(r).name)}</b>${glossHTML(L.ruleGloss(r))}${world.variants[r] === 'alt' ? ` <span class="variant-tag">✦ ${esc(L.rule(r).variant.name)}</span>` : ''}
              <span class="muted small">${esc(L.rule(r).summary)}${ok ? '' : ` — others depend on it`}</span></span></label>`;
          })
          .join('')}
      </form>` : '<p class="muted">This world still has no rules.</p>'}
      <div class="heir-btns"><button class="primary big" data-cmd="begin" data-world="${world.id}">Descend as ${esc(name)}</button>
      <button class="ghost" data-cmd="title">Back</button></div>
    </div>`;
  }

  begin(world: World, repeal: RuleId | null) {
    if (repeal && repealable(new Set(world.rules)).includes(repeal)) {
      world.rules = world.rules.filter((r) => r !== repeal);
    }
    const game = Game.start(world, this.options.plainLabels);
    if (repeal) game.log(game.lex.t('rule.repealed', { rule: game.lex.rule(repeal).name }), 'rule');
    this.play(game);
    this.save();
  }

  play(game: Game) {
    this.game = game;
    this.overlays = [];
    this.fresh.clear();
    this.look = null;
    this.hover = null;
    game.autoPickup = this.options.autoPickup;
    this.root.innerHTML = `<div class="screen play-screen">
      <header class="topbar"></header>
      <main class="board"><canvas aria-label="Dungeon map"></canvas>
        <button class="recenter" data-cmd="recenter" hidden>⌖ Center on ${esc(game.run.player.name)}</button>
        <div class="toasts" aria-hidden="true"></div>
        <button data-cmd="fire" class="fire-fab" hidden></button>
        <div class="lookslot"></div></main>
      <section class="log" aria-live="polite"></section>
      <nav class="pad" aria-label="Controls">
        <div class="dpad">
          ${[[-1, -1, '↖'], [0, -1, '↑'], [1, -1, '↗'], [-1, 0, '←'], [0, 0, '·'], [1, 0, '→'], [-1, 1, '↙'], [0, 1, '↓'], [1, 1, '↘']]
            .map(([dx, dy, l]) => (dx === 0 && dy === 0 ? `<button data-cmd="wait" aria-label="Wait">${l}</button>` : `<button data-cmd="move" data-dx="${dx}" data-dy="${dy}" aria-label="Move">${l}</button>`))
            .join('')}
        </div>
        <div class="pad-actions">
          <button data-cmd="stairs" class="pad-stairs">Descend</button>
          <button data-cmd="wait">Wait</button>
          <button data-cmd="pickup" class="pad-pickup" disabled>Pick up</button>
          <button data-cmd="look" class="pad-look" aria-pressed="false">Look</button>
          <button data-cmd="fire" class="pad-fire" hidden></button>
        </div>
      </nav>
      <aside class="side"></aside>
      <div class="overlay" hidden></div>
    </div>`;
    const board = this.root.querySelector<HTMLElement>('.board')!;
    const canvas = board.querySelector('canvas')!;
    this.renderer = new Renderer(canvas);
    this.bindMapGestures(canvas, board);
    this.resizeObs = new ResizeObserver(() => this.layout());
    this.resizeObs.observe(board);
    this.applyOptions();
    this.layout();
    // A new run opens with its story; a resumed one has nothing waiting.
    this.consumeEvents(game.events.splice(0));
    this.refresh();
  }

  /**
   * Flash a line over the map for a moment (kills, level-ups, finds). It's in
   * the log as well; this is just so the good parts aren't missed.
   */
  toast(text: string, tone: string, big = false) {
    const layer = this.root.querySelector<HTMLElement>('.toasts');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `toast tone-${tone}${big ? ' big' : ''}`;
    el.textContent = text;
    layer.appendChild(el);
    while (layer.children.length > 3) layer.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), big ? 2600 : 2100);
  }

  death() {
    const game = this.game!;
    this.save();
    const run = game.run;
    const p = run.player;
    const w = game.world;
    this.teardownPlay();
    this.root.innerHTML = `<div class="screen death-screen">
      <span class="eyebrow">${esc(w.name)} · ${esc(game.lex.role('heir'))} ${run.gen}</span>
      <h1>${esc(p.name)} is dead</h1>
      <p class="lede">${esc(run.cause ?? 'lost')}.</p>
      <dl class="stats wide">
        <div><dt>Depth</dt><dd>${run.depth}</dd></div>
        <div><dt>Turns</dt><dd>${run.turn}</dd></div>
        <div><dt>Kills</dt><dd>${p.kills}</dd></div>
        ${w.rules.includes('growth') ? `<div><dt>Level</dt><dd>${p.level}</dd></div>` : ''}
        <div><dt>World rules</dt><dd>${w.rules.length}</dd></div>
      </dl>
      <p class="muted">${esc(game.lex.t('screen.graveNow', { n: run.depth }))}</p>
      <div class="heir-btns">
        <button class="primary big" data-cmd="heir" data-world="${w.id}">Send the next heir</button>
        <button class="ghost" data-cmd="new-world">New world</button>
        <button class="ghost" data-cmd="title">Title</button>
      </div></div>`;
    this.game = null;
  }

  private teardownPlay() {
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.renderer = null;
    window.clearTimeout(this.deathTimer);
    this.stopTravel(null);
    this.look = null;
    this.hover = null;
  }

  // -------------------------------------------------------------------------
  // Options
  // -------------------------------------------------------------------------

  /** Push the current options into everything that reads them. */
  private applyOptions() {
    const o = this.options;
    document.documentElement.classList.toggle('reduce-motion', o.reduceMotion);
    const play = this.root.querySelector<HTMLElement>('.play-screen');
    play?.classList.toggle('pad-always', o.dpad === 'always');
    play?.classList.toggle('pad-never', o.dpad === 'never');
    if (this.game) {
      this.game.autoPickup = o.autoPickup;
      this.game.lex = lexiconFor(this.game.world, o.plainLabels);
    }
    if (this.renderer) {
      this.renderer.tileRange = TILE_PX[o.tileSize];
      this.renderer.reduceMotion = o.reduceMotion;
    }
    if (!o.hoverInspect) this.hover = null;
  }

  private onOptionChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.opt as keyof Options | undefined;
    if (!key) return;
    (this.options as unknown as Record<string, unknown>)[key] = parseOption(key, input.value);
    saveOptions(this.store.kv, this.options);
    this.applyOptions();
    this.layout();
    if (this.game) this.refresh();
  }

  private openOverlay(o: Overlay) {
    this.overlays.unshift(o);
    this.renderOverlay();
  }

  // -------------------------------------------------------------------------
  // Look mode and hover inspection
  // -------------------------------------------------------------------------

  private setLook(pos: Pos | null) {
    this.look = pos;
    if (pos) {
      this.hover = null;
      this.stopTravel(null);
      this.renderer?.ensureVisible(pos.x, pos.y);
    }
    this.refresh();
  }

  private toggleLook() {
    const p = this.game?.run.player;
    this.setLook(this.look || !p ? null : { x: p.x, y: p.y });
  }

  private moveLook(dx: number, dy: number) {
    const game = this.game;
    if (!game || !this.look) return;
    const f = game.run.floor;
    this.setLook({
      x: Math.max(0, Math.min(f.w - 1, this.look.x + dx)),
      y: Math.max(0, Math.min(f.h - 1, this.look.y + dy)),
    });
  }

  /** The inspection card under the map: Look mode's cursor, or the hovered tile. */
  private renderLook() {
    const slot = this.root.querySelector<HTMLElement>('.lookslot');
    const game = this.game;
    if (!slot || !game) return;
    const at = this.look ?? this.hover;
    const p = game.run.player;
    const aim = this.look && this.canAim() && !(at!.x === p.x && at!.y === p.y) ? game.lex.t('hud.fire') : null;
    const html = at ? lookCardHTML(describeTile(game, at.x, at.y), this.look ? 'look' : 'hover', aim) : '';
    if (slot.dataset.html !== html) {
      slot.innerHTML = html;
      slot.dataset.html = html;
    }
    if (this.renderer) {
      this.renderer.lookCursor = this.look;
      this.renderer.hoverCursor = this.look ? null : this.hover;
    }
  }

  /** Can the player aim harm right now (a settled means that reaches, with foes in the world)? */
  private canAim(): boolean {
    const g = this.game;
    return !!g && g.has('peril') && g.harmSettled && aims(g.ctx.harm);
  }

  /** Aimed harm: at a tile, or at the nearest foe in reach. */
  private fire(at?: Pos) {
    if (!this.canAim()) return;
    this.act(at ? { type: 'fire', x: at.x, y: at.y } : { type: 'fire' });
  }

  /** Descend, unless that would leave an unanswered shrine behind and the player wants a warning. */
  /** Which stairs the player is standing on, if any. */
  private stairsHere(): 'up' | 'down' | null {
    const g = this.game;
    if (!g) return null;
    const { floor: f, player: p } = g.run;
    if (p.x === f.stairs.x && p.y === f.stairs.y) return 'down';
    if (f.tiles[p.y * f.w + p.x] === T_UP) return 'up';
    return null;
  }

  /**
   * Take the stairs (`dir`, or whichever are underfoot), unless that would leave
   * an unanswered shrine behind and the player wants a warning first.
   */
  private tryStairs(dir?: 'up' | 'down') {
    const game = this.game;
    if (!game) return;
    const here = this.stairsHere();
    const want = dir ?? here ?? 'down';
    if (here === want && game.shrineWouldOffer() && this.options.confirmShrine) {
      this.stopTravel(null);
      this.openOverlay({ kind: 'confirm-stairs', dir: want });
      return;
    }
    this.act({ type: want === 'up' ? 'ascend' : 'descend' });
  }

  // -------------------------------------------------------------------------
  // Play loop
  // -------------------------------------------------------------------------

  private layout() {
    const board = this.root.querySelector<HTMLElement>('.board');
    if (!board || !this.renderer || !this.game) return;
    const r = board.getBoundingClientRect();
    this.renderer.resize(Math.max(100, r.width), Math.max(100, r.height));
    this.draw();
  }

  private draw() {
    if (!this.game || !this.renderer) return;
    this.renderer.draw(this.game);
    const btn = this.root.querySelector<HTMLElement>('.recenter');
    if (btn) btn.hidden = !this.renderer.panned;
  }

  /** Coalesce redraws during a drag to one per frame. */
  private scheduleDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  /** Redraw everything after state changed. */
  refresh() {
    const game = this.game;
    if (!game) return;
    const q = (s: string) => this.root.querySelector<HTMLElement>(s);
    q('.topbar')!.innerHTML = topbarHTML(game, !!this.look);
    const stairsBtn = q('.pad-stairs');
    if (stairsBtn) stairsBtn.textContent = this.stairsHere() === 'up' ? 'Climb up' : 'Descend';
    const pickup = q('.pad-pickup') as HTMLButtonElement | null;
    if (pickup) pickup.disabled = game.itemsHere().length === 0;
    // The means' own verb (Fire, Cast, Speak), on the map where a thumb can reach it,
    // naming who it will hit. Look mode has its own button, aimed at the cursor.
    // With the on-screen pad showing it sits in the pad's empty third row; without it
    // (desktop), it floats over the map's corner.
    const target = this.canAim() ? (game.targets()[0] ?? null) : null;
    const pad = q('.pad');
    const padShown = !!pad && getComputedStyle(pad).display !== 'none';
    const html = `${esc(game.lex.t('hud.fire'))}${target ? `<small>${esc(game.monsterName(target))}</small>` : ''}`;
    for (const [sel, show] of [['.pad-fire', padShown], ['.fire-fab', !padShown]] as const) {
      const btn = q(sel) as HTMLButtonElement | null;
      if (!btn) continue;
      btn.hidden = !show || !this.canAim() || (sel === '.fire-fab' && !!this.look);
      btn.disabled = !target;
      if (btn.innerHTML !== html) btn.innerHTML = html;
    }
    if (this.renderer) this.renderer.target = target;
    const lookBtn = q('.pad-look');
    if (lookBtn) {
      lookBtn.classList.toggle('on', !!this.look);
      lookBtn.setAttribute('aria-pressed', String(!!this.look));
    }
    this.renderLook();
    q('.side')!.innerHTML = sidebarHTML(game, this.fresh);
    q('.log')!.innerHTML = logHTML(game);
    const screen = q('.play-screen')!;
    screen.classList.toggle('has-arcana', game.has('arcana'));
    // The premise sets the mood of the frame around the map too.
    const T = game.lex.premise.tiles;
    screen.style.setProperty('--theme', T.accent);
    screen.style.setProperty('--theme-void', T.void);
    this.fresh.clear();
    this.draw();
    this.renderOverlay();
  }

  private renderOverlay() {
    const game = this.game;
    const el = this.root.querySelector<HTMLElement>('.overlay');
    if (!el) return;
    const top = this.overlays[0];
    let html = '';
    if (top?.kind === 'options') html = optionsHTML(this.options);
    else if (top?.kind === 'help') html = helpHTML(game?.lex);
    else if (!game) html = '';
    else if (top?.kind === 'banner') html = bannerHTML(top.rule, top.how, game.world, game.lex);
    else if (top?.kind === 'axiom') html = axiomBannerHTML(top.harm, top.how, game.lex);
    else if (top?.kind === 'story') html = storyHTML(top);
    else if (top?.kind === 'codex') html = codexHTML(game.world, game.lex);
    else if (top?.kind === 'confirm-stairs') html = confirmDescendHTML(game, top.dir);
    else if (game.run.pending?.kind === 'shrine') html = shrineHTML(game);
    else if (game.run.pending?.kind === 'levelup') html = levelupHTML(game);
    else if (game.run.pending?.kind === 'schism') html = schismHTML(game);
    else if (game.run.pending?.kind === 'shop') html = shopHTML(game);
    el.hidden = !html;
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
      el.querySelector<HTMLElement>('.modal')?.scrollTo(0, 0);
    }
  }

  private save() {
    const game = this.game;
    if (!game) return;
    this.store.saveWorld(game.world);
    if (game.run.over) this.store.clearRun(game.world.id);
    else this.store.saveRun(game.snapshot());
  }

  /** Apply a player action. Anything the player does directly cancels auto-travel. */
  private act(a: Action, fromTravel = false) {
    const game = this.game;
    if (!fromTravel) this.stopTravel(null);
    if (!game || game.run.over) return;
    const p = game.run.player;
    const before = { hp: p.hp, x: p.x, y: p.y };
    const target = a.type === 'move' ? game.monsterAt(p.x + a.dx, p.y + a.dy) : undefined;
    // Acting snaps the camera back to the player after a look around, and ends Look mode.
    this.renderer?.recenter();
    this.look = null;
    game.autoPickup = this.options.autoPickup;
    game.act(a);
    if (target && this.renderer) this.renderer.flash(target.x, target.y, COLORS.player);
    if (p.hp < before.hp && this.renderer) this.renderer.flash(p.x, p.y, COLORS.bad);
    this.consumeEvents(game.events.splice(0));
    this.save();
    this.refresh();
    if (this.renderer?.animating) this.animate();
    if (game.run.over) {
      this.deathTimer = window.setTimeout(() => this.death(), 900);
    }
  }

  private animate() {
    const step = () => {
      this.draw();
      if (this.renderer?.animating) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private consumeEvents(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'rule') {
        this.overlays.push({ kind: 'banner', rule: e.rule, how: e.how });
        this.fresh.add(e.rule);
      }
      if (e.type === 'floor') {
        this.layout();
        const g = this.game;
        if (g) {
          const name = g.lex.floorName(g.world.seed, e.depth);
          this.toast(`${g.lex.t('hud.depth', { n: e.depth })}${name ? ` · ${name}` : ''}`, 'rule', true);
        }
      }
      if (e.type === 'say') this.toast(e.text, e.tone);
      if (e.type === 'story') this.overlays.push({ kind: 'story', title: e.title, eyebrow: e.eyebrow, lines: e.lines, hint: e.hint });
      if (e.type === 'axiom') this.overlays.push({ kind: 'axiom', harm: e.harm, how: e.how });
      if (e.type === 'shot') this.renderer?.shot(e.path);
    }
  }

  private dismissOverlay() {
    this.overlays.shift();
    this.renderOverlay();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k0 = e.key;
    // Options work from any screen.
    if (this.overlays[0]?.kind === 'options') {
      if (k0 === 'Escape' || k0 === 'o' || k0 === 'Enter') {
        e.preventDefault();
        this.dismissOverlay();
      }
      return;
    }
    const game = this.game;
    if (!game) {
      if (k0 === 'o') this.openOverlay({ kind: 'options' });
      return;
    }
    if (this.travel) {
      e.preventDefault();
      this.stopTravel(this.game?.lex.t('travel.stop') ?? null);
      return;
    }
    const k = e.key;
    const top = this.overlays[0];
    const pending = game.run.pending;
    const handled = () => e.preventDefault();

    if (top?.kind === 'confirm-stairs') {
      if (k === 'Enter' || k === (top.dir === 'up' ? '<' : '>')) {
        handled();
        this.overlays.shift();
        this.act({ type: top.dir === 'up' ? 'ascend' : 'descend' });
      } else if (k === 'Escape') {
        handled();
        this.dismissOverlay();
      }
      return;
    }
    if (top) {
      if (k === 'Escape' || k === 'Enter' || k === ' ' || (top.kind === 'codex' && k === 'c') || (top.kind === 'help' && k === '?')) {
        handled();
        this.dismissOverlay();
      }
      return;
    }
    if (pending?.kind === 'shrine') {
      const offers = game.run.floor.shrine?.offers ?? [];
      const n = Number(k);
      if (n >= 1 && n <= offers.length) {
        handled();
        this.act({ type: 'shrine', rule: offers[n - 1] });
      } else if (k === 'Escape') {
        handled();
        this.act({ type: 'shrine', rule: null });
      }
      return;
    }
    if (pending?.kind === 'schism') {
      const offers = game.run.floor.schism?.offers ?? [];
      const n = Number(k);
      if (n >= 1 && n <= offers.length) {
        handled();
        this.act({ type: 'schism', harm: offers[n - 1] });
      } else if (k === 'Escape') {
        handled();
        this.act({ type: 'schism', harm: null });
      }
      return;
    }
    if (pending?.kind === 'shop') {
      if (k === 'Escape' || k === 'Enter') {
        handled();
        this.act({ type: 'leaveShop' });
      }
      return;
    }
    if (pending?.kind === 'levelup') {
      const stat = ({ '1': 'str', '2': 'agi', '3': 'vit' } as const)[k as '1' | '2' | '3'];
      if (stat) {
        handled();
        this.act({ type: 'levelup', stat });
      }
      return;
    }
    if (game.run.over) return;

    // Look mode: movement keys steer the cursor instead of the player.
    if (this.look) {
      const d = KEY_DIRS[k];
      if (d) {
        handled();
        this.moveLook(d[0], d[1]);
        return;
      }
      if (k === 'Escape' || k === ';' || k === 'v') {
        handled();
        this.setLook(null);
        return;
      }
      if (k === 'Enter') {
        handled();
        const t = this.look;
        this.setLook(null);
        this.startTravel(t);
        return;
      }
      if (k === 'f' && this.canAim()) {
        handled();
        const t = this.look;
        this.setLook(null);
        this.fire(t);
        return;
      }
      this.setLook(null);
    }

    // Light throttle so a held key doesn't outrun the screen.
    const now = performance.now();
    const repeat = e.repeat && now - this.lastKey < 70;
    const dir = KEY_DIRS[k];
    if (dir) {
      handled();
      if (repeat) return;
      this.lastKey = now;
      this.act({ type: 'move', dx: dir[0], dy: dir[1] });
      return;
    }
    const p = game.run.player;
    switch (k) {
      case '.':
      case '5':
      case ' ':
      case 'Clear':
        handled();
        if (!repeat) {
          this.lastKey = now;
          this.act({ type: 'wait' });
        }
        break;
      case '>':
        handled();
        this.tryStairs('down');
        break;
      case '<':
        handled();
        this.tryStairs('up');
        break;
      case 'Enter':
        handled();
        this.tryStairs();
        break;
      case 'g':
      case ',':
        handled();
        this.act({ type: 'pickup' });
        break;
      case ';':
      case 'v':
        handled();
        this.toggleLook();
        break;
      case 'o':
        this.openOverlay({ kind: 'options' });
        break;
      case 'q': {
        const potion = p.inventory.find((i) => i.kind === 'potion');
        if (potion) this.act({ type: 'use', id: potion.id });
        break;
      }
      case 'e': {
        const food = p.inventory.find((i) => i.kind === 'food');
        if (food) this.act({ type: 'use', id: food.id });
        break;
      }
      case 'f':
        handled();
        this.fire();
        break;
      case 'z':
        this.act({ type: 'ability', ability: 'cleave' });
        break;
      case 'x':
        this.act({ type: 'ability', ability: 'mend' });
        break;
      case 'c':
        if (game.world.rules.length) {
          this.overlays.unshift({ kind: 'codex' });
          this.renderOverlay();
        }
        break;
      case '?':
        this.overlays.unshift({ kind: 'help' });
        this.renderOverlay();
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Auto-travel (press and hold a spot on the map)
  // -------------------------------------------------------------------------

  private startTravel(target: Pos) {
    const game = this.game;
    if (!game || game.run.over || game.run.pending || this.overlays.length) return;
    this.stopTravel(null);
    const p = game.run.player;
    if (target.x === p.x && target.y === p.y) return;
    if (!canTravelTo(game, target)) {
      game.log(game.lex.t(game.has('darkness') ? 'travel.unknown' : 'travel.unreachable'), 'dim');
      this.refresh();
      return;
    }
    const adjacent = game.run.monsters.find((m) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1);
    if (adjacent) {
      {
        const n = game.monsterName(adjacent);
        game.log(game.lex.t('travel.adjacent', { a: article(n), foe: n }), 'dim');
      }
      this.refresh();
      return;
    }
    this.look = null;
    // Foes already nearby when you set off don't stop you — new arrivals do.
    this.travel = { target, timer: 0, known: new Set(nearbyThreats(game).map((m) => m.id)) };
    if (this.renderer) this.renderer.travelTarget = target;
    this.travelTick();
  }

  /** End a journey; `why` (if any) is logged so the stop never looks like a bug. */
  private stopTravel(why: string | null) {
    if (!this.travel) return;
    window.clearTimeout(this.travel.timer);
    this.travel = null;
    if (this.renderer) this.renderer.travelTarget = null;
    if (why && this.game) {
      this.game.log(why, 'info');
      this.refresh();
    } else this.draw();
  }

  private travelTick() {
    const game = this.game;
    const t = this.travel;
    if (!game || !t) return;
    const p = game.run.player;
    const step = travelStep(game, t.target);
    if (!step) return this.stopTravel(game.lex.t('travel.blocked'));
    const hp = p.hp;
    const from = { x: p.x, y: p.y };
    this.act({ type: 'move', dx: step.x, dy: step.y }, true);
    if (this.travel !== t) return;

    if (game.run.over || game.run.pending || this.overlays.length) return this.stopTravel(null);
    if (p.x === from.x && p.y === from.y) return this.stopTravel(game.lex.t('travel.inway'));
    if (p.hp < hp) return this.stopTravel(game.lex.t('travel.hurt'));
    if (p.x === t.target.x && p.y === t.target.y) return this.stopTravel(null);
    const threats = nearbyThreats(game);
    const arrived = threats.find((m) => !t.known.has(m.id));
    const adjacent = threats.find((m) => Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1);
    const stopFor = adjacent ?? arrived;
    if (stopFor) {
      const name = game.monsterName(stopFor);
      const why = adjacent
        ? game.lex.t('travel.upon', { A: article(name) === 'an' ? 'An' : 'A', foe: name })
        : game.lex.t('travel.spot', { a: article(name), foe: name, glyph: game.lex.foe(stopFor.kind).glyph });
      this.toast(why, 'bad');
      return this.stopTravel(why);
    }
    t.timer = window.setTimeout(() => this.travelTick(), TRAVEL_STEP_MS[this.options.travelSpeed]);
  }

  /**
   * Drag the map to look around; a press that barely moves is a tap, which
   * steps toward the tapped spot; press and hold to travel there. One pointer
   * at a time.
   */
  private bindMapGestures(canvas: HTMLCanvasElement, board: HTMLElement) {
    const SLOP = 8;
    const tileFor = (e: PointerEvent) => {
      const f = this.game?.run.floor;
      if (!f || !this.renderer) return null;
      const rect = canvas.getBoundingClientRect();
      return this.renderer.tileAt(e.clientX - rect.left, e.clientY - rect.top, f.w, f.h);
    };
    // Long-press on touch would otherwise open the browser's own context menu.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const stopper = !!this.travel;
      if (stopper) this.stopTravel(this.game?.lex.t('travel.stop') ?? null);
      const d = {
        id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY,
        moved: false, hold: 0, held: false, stopper,
      };
      const tile = tileFor(e);
      if (!stopper && tile) {
        d.hold = window.setTimeout(() => {
          if (this.drag !== d || d.moved) return;
          d.held = true;
          try {
            if (this.options.vibrate) navigator.vibrate?.(12);
          } catch {
            /* not allowed here; the target marker is feedback enough */
          }
          this.startTravel(tile);
        }, HOLD_MS[this.options.holdDelay]);
      }
      this.drag = d;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId || !this.renderer) return;
      if (d.held || (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < SLOP)) return;
      d.moved = true;
      window.clearTimeout(d.hold);
      board.classList.add('dragging');
      this.renderer.panBy(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
      this.scheduleDraw();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      window.clearTimeout(d.hold);
      board.classList.remove('dragging');
      if (!cancelled && !d.moved && !d.held && !d.stopper) this.onTap(e, canvas);
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
    // Mouse hover describes the tile under the pointer (an option; never on touch).
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.drag || this.look || !this.options.hoverInspect) return;
      const t = tileFor(e);
      if (t?.x === this.hover?.x && t?.y === this.hover?.y) return;
      this.hover = t;
      this.renderLook();
      this.scheduleDraw();
    });
    canvas.addEventListener('pointerleave', () => {
      if (!this.hover) return;
      this.hover = null;
      this.renderLook();
      this.scheduleDraw();
    });
  }

  private onTap(e: PointerEvent, canvas: HTMLCanvasElement) {
    const game = this.game;
    if (!game || !this.renderer || game.run.pending || this.overlays.length) return;
    const rect = canvas.getBoundingClientRect();
    const f = game.run.floor;
    const t = this.renderer.tileAt(e.clientX - rect.left, e.clientY - rect.top, f.w, f.h);
    if (!t) return;
    if (this.look) {
      this.setLook(t);
      return;
    }
    const p = game.run.player;
    // Tapping a foe your means can reach harms it from where you stand.
    if (this.canAim() && game.targets().some((m) => m.x === t.x && m.y === t.y)) {
      this.fire(t);
      return;
    }
    const dx = Math.sign(t.x - p.x);
    const dy = Math.sign(t.y - p.y);
    if (dx === 0 && dy === 0) {
      if (this.stairsHere()) this.tryStairs();
      else this.act({ type: 'wait' });
    } else this.act({ type: 'move', dx, dy });
  }

  private onClick(e: MouseEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-cmd]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const d = btn.dataset;
    const world = d.world ? this.store.world(d.world) : null;
    switch (d.cmd) {
      case 'new-world': {
        const w = newWorld(randomSeed());
        this.store.saveWorld(w);
        this.begin(w, null);
        break;
      }
      case 'heir':
        if (world) this.heir(world);
        break;
      case 'begin': {
        if (!world) break;
        const form = this.root.querySelector<HTMLFormElement>('#repeal-form');
        const choice = form ? (new FormData(form).get('repeal') as string) : '';
        this.begin(world, (choice || null) as RuleId | null);
        break;
      }
      case 'resume': {
        const run = world && this.store.run(world.id);
        if (world && run) this.play(new Game(world, run, this.options.plainLabels));
        break;
      }
      case 'delete-world':
        // Two-step in the page itself: embedded viewers suppress confirm() dialogs.
        if (!world) break;
        if (btn.dataset.armed) {
          this.store.deleteWorld(world.id);
          this.title();
        } else {
          btn.dataset.armed = '1';
          btn.textContent = `Forget ${world.name} for good?`;
          btn.classList.add('armed');
        }
        break;
      case 'title':
        this.title();
        break;
      case 'leave':
        this.save();
        this.title();
        break;
      case 'move':
        this.act({ type: 'move', dx: Number(d.dx), dy: Number(d.dy) });
        break;
      case 'wait':
        this.act({ type: 'wait' });
        break;
      case 'descend':
        this.tryStairs('down');
        break;
      case 'stairs':
        this.tryStairs();
        break;
      case 'stairs-confirmed': {
        const top = this.overlays.shift();
        this.act({ type: top?.kind === 'confirm-stairs' && top.dir === 'up' ? 'ascend' : 'descend' });
        break;
      }
      case 'pickup':
        this.act({ type: 'pickup', id: d.id ? Number(d.id) : undefined });
        break;
      case 'look':
        this.toggleLook();
        break;
      case 'fire':
        this.fire();
        break;
      case 'look-fire': {
        const t = this.look;
        this.setLook(null);
        if (t) this.fire(t);
        break;
      }
      case 'schism':
        this.act({ type: 'schism', harm: (d.harm || null) as HarmId | null });
        break;
      case 'buy':
        this.act({ type: 'buy', id: Number(d.id) });
        break;
      case 'sell':
        this.act({ type: 'sell', id: Number(d.id) });
        break;
      case 'leave-shop':
        this.act({ type: 'leaveShop' });
        break;
      case 'reroll':
        this.act({ type: 'reroll' });
        break;
      case 'look-walk': {
        const t = this.look;
        this.setLook(null);
        if (t) this.startTravel(t);
        break;
      }
      case 'options':
        this.openOverlay({ kind: 'options' });
        break;
      case 'use':
        this.act({ type: 'use', id: Number(d.id) });
        break;
      case 'equip':
        this.act({ type: 'equip', id: Number(d.id) });
        break;
      case 'unequip':
        this.act({ type: 'unequip', slot: d.slot as 'weapon' | 'armor' });
        break;
      case 'drop':
        this.act({ type: 'drop', id: Number(d.id) });
        break;
      case 'ability':
        this.act({ type: 'ability', ability: d.ability as 'cleave' | 'mend' });
        break;
      case 'shrine':
        this.act({ type: 'shrine', rule: (d.rule || null) as RuleId | null });
        break;
      case 'levelup':
        this.act({ type: 'levelup', stat: d.stat as 'str' | 'agi' | 'vit' });
        break;
      case 'codex':
        this.openOverlay({ kind: 'codex' });
        break;
      case 'help':
        this.openOverlay({ kind: 'help' });
        break;
      case 'dismiss':
        this.dismissOverlay();
        break;
      case 'recenter':
        this.renderer?.recenter();
        this.draw();
        break;
    }
  }
}
