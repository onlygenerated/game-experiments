import { itemGlyph, MONSTERS } from '../engine/content.ts';
import { idx } from '../engine/dungeon.ts';
import type { Game } from '../engine/game.ts';
import { T_STAIRS, T_WALL } from '../engine/types.ts';

export const COLORS = {
  void: '#07080c',
  floor: '#11141b',
  floorDot: '#2c3240',
  wall: '#232a37',
  wallEdge: '#323b4c',
  player: '#ffe7a3',
  stairs: '#f2c46d',
  shrine: '#c9a2ff',
  shrineUsed: '#4a4458',
  grave: '#cfd3dc',
  ember: '#ff7a45',
  frost: '#7cc8ff',
  emberDim: '#3a2620',
  frostDim: '#1d2a38',
  rat: '#c49a6c',
  bat: '#b38cff',
  goblin: '#86d17a',
  slime: '#c6e85a',
  potion: '#ff8fb8',
  gold: '#f2c46d',
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
  /** Tile index → time it should stop flashing (hit feedback). */
  private flashes = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  flash(x: number, y: number, color: string) {
    this.flashes.set(`${x},${y},${color}`, performance.now() + 180);
  }

  resize(w: number, h: number, mapW: number, mapH: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the whole floor when we can do it legibly; otherwise follow the player.
    const fit = Math.floor(Math.min(w / mapW, h / mapH));
    this.view.cell = Math.max(16, Math.min(30, fit));
    this.view.w = w;
    this.view.h = h;
  }

  /** Drag the map: content moves with the finger, so the camera moves the other way. */
  panBy(dx: number, dy: number) {
    this.panX -= dx;
    this.panY -= dy;
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
  private axis(size: number, mapPx: number, focus: number, pan: number): [number, number] {
    if (mapPx <= size) return [-Math.floor((size - mapPx) / 2), 0];
    const clamp = (v: number) => Math.max(0, Math.min(mapPx - size, v));
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
    const c = v.cell;

    [v.camX, this.panX] = this.axis(v.w, f.w * c, p.x * c + c / 2, this.panX);
    [v.camY, this.panY] = this.axis(v.h, f.h * c, p.y * c + c / 2, this.panY);

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
        if (t === T_STAIRS) glyph('>', x, y, COLORS.stairs, true, 0.8);
        else if (g && elements) {
          ctx.fillStyle = g === 'ember' ? COLORS.emberDim : COLORS.frostDim;
          ctx.fillRect(sx + 1, sy + 1, c - 2, c - 2);
          glyph(g === 'ember' ? '^' : '*', x, y, g === 'ember' ? COLORS.ember : COLORS.frost, true);
        } else if (g) {
          // Dormant: a faint tint and a different dot. Means nothing — yet.
          glyph('∙', x, y, g === 'ember' ? '#5a3a30' : '#2d4256', true, 0.9);
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
    for (const g of game.floorGraves()) {
      if (remembered(g.x, g.y)) glyph('†', g.x, g.y, g.looted ? '#5d6270' : COLORS.grave, true, 0.8);
    }
    for (const fi of run.items) {
      if (!canShow(fi.x, fi.y)) continue;
      glyph(itemGlyph(fi.item), fi.x, fi.y, COLORS[fi.item.kind], true);
    }
    for (const m of run.monsters) {
      if (!canShow(m.x, m.y)) continue;
      const def = MONSTERS[m.kind];
      const color = elements && m.element ? COLORS[m.element] : COLORS[m.kind];
      glyph(def.glyph, m.x, m.y, color, true, 0.8);
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
        ctx.fillStyle = COLORS.frost;
        ctx.fillText('z', sx + c - 4, sy + 6);
      } else if (dark && !m.aware) {
        ctx.font = `700 ${Math.round(c * 0.38)}px ${MONO}`;
        ctx.fillStyle = '#8b8f9c';
        ctx.fillText('?', sx + c - 4, sy + 6);
      }
    }
    glyph('@', p.x, p.y, COLORS.player, true, 0.82);

    const now = performance.now();
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
    return this.flashes.size > 0;
  }
}
