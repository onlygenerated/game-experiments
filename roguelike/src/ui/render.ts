import { itemGlyph } from '../engine/content.ts';
import { idx } from '../engine/dungeon.ts';
import type { Game } from '../engine/game.ts';
import { T_STAIRS, T_UP, T_WALL, type Floor } from '../engine/types.ts';

export const COLORS = {
  void: '#07080c',
  floor: '#11141b',
  floorDot: '#2c3240',
  wall: '#232a37',
  wallEdge: '#323b4c',
  player: '#ffe7a3',
  stairs: '#f2c46d',
  stairsUp: '#b9a27a',
  shrine: '#c9a2ff',
  shrineUsed: '#4a4458',
  schism: '#7fe0cf',
  merchant: '#f2c46d',
  /** The trail aimed harm leaves, and the auto-target marker. */
  shot: '#ffe7a3',
  target: '#ff8a7a',
  grave: '#cfd3dc',
  /** The stun marker. Foe and hazard colours come from the premise. */
  stun: '#7cc8ff',
  potion: '#ff8fb8',
  gold: '#f2c46d',
  ammo: '#c9d3e0',
  weapon: '#d9dde6',
  armor: '#9fb3c8',
  food: '#d6b48a',
  bad: '#ff8a7a',
};

const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';

export interface View {
  cell: number;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
  /** Map pixel at the canvas's top-left. Negative when the map is centred in a larger canvas. */
  camX: number;
  camY: number;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: View = { cell: 20, w: 0, h: 0, camX: 0, camY: 0 };
  /**
   * How far the player has dragged the camera away from following the @, in
   * pixels. Clamped at every draw so it never runs past the map's edges.
   */
  private panX = 0;
  private panY = 0;
  /** Where auto-travel is headed, drawn as a marker. */
  travelTarget: { x: number; y: number } | null = null;
  /** Look mode's cursor, and the tile under a hovering mouse. */
  lookCursor: { x: number; y: number } | null = null;
  hoverCursor: { x: number; y: number } | null = null;
  /** Smallest and largest tile size in CSS pixels (the Map tile size option). */
  tileRange: readonly [number, number] = [16, 32];
  /** Skip hit flashes. */
  reduceMotion = false;
  /** Who "fire" would hit right now (the nearest foe in reach), marked on the map. */
  target: { x: number; y: number } | null = null;
  private trails: { path: { x: number; y: number }[]; until: number }[] = [];
  private boundsOf: Floor | null = null;
  private boundsCache: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Tile index → time it should stop flashing (hit feedback). */
  private flashes = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Draw the line aimed harm just flew along, briefly. */
  shot(path: { x: number; y: number }[]) {
    if (this.reduceMotion || !path.length) return;
    this.trails.push({ path, until: performance.now() + 260 });
  }

  flash(x: number, y: number, color: string) {
    if (this.reduceMotion) return;
    this.flashes.set(`${x},${y},${color}`, performance.now() + 180);
  }

  resize(w: number, h: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.w = w;
    this.view.h = h;
  }

  /** The part of the floor that exists (open tiles plus their walls), cached per floor. */
  private bounds(f: Floor): { x0: number; y0: number; x1: number; y1: number } {
    if (this.boundsOf === f && this.boundsCache) return this.boundsCache;
    let x0 = f.w, y0 = f.h, x1 = 0, y1 = 0;
    for (let i = 0; i < f.tiles.length; i++) {
      if (f.tiles[i] === T_WALL) continue;
      const x = i % f.w;
      const y = (i - x) / f.w;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const b = { x0: Math.max(0, x0 - 1), y0: Math.max(0, y0 - 1), x1: Math.min(f.w, x1 + 2), y1: Math.min(f.h, y1 + 2) };
    this.boundsOf = f;
    this.boundsCache = b;
    return b;
  }

  /** Drag the map: content moves with the finger, so the camera moves the other way. */
  panBy(dx: number, dy: number) {
    this.panX -= dx;
    this.panY -= dy;
  }

  /** Pan just enough that a tile (e.g. the Look cursor) is on screen with a one-tile margin. */
  ensureVisible(x: number, y: number) {
    const v = this.view;
    const c = v.cell;
    const left = x * c - v.camX;
    const top = y * c - v.camY;
    if (left < c) this.panX += left - c;
    else if (left + 2 * c > v.w) this.panX += left + 2 * c - v.w;
    if (top < c) this.panY += top - c;
    else if (top + 2 * c > v.h) this.panY += top + 2 * c - v.h;
  }

  recenter() {
    this.panX = 0;
    this.panY = 0;
  }

  /** True when the camera has been dragged noticeably away from the player. */
  get panned(): boolean {
    return Math.abs(this.panX) > this.view.cell / 2 || Math.abs(this.panY) > this.view.cell / 2;
  }

  /** Map tile under a canvas-relative point, or null. */
  tileAt(cx: number, cy: number, mapW: number, mapH: number): { x: number; y: number } | null {
    const v = this.view;
    const x = Math.floor((cx + v.camX) / v.cell);
    const y = Math.floor((cy + v.camY) / v.cell);
    if (x < 0 || y < 0 || x >= mapW || y >= mapH) return null;
    return { x, y };
  }

  /**
   * One axis of the camera: centre the map if it fits, otherwise follow the
   * player plus the drag offset, clamped to the map. Returns [cam, clampedPan].
   */
  private axis(size: number, lo: number, hi: number, focus: number, pan: number): [number, number] {
    const span = hi - lo;
    if (span <= size) return [lo - Math.floor((size - span) / 2), 0];
    const clamp = (v: number) => Math.max(lo, Math.min(hi - size, v));
    // Pan is measured from where the camera would rest, so a player near an
    // edge doesn't count as "panned", and over-dragging past an edge doesn't
    // build up slack that has to be dragged back first.
    const rest = clamp(focus - size / 2);
    const cam = clamp(rest + pan);
    return [Math.round(cam), cam - rest];
  }

  draw(game: Game) {
    const { ctx, view: v } = this;
    const run = game.run;
    const f = run.floor;
    const p = run.player;
    const dark = game.has('darkness');
    const elements = game.has('elements');
    // Fit what exists of the floor when it can be shown legibly; otherwise follow the player.
    const b = this.bounds(f);
    const fit = Math.floor(Math.min(v.w / (b.x1 - b.x0), v.h / (b.y1 - b.y0)));
    v.cell = Math.max(this.tileRange[0], Math.min(this.tileRange[1], fit));
    const c = v.cell;

    [v.camX, this.panX] = this.axis(v.w, b.x0 * c, b.x1 * c, p.x * c + c / 2, this.panX);
    [v.camY, this.panY] = this.axis(v.h, b.y0 * c, b.y1 * c, p.y * c + c / 2, this.panY);

    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, v.w, v.h);

    const x0 = Math.max(0, Math.floor(v.camX / c));
    const y0 = Math.max(0, Math.floor(v.camY / c));
    const x1 = Math.min(f.w, Math.ceil((v.camX + v.w) / c));
    const y1 = Math.min(f.h, Math.ceil((v.camY + v.h) / c));
    const sxOf = (x: number) => x * c - v.camX;
    const syOf = (y: number) => y * c - v.camY;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = (ch: string, x: number, y: number, color: string, bold = false, scale = 0.72) => {
      ctx.font = `${bold ? 700 : 500} ${Math.round(c * scale)}px ${MONO}`;
      ctx.fillStyle = color;
      ctx.fillText(ch, sxOf(x) + c / 2, syOf(y) + c / 2 + 1);
    };

    // Tiles with something standing on them skip their own glyph, so the two don't overprint.
    const covered = new Set<number>([idx(f, p.x, p.y)]);
    for (const m of run.monsters) if (game.visible.has(idx(f, m.x, m.y))) covered.add(idx(f, m.x, m.y));
    for (const fi of run.items) if (game.visible.has(idx(f, fi.x, fi.y))) covered.add(idx(f, fi.x, fi.y));

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = idx(f, x, y);
        const seen = game.visible.has(i);
        if (dark && !seen && !f.explored[i]) continue;
        ctx.globalAlpha = seen ? 1 : 0.38;
        const sx = sxOf(x);
        const sy = syOf(y);
        const t = f.tiles[i];
        if (t === T_WALL) {
          // Only walls that border a floor are drawn, so rooms read as outlines
          // instead of a striped slab. A floor below gets a lit top edge.
          if (!this.bordersFloor(f.tiles, f.w, f.h, x, y)) continue;
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(sx, sy, c, c);
          if (y + 1 < f.h && f.tiles[i + f.w] !== T_WALL) {
            ctx.fillStyle = COLORS.wallEdge;
            ctx.fillRect(sx, sy + c - Math.max(2, c * 0.16), c, Math.max(2, c * 0.16));
          }
          continue;
        }
        ctx.fillStyle = COLORS.floor;
        ctx.fillRect(sx, sy, c, c);
        const g = f.glimmer[i];
        if (covered.has(i) && !(g && elements)) continue;
        if (t === T_STAIRS) glyph('>', x, y, COLORS.stairs, true, 0.8);
        else if (t === T_UP) glyph('<', x, y, COLORS.stairsUp, true, 0.8);
        else if (g && elements) {
          const look = game.lex.element(g);
          ctx.fillStyle = look.tint;
          ctx.fillRect(sx + 1, sy + 1, c - 2, c - 2);
          glyph(look.glyph, x, y, look.color, true);
        } else if (g) {
          // Dormant: a faint tint and a different dot. Means nothing — yet.
          glyph('∙', x, y, game.lex.element(g).dormant, true, 0.9);
        } else glyph('·', x, y, COLORS.floorDot);
      }
    }
    ctx.globalAlpha = 1;

    const canShow = (x: number, y: number) => game.visible.has(idx(f, x, y));
    const remembered = (x: number, y: number) => !dark || f.explored[idx(f, x, y)] === 1;

    if (f.shrine && remembered(f.shrine.pos.x, f.shrine.pos.y)) {
      const s = f.shrine;
      glyph('Ω', s.pos.x, s.pos.y, s.used ? COLORS.shrineUsed : COLORS.shrine, true, 0.8);
    }
    const sc = f.schism;
    if (sc && !sc.used && !game.harmSettled && remembered(sc.pos.x, sc.pos.y)) glyph('◈', sc.pos.x, sc.pos.y, COLORS.schism, true, 0.85);
    const mc = f.merchant;
    if (mc && game.has('commerce') && remembered(mc.pos.x, mc.pos.y)) glyph('&', mc.pos.x, mc.pos.y, COLORS.merchant, true, 0.8);
    for (const g of game.floorGraves()) {
      if (remembered(g.x, g.y)) glyph('†', g.x, g.y, g.looted ? '#5d6270' : COLORS.grave, true, 0.8);
    }
    // A foe standing on an item hides it: the two glyphs would overprint each other.
    const occupied = new Set(run.monsters.filter((m) => canShow(m.x, m.y)).map((m) => idx(f, m.x, m.y)));
    for (const fi of run.items) {
      if (!canShow(fi.x, fi.y) || occupied.has(idx(f, fi.x, fi.y))) continue;
      glyph(itemGlyph(fi.item), fi.x, fi.y, COLORS[fi.item.kind], true);
    }
    for (const m of run.monsters) {
      if (!canShow(m.x, m.y)) continue;
      const look = game.lex.foe(m.kind);
      const color = elements && m.element ? game.lex.element(m.element).color : look.color;
      glyph(look.glyph, m.x, m.y, color, true, 0.8);
      // Health tick under wounded monsters, and a "?" over unaware ones in the dark.
      const sx = sxOf(m.x);
      const sy = syOf(m.y);
      if (m.hp < m.maxHp) {
        ctx.fillStyle = '#3b1f22';
        ctx.fillRect(sx + 3, sy + c - 4, c - 6, 2);
        ctx.fillStyle = COLORS.bad;
        ctx.fillRect(sx + 3, sy + c - 4, Math.max(1, ((c - 6) * m.hp) / m.maxHp), 2);
      }
      if (m.stun > 0) {
        ctx.font = `700 ${Math.round(c * 0.38)}px ${MONO}`;
        ctx.fillStyle = COLORS.stun;
        ctx.fillText('z', sx + c - 4, sy + 6);
      } else if (dark && !m.aware) {
        ctx.font = `700 ${Math.round(c * 0.38)}px ${MONO}`;
        ctx.fillStyle = '#8b8f9c';
        ctx.fillText('?', sx + c - 4, sy + 6);
      }
    }
    if (this.travelTarget) {
      const t = this.travelTarget;
      ctx.save();
      ctx.strokeStyle = COLORS.shrine;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sxOf(t.x) + 2, syOf(t.y) + 2, c - 4, c - 4);
      ctx.restore();
    }
    glyph('@', p.x, p.y, COLORS.player, true, 0.82);
    if (this.target && canShow(this.target.x, this.target.y)) {
      // Corner brackets: the nearest foe your means can reach.
      const t = this.target;
      ctx.fillStyle = COLORS.target;
      const k = Math.max(3, c * 0.25);
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        ctx.fillRect(sxOf(t.x) + cx * (c - k), syOf(t.y) + cy * (c - 2), k, 2);
        ctx.fillRect(sxOf(t.x) + cx * (c - 2), syOf(t.y) + cy * (c - k), 2, k);
      }
    }
    if (this.hoverCursor) {
      const h = this.hoverCursor;
      ctx.strokeStyle = 'rgba(232, 228, 216, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sxOf(h.x) + 0.5, syOf(h.y) + 0.5, c - 1, c - 1);
    }
    if (this.lookCursor) {
      const l = this.lookCursor;
      ctx.strokeStyle = COLORS.shrine;
      ctx.lineWidth = 2;
      ctx.strokeRect(sxOf(l.x) + 1, syOf(l.y) + 1, c - 2, c - 2);
      // Corner ticks make the cursor read as a reticle, not a selection.
      ctx.fillStyle = COLORS.shrine;
      const k = Math.max(3, c * 0.22);
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        ctx.fillRect(sxOf(l.x) + cx * (c - k), syOf(l.y) + cy * (c - 2), k, 2);
        ctx.fillRect(sxOf(l.x) + cx * (c - 2), syOf(l.y) + cy * (c - k), 2, k);
      }
    }

    const now = performance.now();
    this.trails = this.trails.filter((tr) => tr.until > now);
    for (const tr of this.trails) {
      ctx.globalAlpha = (tr.until - now) / 260;
      ctx.fillStyle = COLORS.shot;
      for (const t of tr.path) ctx.fillRect(sxOf(t.x) + c / 2 - 2, syOf(t.y) + c / 2 - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    for (const [k, until] of this.flashes) {
      if (until < now) {
        this.flashes.delete(k);
        continue;
      }
      const [x, y, color] = k.split(',');
      ctx.globalAlpha = (until - now) / 180;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(sxOf(Number(x)) + 1, syOf(Number(y)) + 1, c - 2, c - 2);
    }
    ctx.globalAlpha = 1;
  }

  private bordersFloor(tiles: number[], w: number, h: number, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (tiles[ny * w + nx] !== T_WALL) return true;
      }
    }
    return false;
  }

  get animating(): boolean {
    return this.flashes.size > 0 || this.trails.length > 0;
  }
}
