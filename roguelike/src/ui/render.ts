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
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  /** Pixel offset that centres the map when it's smaller than the canvas. */
  px: number;
  py: number;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view: View = { cell: 20, cols: 0, rows: 0, ox: 0, oy: 0, px: 0, py: 0 };
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
    const cell = Math.max(16, Math.min(30, fit));
    this.view.cell = cell;
    this.view.cols = Math.min(mapW, Math.floor(w / cell));
    this.view.rows = Math.min(mapH, Math.floor(h / cell));
    this.view.px = Math.floor((w - this.view.cols * cell) / 2);
    this.view.py = Math.floor((h - this.view.rows * cell) / 2);
  }

  /** Map tile under a canvas-relative point, or null. */
  tileAt(cx: number, cy: number): { x: number; y: number } | null {
    const v = this.view;
    const x = Math.floor((cx - v.px) / v.cell) + v.ox;
    const y = Math.floor((cy - v.py) / v.cell) + v.oy;
    if (x < v.ox || y < v.oy || x >= v.ox + v.cols || y >= v.oy + v.rows) return null;
    return { x, y };
  }

  draw(game: Game) {
    const { ctx, view: v } = this;
    const run = game.run;
    const f = run.floor;
    const p = run.player;
    const dark = game.has('darkness');
    const elements = game.has('elements');

    v.ox = Math.max(0, Math.min(f.w - v.cols, p.x - Math.floor(v.cols / 2)));
    v.oy = Math.max(0, Math.min(f.h - v.rows, p.y - Math.floor(v.rows / 2)));

    const W = this.canvas.width / (window.devicePixelRatio || 1);
    const H = this.canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, W, H);

    const c = v.cell;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = (ch: string, x: number, y: number, color: string, bold = false, scale = 0.72) => {
      ctx.font = `${bold ? 700 : 500} ${Math.round(c * scale)}px ${MONO}`;
      ctx.fillStyle = color;
      ctx.fillText(ch, v.px + (x - v.ox) * c + c / 2, v.py + (y - v.oy) * c + c / 2 + 1);
    };

    for (let y = v.oy; y < v.oy + v.rows; y++) {
      for (let x = v.ox; x < v.ox + v.cols; x++) {
        const i = idx(f, x, y);
        const seen = game.visible.has(i);
        if (dark && !seen && !f.explored[i]) continue;
        ctx.globalAlpha = seen ? 1 : 0.38;
        const sx = v.px + (x - v.ox) * c;
        const sy = v.py + (y - v.oy) * c;
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
      const sx = v.px + (m.x - v.ox) * c;
      const sy = v.py + (m.y - v.oy) * c;
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
      ctx.strokeRect(v.px + (Number(x) - v.ox) * c + 1, v.py + (Number(y) - v.oy) * c + 1, c - 2, c - 2);
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
