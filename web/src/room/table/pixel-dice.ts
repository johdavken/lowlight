/**
 * The table's dice (picked 2026-11-02 on the Dice Rolls mockup, option E at 1.5×): real 3D dice drawn a pixel at a
 * time into a small canvas and scaled up with hard edges, so they stay pixel art at every angle, on the figures' grid
 * or finer. They tumble in from the right, hop on whole-pixel steps over their shadows and land on the rolled faces.
 * The view is orthographic, so each face maps to the screen affinely and a pixel's spot on a face is two divisions.
 */

/** Screen pixels per canvas pixel. */
export const PIXEL = 1.5;
/** Canvas pixels per mockup unit (the dice were tuned at 3×, so everything drawn scales by 3 / PIXEL). */
const Q = 3 / PIXEL;
const HS = Math.round(9 * Q);
const H = Math.round(60 * Q);
const GROUND = Math.round(52 * Q);
const STEP = 34 * Q;
const LEFT = 20 * Q;
/** Room on the right for the dice to roll in from (kept clear of the stamp at rest). */
const RUN = 90 * Q;
export const ROLL_MS = 1100;
export const RED_ROLL_MS = 1600;
/** Each die leaves this long after the one before. */
const STAGGER_MS = 110;

type Rgb = [number, number, number];
type Mat = number[][];
type Vec = [number, number, number];
export type DieTone = 'plain' | 'kept' | 'miss' | 'dead';

const hex = (c: string): Rgb => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as Rgb;
/** Four shades a side (darkest first), the pips, and the line round the die. */
const PAL: Record<DieTone, { face: Rgb[]; pip: Rgb; line: Rgb }> = {
  plain: { face: ['#5d7a85', '#8fb3bd', '#c4e0e7', '#eef9fb'].map(hex), pip: hex('#120a22'), line: hex('#05020a') },
  kept: { face: ['#8a5a1a', '#c88a2e', '#ffc56b', '#ffe8bd'].map(hex), pip: hex('#2a1204'), line: hex('#ffc56b') },
  miss: { face: ['#7a2a2a', '#b84848', '#ff8a8a', '#ffd6d6'].map(hex), pip: hex('#2a0606'), line: hex('#ff5a5a') },
  dead: { face: ['#3a4448', '#56666c', '#74878d', '#93a5aa'].map(hex), pip: hex('#120a22'), line: hex('#05020a') },
};

const mul = (A: Mat, B: Mat): Mat => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const apply = (M: Mat, v: readonly number[]): Vec => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as Vec;
const rotX = (a: number): Mat => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a: number): Mat => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
function axisAngle([x, y, z]: Vec, a: number): Mat {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}
const DEG = Math.PI / 180;
/** Looking a little down and from the left, so a landed die shows its face with some top and side. */
const CAM = mul(rotX(22 * DEG), rotY(-24 * DEG));
/** The turn that brings each face to the front. */
const TO_FRONT: Record<number, Mat> = { 1: rotY(0), 6: rotY(Math.PI), 2: rotY(-Math.PI / 2), 5: rotY(Math.PI / 2), 3: rotX(Math.PI / 2), 4: rotX(-Math.PI / 2) };
/** A die's sides (opposites add to 7): the outward normal and the face's own right and up. */
export const FACES: { f: number; n: Vec; u: Vec; v: Vec }[] = [
  { f: 1, n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { f: 6, n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { f: 2, n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { f: 5, n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { f: 3, n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { f: 4, n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, 0.5], [0.5, -0.5]],
  3: [[-0.5, 0.5], [0, 0], [0.5, -0.5]],
  4: [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]],
  5: [[-0.5, 0.5], [0.5, 0.5], [0, 0], [-0.5, -0.5], [0.5, -0.5]],
  6: [[-0.5, 0.5], [0.5, 0.5], [-0.5, 0], [0.5, 0], [-0.5, -0.5], [0.5, -0.5]],
};
const LIGHT: Vec = (() => {
  const l: Vec = [-0.3, 0.5, 0.81];
  const m = Math.hypot(...l);
  return l.map((x) => x / m) as Vec;
})();

/** A die's turn: `spin` radians about `axis` still to unwind, on top of the turn that shows `face`. */
export function orientation(face: number, axis: Vec, spin: number): Mat {
  return mul(CAM, mul(axisAngle(axis, spin), TO_FRONT[face]));
}

/** The face nearest the viewer under a turn (the one a landed die shows). */
export function faceShown(R: Mat): number {
  let best = FACES[0];
  for (const F of FACES) if (apply(R, F.n)[2] > apply(R, best.n)[2]) best = F;
  return best.f;
}

/** One die into `img` (RGBA, `w` wide): each visible side, its pixels found by solving the side's 2×2 map. */
export function drawDie(img: Uint8ClampedArray, ids: Int16Array, w: number, id: number, cx: number, cy: number, R: Mat, tone: DieTone): void {
  const h = ids.length / w;
  const pal = PAL[tone];
  for (const F of FACES) {
    const n = apply(R, F.n);
    if (n[2] <= 0.04) continue;
    const c = apply(R, F.n.map((x) => x * HS));
    const au = apply(R, F.u.map((x) => x * HS));
    const av = apply(R, F.v.map((x) => x * HS));
    const det = au[0] * av[1] - au[1] * av[0];
    if (Math.abs(det) < 1e-3) continue;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        xs.push(cx + c[0] + su * au[0] + sv * av[0]);
        ys.push(cy - (c[1] + su * au[1] + sv * av[1]));
      }
    const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const level = Math.min(3, Math.floor(lit * 4));
    for (let py = Math.max(0, Math.floor(Math.min(...ys))); py <= Math.min(h - 1, Math.ceil(Math.max(...ys))); py++) {
      for (let px = Math.max(0, Math.floor(Math.min(...xs))); px <= Math.min(w - 1, Math.ceil(Math.max(...xs))); px++) {
        const X = px + 0.5 - cx - c[0];
        const Y = cy - (py + 0.5) - c[1];
        const u = (X * av[1] - Y * av[0]) / det;
        const v = (Y * au[0] - X * au[1]) / det;
        if (Math.abs(u) > 1 || Math.abs(v) > 1) continue;
        // Rounded corners.
        const cu = Math.abs(u) - 0.7;
        const cv = Math.abs(v) - 0.7;
        if (cu > 0 && cv > 0 && cu * cu + cv * cv > 0.09) continue;
        const col = PIPS[F.f].some(([pu, pv]) => (u - pu) ** 2 + (v - pv) ** 2 < 0.028)
          ? pal.pip
          : pal.face[Math.max(0, Math.max(Math.abs(u), Math.abs(v)) > 0.84 ? level - 1 : level)];
        const k = (py * w + px) * 4;
        img[k] = col[0];
        img[k + 1] = col[1];
        img[k + 2] = col[2];
        img[k + 3] = 255;
        ids[py * w + px] = id;
      }
    }
  }
}

interface Die {
  face: number;
  x0: number;
  x1: number;
  x: number;
  axis: Vec;
  spin: number;
  delay: number;
  hop: number;
  lift: number;
  R: Mat;
  tone: DieTone;
  /** Touchdowns played so far (the bounces, then the settle). */
  hits: number;
  /** Its taps' pitch. */
  rate: number;
}

/** Every die and its shadow into `img`, then a line round each in its colour, and for a lit die a faint second ring. */
export function drawTray(img: Uint8ClampedArray, w: number, dice: readonly Pick<Die, 'x' | 'hop' | 'lift' | 'R' | 'tone'>[]): void {
  const h = img.length / 4 / w;
  const ids = new Int16Array(w * h).fill(-1);
  const ry = Math.ceil(Q);
  for (const d of dice) {
    const rx = Math.max(4 * Q, Math.round(11 * Q - d.hop * 0.35));
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (2.2 * Q * Q) > 1) continue;
        const px = Math.round(d.x) + x;
        const py = GROUND + y;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        img[(py * w + px) * 4 + 3] = 120;
      }
  }
  dice.forEach((d, i) => drawDie(img, ids, w, i, Math.round(d.x), Math.round(GROUND - 15 * Q - d.hop - d.lift), d.R, d.tone));
  const owner = new Int16Array(w * h).fill(-1);
  const ring = (src: Int16Array, alpha: number, only?: (o: number) => boolean) => {
    const marks: [number, number, number][] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (ids[y * w + x] >= 0 || owner[y * w + x] >= 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx;
          const Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const o = src[Y * w + X];
          if (o < 0 || (only && !only(o))) continue;
          marks.push([x, y, o]);
          break;
        }
      }
    for (const [x, y, o] of marks) {
      const k = (y * w + x) * 4;
      const c = PAL[dice[o].tone].line;
      img[k] = c[0];
      img[k + 1] = c[1];
      img[k + 2] = c[2];
      img[k + 3] = alpha;
      owner[y * w + x] = o;
    }
  };
  ring(ids, 255);
  ring(owner, 110, (o) => dice[o].tone === 'kept' || dice[o].tone === 'miss');
}

export interface PixelRoll {
  /** The tray: the canvas, and room beside the dice for the stamp. */
  root: HTMLElement;
  /** Where the dice end, from the tray's left (screen pixels): the stamp goes after it. */
  restWidth: number;
  /** Resolves when every die has landed. */
  landed: Promise<void>;
  /** Lands them all now (a click). */
  land(): void;
  /** The result: these dice in `tone` (and lifted), the rest dimmed unless `dimRest` is false. */
  light(lit: number[], tone: 'kept' | 'miss', dimRest: boolean): void;
  /** The changed dice glitch through faces and land on `to` (a save, crew abilities): resolves when they're down. */
  glitch(to: number[], ms: number): Promise<void>;
  /** Stops drawing. */
  stop(): void;
}

/** Tones a glitching die flickers through, a frame each. */
const GLITCH_TONES: DieTone[] = ['miss', 'kept', 'plain'];
const GLITCH_FRAME_MS = 50;

/** A pitch per die, so three dice don't knock as one. */
const RATES = [1, 0.92, 1.08, 0.96, 1.04];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const now = () => performance.now();
const frame = (fn: () => void) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

/**
 * Rolls `faces` into a fresh tray. `tap` hears every touchdown, its loudness falling with the hops and a pitch per
 * die (a settle is quieter); landing on a click plays one tap instead. With `reduced` they're down at once, silent.
 */
export function rollPixelDice(o: { faces: number[]; red: boolean; reduced: boolean; tap?(level: number, rate: number): void }): PixelRoll {
  const n = o.faces.length;
  const w = Math.round(LEFT + n * STEP + RUN);
  const root = document.createElement('div');
  root.className = 'tb-roll';
  const canvas = document.createElement('canvas');
  canvas.className = 'tb-roll-dice';
  canvas.width = w;
  canvas.height = H;
  canvas.style.width = `${w * PIXEL}px`;
  canvas.style.height = `${H * PIXEL}px`;
  canvas.dataset.faces = o.faces.join(',');
  root.append(canvas);
  const restWidth = (LEFT + n * STEP) * PIXEL;
  root.style.setProperty('--rest', `${restWidth}px`);
  // jsdom has no 2D context: the tray still runs, nothing is drawn.
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  const dur = o.red ? RED_ROLL_MS : ROLL_MS;
  const bounces = o.red ? 3.5 : 2.5;
  const dice: Die[] = o.faces.map((face, i) => {
    const ax: Vec = [rnd(-0.4, 0.4), rnd(0.3, 0.8), 1];
    const m = Math.hypot(...ax);
    const x1 = LEFT + STEP / 2 + i * STEP;
    return {
      face,
      x1,
      x0: w + HS * 2 + i * 18 * Q,
      x: x1,
      axis: ax.map((a) => a / m) as Vec,
      spin: (2 + (i % 2) + (o.red ? 1 : 0)) * 2 * Math.PI + rnd(0, 0.6),
      delay: i * STAGGER_MS,
      hop: 0,
      lift: 0,
      R: orientation(face, [0, 0, 1], 0),
      tone: 'plain',
      hits: 0,
      rate: RATES[i % RATES.length],
    };
  });
  const paint = () => {
    if (!ctx) return;
    const data = ctx.createImageData(w, H);
    drawTray(data.data, w, dice);
    ctx.putImageData(data, 0, 0);
  };
  let fast = o.reduced;
  let stopped = false;
  let done!: () => void;
  const landed = new Promise<void>((r) => (done = r));
  const t0 = now();
  const step = () => {
    if (stopped) return;
    let all = true;
    for (const d of dice) {
      const t = fast ? 1 : Math.max(0, Math.min(1, (now() - t0 - d.delay) / dur));
      if (t < 1) all = false;
      const e = 1 - Math.pow(1 - t, 3);
      d.x = d.x0 + (d.x1 - d.x0) * e;
      d.hop = Math.round(Math.abs(Math.sin(Math.PI * t * bounces)) * 16 * Q * Math.pow(1 - t, 1.6));
      d.R = orientation(d.face, d.axis, (1 - e) * d.spin);
      if (fast) continue;
      // A touchdown each time the hop comes back to the floor, then the settle. A long frame (a hidden tab coming
      // back) plays only the latest, not a pile of knocks at once.
      const due = t >= 1 ? Math.floor(bounces) + 1 : Math.floor(t * bounces);
      if (due - d.hits > 1) d.hits = due - 1;
      while (d.hits < due) {
        d.hits++;
        const settle = d.hits > Math.floor(bounces);
        const at = d.hits / bounces;
        o.tap?.(settle ? 0.3 : Math.max(0.3, Math.pow(1 - at + 0.25, 1.6)), d.rate);
      }
    }
    paint();
    if (all) return done();
    frame(step);
  };
  step();
  // Frames stop in a hidden tab: they land by the clock anyway, so the table never waits on a tab coming back.
  const backstop = o.reduced ? null : setTimeout(() => land(), dur + (n - 1) * STAGGER_MS + 200);
  function land() {
    if (fast) return;
    fast = true;
    if (dice.some((d) => d.hits <= Math.floor(bounces))) o.tap?.(0.8, 1);
    step();
  }
  return {
    root,
    restWidth,
    landed,
    land() {
      if (backstop) clearTimeout(backstop);
      land();
    },
    light(lit, tone, dimRest) {
      dice.forEach((d, i) => (d.tone = lit.includes(i) ? tone : dimRest ? 'dead' : 'plain'));
      canvas.dataset.lit = lit.join(',');
      const t1 = now();
      dice.forEach((d, i) => !lit.includes(i) && (d.lift = 0));
      // A stopped tray (a save after the roll's animation) lights at once.
      const rise = () => {
        const k = o.reduced || stopped ? 1 : Math.min(1, (now() - t1) / 200);
        for (const i of lit) dice[i].lift = Math.round(5 * Q * k);
        paint();
        if (k < 1) frame(rise);
      };
      rise();
    },
    glitch(to, ms) {
      const which = dice.flatMap((d, i) => (d.face !== to[i] ? [i] : []));
      canvas.dataset.faces = to.join(',');
      const t1 = now();
      return new Promise<void>((resolve) => {
        let over = false;
        const end = () => {
          if (over) return;
          over = true;
          clearTimeout(late);
          for (const i of which) {
            const d = dice[i];
            d.face = to[i];
            d.x = d.x1;
            d.R = orientation(d.face, [0, 0, 1], 0);
          }
          paint();
          resolve();
        };
        // Frames stop in a hidden tab: it lands by the clock.
        const late = setTimeout(end, o.reduced ? 0 : ms + 100);
        if (o.reduced || ms <= 0) return end();
        let shown = -1;
        // A new face, a sideways jump and a tone each frame, on whole pixels.
        const tick = () => {
          if (over) return;
          const t = now() - t1;
          if (t >= ms) return end();
          const k = Math.floor(t / GLITCH_FRAME_MS);
          if (k !== shown) {
            shown = k;
            for (const i of which) {
              const d = dice[i];
              d.R = orientation(1 + Math.floor(Math.random() * 6), [0, 0, 1], 0);
              d.x = d.x1 + Math.round(rnd(-3, 3) * Q);
              d.tone = GLITCH_TONES[(k + i) % GLITCH_TONES.length];
            }
            paint();
          }
          frame(tick);
        };
        tick();
      });
    },
    stop() {
      stopped = true;
      if (backstop) clearTimeout(backstop);
    },
  };
}
