import { Game, type Action, type GameEvent } from '../engine/game.ts';
import type { RuleId, World } from '../engine/types.ts';
import { defaultKV, heirName, newWorld, randomSeed, Store } from '../engine/world.ts';
import { repealable, RULE_ORDER, RULES } from '../rules/rules.ts';
import { bannerHTML, codexHTML, esc, helpHTML, levelupHTML, logHTML, shrineHTML, sidebarHTML, topbarHTML } from './hud.ts';
import { COLORS, Renderer } from './render.ts';

type Overlay =
  | { kind: 'banner'; rule: RuleId; how: 'shrine' | 'mastery' | 'milestone' }
  | { kind: 'codex' }
  | { kind: 'help' };

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
  private drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('click', (e) => this.onClick(e));
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
        return `<li class="world-card">
          <div class="wc-head"><h3>${esc(w.name)}</h3><span class="muted small">Age ${w.generation} · deepest ${w.deepest || '—'} · ${w.graves.length} ${w.graves.length === 1 ? 'grave' : 'graves'}</span></div>
          <div class="chips">${rules.length ? rules.map((r) => `<span class="chip">${RULES[r].name}</span>`).join('') : '<span class="muted small">No rules yet</span>'}</div>
          <div class="wc-btns">
            ${run && !run.over ? `<button class="primary" data-cmd="resume" data-world="${w.id}">Resume ${esc(run.player.name)} · depth ${run.depth}</button>` : `<button class="primary" data-cmd="heir" data-world="${w.id}">New heir</button>`}
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
          <p class="muted">Start from nothing: walls, rats, stairs. The world rolls its own variants of every rule.</p>
          <button class="primary big" data-cmd="new-world">Begin a new world</button>
        </section>
        <section class="continue">
          <h2>Your worlds</h2>
          ${worlds.length ? `<p class="muted">Send a new heir into a world you've shaped. They inherit every rule, may repeal one, and can find the graves of those before them.</p><ul class="worlds">${cards}</ul>` : '<p class="muted">None yet. Worlds you create are saved in this browser.</p>'}
        </section>
      </div></div>`;
  }

  /** Briefing for a new heir in an existing world: inherited rules, one optional repeal. */
  heir(world: World) {
    this.teardownPlay();
    const gen = world.generation + 1;
    const name = heirName(world, gen);
    const active = new Set(world.rules);
    const canRepeal = repealable(active);
    const rules = RULE_ORDER.filter((r) => active.has(r));
    if (!rules.length && !world.history.length) {
      this.begin(world, null);
      return;
    }
    const last = world.history[world.history.length - 1];
    this.root.innerHTML = `<div class="screen heir-screen">
      <span class="eyebrow">${esc(world.name)} · age ${world.generation}</span>
      <h1>${esc(name)}, heir ${gen}</h1>
      ${last ? `<p class="lede">${esc(last.name)} fell at depth ${last.depth}, ${esc(last.cause.replace(/ on depth \d+$/, ''))}. Their grave remains where they fell.</p>` : ''}
      ${rules.length ? `<h2>The rules you inherit</h2>
      <p class="muted">You may repeal one — only a rule nothing else depends on. A repealed rule leaves the world and can be offered again at shrines.</p>
      <form class="repeal" id="repeal-form">
        <label class="repeal-opt keep"><input type="radio" name="repeal" value="" checked> <span><b>Keep every rule</b></span></label>
        ${rules
          .map((r) => {
            const ok = canRepeal.includes(r);
            return `<label class="repeal-opt${ok ? '' : ' locked'}"><input type="radio" name="repeal" value="${r}" ${ok ? '' : 'disabled'}>
              <span><b>${RULES[r].name}</b>${world.variants[r] === 'alt' ? ` <span class="variant-tag">✦ ${esc(RULES[r].variant.name)}</span>` : ''}
              <span class="muted small">${esc(RULES[r].summary)}${ok ? '' : ` — others depend on it`}</span></span></label>`;
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
    const game = Game.start(world);
    if (repeal) game.log(`${RULES[repeal].name} is repealed. It leaves the world.`, 'rule');
    this.play(game);
    this.save();
  }

  play(game: Game) {
    this.game = game;
    this.overlays = [];
    this.fresh.clear();
    this.root.innerHTML = `<div class="screen play-screen">
      <header class="topbar"></header>
      <main class="board"><canvas aria-label="Dungeon map"></canvas>
        <button class="recenter" data-cmd="recenter" hidden>⌖ Center on ${esc(game.run.player.name)}</button></main>
      <section class="log" aria-live="polite"></section>
      <nav class="pad" aria-label="Controls">
        <div class="dpad">
          ${[[-1, -1, '↖'], [0, -1, '↑'], [1, -1, '↗'], [-1, 0, '←'], [0, 0, '·'], [1, 0, '→'], [-1, 1, '↙'], [0, 1, '↓'], [1, 1, '↘']]
            .map(([dx, dy, l]) => (dx === 0 && dy === 0 ? `<button data-cmd="wait" aria-label="Wait">${l}</button>` : `<button data-cmd="move" data-dx="${dx}" data-dy="${dy}" aria-label="Move">${l}</button>`))
            .join('')}
        </div>
        <div class="pad-actions">
          <button data-cmd="descend">Descend ›</button>
          <button data-cmd="wait">Wait</button>
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
    this.layout();
    this.refresh();
  }

  death() {
    const game = this.game!;
    this.save();
    const run = game.run;
    const p = run.player;
    const w = game.world;
    this.teardownPlay();
    this.root.innerHTML = `<div class="screen death-screen">
      <span class="eyebrow">${esc(w.name)} · heir ${run.gen}</span>
      <h1>${esc(p.name)} is dead</h1>
      <p class="lede">${esc(run.cause ?? 'lost')}.</p>
      <dl class="stats wide">
        <div><dt>Depth</dt><dd>${run.depth}</dd></div>
        <div><dt>Turns</dt><dd>${run.turn}</dd></div>
        <div><dt>Kills</dt><dd>${p.kills}</dd></div>
        ${w.rules.includes('growth') ? `<div><dt>Level</dt><dd>${p.level}</dd></div>` : ''}
        <div><dt>World rules</dt><dd>${w.rules.length}</dd></div>
      </dl>
      <p class="muted">Their grave now lies on depth ${run.depth}. The world keeps every rule it has learned.</p>
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
  }

  // -------------------------------------------------------------------------
  // Play loop
  // -------------------------------------------------------------------------

  private layout() {
    const board = this.root.querySelector<HTMLElement>('.board');
    if (!board || !this.renderer || !this.game) return;
    const r = board.getBoundingClientRect();
    this.renderer.resize(Math.max(100, r.width), Math.max(100, r.height), this.game.run.floor.w, this.game.run.floor.h);
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
    q('.topbar')!.innerHTML = topbarHTML(game);
    q('.side')!.innerHTML = sidebarHTML(game, this.fresh);
    q('.log')!.innerHTML = logHTML(game);
    q('.play-screen')!.classList.toggle('has-arcana', game.has('arcana'));
    this.fresh.clear();
    this.draw();
    this.renderOverlay();
  }

  private renderOverlay() {
    const game = this.game;
    const el = this.root.querySelector<HTMLElement>('.overlay');
    if (!game || !el) return;
    const top = this.overlays[0];
    let html = '';
    if (top?.kind === 'banner') html = bannerHTML(top.rule, top.how, game.world);
    else if (top?.kind === 'codex') html = codexHTML(game.world);
    else if (top?.kind === 'help') html = helpHTML();
    else if (game.run.pending?.kind === 'shrine') html = shrineHTML(game);
    else if (game.run.pending?.kind === 'levelup') html = levelupHTML(game);
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

  private act(a: Action) {
    const game = this.game;
    if (!game || game.run.over) return;
    const p = game.run.player;
    const before = { hp: p.hp, x: p.x, y: p.y };
    const target = a.type === 'move' ? game.monsterAt(p.x + a.dx, p.y + a.dy) : undefined;
    // Acting snaps the camera back to the player after a look around.
    this.renderer?.recenter();
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
      if (e.type === 'descend') this.layout();
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
    const game = this.game;
    if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const top = this.overlays[0];
    const pending = game.run.pending;
    const handled = () => e.preventDefault();

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
    if (pending?.kind === 'levelup') {
      const stat = ({ '1': 'str', '2': 'agi', '3': 'vit' } as const)[k as '1' | '2' | '3'];
      if (stat) {
        handled();
        this.act({ type: 'levelup', stat });
      }
      return;
    }
    if (game.run.over) return;

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
      case 'Enter':
        handled();
        this.act({ type: 'descend' });
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

  /**
   * Drag the map to look around; a press that barely moves is a tap, which
   * steps toward the tapped spot. One pointer at a time.
   */
  private bindMapGestures(canvas: HTMLCanvasElement, board: HTMLElement) {
    const SLOP = 8;
    canvas.addEventListener('pointerdown', (e) => {
      if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId || !this.renderer) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < SLOP) return;
      d.moved = true;
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
      board.classList.remove('dragging');
      if (!cancelled && !d.moved) this.onTap(e, canvas);
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
  }

  private onTap(e: PointerEvent, canvas: HTMLCanvasElement) {
    const game = this.game;
    if (!game || !this.renderer || game.run.pending || this.overlays.length) return;
    const rect = canvas.getBoundingClientRect();
    const f = game.run.floor;
    const t = this.renderer.tileAt(e.clientX - rect.left, e.clientY - rect.top, f.w, f.h);
    if (!t) return;
    const p = game.run.player;
    const dx = Math.sign(t.x - p.x);
    const dy = Math.sign(t.y - p.y);
    if (dx === 0 && dy === 0) {
      this.act(p.x === f.stairs.x && p.y === f.stairs.y ? { type: 'descend' } : { type: 'wait' });
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
        if (world && run) this.play(new Game(world, run));
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
        this.act({ type: 'descend' });
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
        this.overlays.unshift({ kind: 'codex' });
        this.renderOverlay();
        break;
      case 'help':
        this.overlays.unshift({ kind: 'help' });
        this.renderOverlay();
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
