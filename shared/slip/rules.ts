/**
 * Slip's rules (spec §2): a turn is your action, a sight check, the guards' step, a sight check.
 * Being seen costs HEAT and starts a chase; past the board's maximum, or under a guard's feet,
 * you're CAUGHT. Pure: `step` returns a new state and never changes the one it's given, so the
 * game and the solver play by exactly the same code.
 */
import type { Tier } from '../gig/rules';
import { stepToward } from './paths';

/** 0: +u, 1: +v, 2: −u, 3: −v — also the tie order everywhere. */
export type Dir = 0 | 1 | 2 | 3;
export const DU: readonly number[] = [1, 0, -1, 0];
export const DV: readonly number[] = [0, 1, 0, -1];

export type SlipNodeType = 'ENTRY' | 'TARGET' | 'EXIT' | 'HIDE' | 'plain';
/** A lattice cell; `adj[d]` is the node linked that way, or -1. */
export interface SlipNode {
  id: number;
  u: number;
  v: number;
  type: SlipNodeType;
  adj: [number, number, number, number];
}
export type PatrolKind = 'post' | 'pace' | 'loop';
/** A patrol is a cycle of poses (node, facing); a guard takes the next one each turn. */
export interface Guard {
  kind: PatrolKind;
  poses: [number, Dir][];
  startPi: number;
}
/** A camera faces `dirs[phase % dirs.length]`: one direction when fixed, two alternating when it sweeps. */
export interface Camera {
  node: number;
  dirs: Dir[];
  kind: 'fixed' | 'sweep';
}
export interface SlipBoard {
  tier: Tier;
  seed: number;
  W: number;
  H: number;
  max: number;
  nodes: SlipNode[];
  dist: number[][];
  entry: number;
  target: number;
  /** ENTRY's id on easy boards. */
  exit: number;
  guards: Guard[];
  cams: Camera[];
  /** A board is only dealt with a never-seen route, so the best HEAT is always 0. */
  par: 0;
  tries: number;
  /** One clean route, for the dev strip's SHOW SOLUTION and the tests. */
  solution: SlipAction[];
}
export type Mode = 'patrol' | 'investigate' | 'chase' | 'search' | 'return';
/** `x`: the noise being checked; `t`: investigate's looked-back flag, or search's turns left. */
export interface GuardState {
  n: number;
  f: Dir;
  m: Mode;
  pi: number;
  x: number;
  t: number;
}
export interface SlipState {
  /** Your node; -1 only in predictWatch's ghost. */
  p: number;
  lifted: boolean;
  charges: number;
  heat: number;
  turn: number;
  phase: 0 | 1;
  jam: number[];
  /** Where you were last seen (-1: never); every chasing guard heads there. */
  last: number;
  g: GuardState[];
  over: null | 'out' | 'caught';
  cause: '' | 'heat' | 'contact';
}
export type SlipAction = { k: 'move'; d: Dir } | { k: 'wait' } | { k: 'noise'; n: number } | { k: 'jam'; c: number } | { k: 'lift' };
export type SlipEvent =
  | { k: 'move'; to: number }
  | { k: 'wait' }
  | { k: 'hide' }
  | { k: 'lift' }
  | { k: 'out' }
  | { k: 'noise'; at: number; guard: number | null }
  | { k: 'jam'; cam: number }
  | { k: 'spotted' | 'seen'; guard: number; heat: number }
  | { k: 'camera'; cam: number; heat: number }
  | { k: 'caught'; why: 'heat' | 'contact'; guard?: number; hidden?: boolean };
/** What one watcher sees: its own node, and the next one along its facing if linked. */
export interface Watch {
  guard?: number;
  cam?: number;
  from: number;
  f: Dir;
  nodes: number[];
}
export type SlipOutcome = 'clean' | 'close' | 'caught';

export const KIT = { name: 'Street kit', charges: 3 };
export const SLIP_RULES = { heatGuard: 3, heatChase: 1, heatCam: 2, noiseRange: 2, hearRange: 3, jamRange: 2, jamTurns: 3, searchTurns: 2 } as const;
export const SLIP_MAX: Record<Tier, number> = { easy: 6, medium: 8, hard: 10 };

export const guardLabel = (i: number): string => `G-${String(i + 1).padStart(2, '0')}`;
export const camLabel = (i: number): string => `CAM ${i + 1}`;

export function startSlip(board: SlipBoard, charges: number = KIT.charges): SlipState {
  return {
    p: board.entry,
    lifted: false,
    charges,
    heat: 0,
    turn: 0,
    phase: 0,
    jam: board.cams.map(() => 0),
    last: -1,
    over: null,
    cause: '',
    g: board.guards.map((g) => {
      const [n, f] = g.poses[g.startPi];
      return { n, f, m: 'patrol', pi: g.startPi, x: -1, t: 0 };
    }),
  };
}

const clone = (s: SlipState): SlipState => ({ ...s, jam: [...s.jam], g: s.g.map((x) => ({ ...x })) });
const camFacing = (c: Camera, phase: number): Dir => c.dirs[phase % c.dirs.length];

function sight(board: SlipBoard, node: number, f: Dir): number[] {
  const nb = board.nodes[node].adj[f];
  return nb >= 0 ? [node, nb] : [node];
}

export function watchedBy(board: SlipBoard, s: SlipState): Watch[] {
  const out: Watch[] = s.g.map((g, i) => ({ guard: i, from: g.n, f: g.f, nodes: sight(board, g.n, g.f) }));
  board.cams.forEach((c, i) => {
    if (s.jam[i] > 0) return;
    const f = camFacing(c, s.phase);
    out.push({ cam: i, from: c.node, f, nodes: sight(board, c.node, f) });
  });
  return out;
}

/** Where everyone will be watching after the guards' next step, if you're seen by nobody meanwhile. */
export function predictWatch(board: SlipBoard, s: SlipState): Watch[] {
  return watchedBy(board, step(board, { ...clone(s), p: -1, over: null }, { k: 'wait' }).state);
}

export function illegal(board: SlipBoard, s: SlipState, a: SlipAction): string | null {
  if (s.over) return 'the run is over';
  switch (a.k) {
    case 'move': {
      const nb = board.nodes[s.p].adj[a.d];
      if (nb < 0) return 'no way through';
      return s.g.some((g) => g.n === nb) ? "a guard's there" : null;
    }
    case 'wait':
      return null;
    case 'noise':
      if (s.charges <= 0) return 'no charges';
      return board.dist[s.p][a.n] <= SLIP_RULES.noiseRange ? null : 'out of range';
    case 'jam':
      if (s.charges <= 0) return 'no charges';
      return board.dist[s.p][board.cams[a.c].node] <= SLIP_RULES.jamRange ? null : 'out of range';
    case 'lift':
      return s.p === board.target && !s.lifted ? null : 'nothing to lift here';
  }
}

/** One turn (spec §2.4). `noHide` treats HIDE as plain floor (the hard tier's acceptance check). */
export function step(board: SlipBoard, s0: SlipState, a: SlipAction, opts: { noHide?: boolean } = {}): { state: SlipState; events: SlipEvent[] } {
  const s = clone(s0);
  const events: SlipEvent[] = [];
  const counted = new Set<string>();
  const hold = new Set<number>();
  const hidden = () => !opts.noHide && board.nodes[s.p].type === 'HIDE';

  const check = (first: boolean) => {
    if (s.over || s.p < 0 || hidden()) return;
    s.g.forEach((g, i) => {
      if (counted.has(`g${i}`) || !sight(board, g.n, g.f).includes(s.p)) return;
      counted.add(`g${i}`);
      const heat = g.m === 'chase' ? SLIP_RULES.heatChase : SLIP_RULES.heatGuard;
      s.heat += heat;
      s.last = s.p;
      // First spotted on your move: the guard stops to call it, rather than stepping straight onto
      // you. A guard already chasing you doesn't stop.
      if (first && g.m !== 'chase') hold.add(i);
      events.push({ k: g.m === 'chase' ? 'seen' : 'spotted', guard: i, heat });
      g.m = 'chase';
    });
    board.cams.forEach((c, i) => {
      if (counted.has(`c${i}`) || s.jam[i] > 0 || !sight(board, c.node, camFacing(c, s.phase)).includes(s.p)) return;
      counted.add(`c${i}`);
      s.heat += SLIP_RULES.heatCam;
      s.last = s.p;
      events.push({ k: 'camera', cam: i, heat: SLIP_RULES.heatCam });
    });
    if (s.heat > board.max) {
      s.over = 'caught';
      s.cause = 'heat';
      events.push({ k: 'caught', why: 'heat' });
    }
  };

  // 1. Your action.
  if (a.k === 'move') {
    s.p = board.nodes[s.p].adj[a.d];
    events.push({ k: 'move', to: s.p });
    if (hidden()) events.push({ k: 'hide' });
    if (s.p === board.exit && s.lifted) {
      s.over = 'out';
      s.turn++;
      events.push({ k: 'out' });
      return { state: s, events };
    }
  } else if (a.k === 'wait') {
    events.push({ k: 'wait' });
  } else if (a.k === 'noise') {
    s.charges--;
    let heard = -1;
    let best = Infinity;
    s.g.forEach((g, i) => {
      if (g.m !== 'patrol' && g.m !== 'return') return;
      const d = board.dist[g.n][a.n];
      if (d <= SLIP_RULES.hearRange && d < best) {
        heard = i;
        best = d;
      }
    });
    if (heard >= 0) Object.assign(s.g[heard], { m: 'investigate', x: a.n, t: 0 });
    events.push({ k: 'noise', at: a.n, guard: heard >= 0 ? heard : null });
  } else if (a.k === 'jam') {
    s.charges--;
    s.jam[a.c] = SLIP_RULES.jamTurns;
    events.push({ k: 'jam', cam: a.c });
  } else {
    s.lifted = true;
    events.push({ k: 'lift' });
  }

  // 2. Sight.
  check(true);

  // 3. The guards step, in order.
  s.g.forEach((g, i) => {
    if (s.over || hold.has(i)) return;
    moveGuard(board, s, g, board.guards[i]);
    if (g.n === s.p) {
      s.over = 'caught';
      s.cause = 'contact';
      events.push({ k: 'caught', why: 'contact', guard: i, hidden: board.nodes[s.p].type === 'HIDE' });
    }
  });

  // 4. Sight again, then the turn ends.
  check(false);
  s.jam = s.jam.map((t) => Math.max(0, t - 1));
  s.phase = s.phase === 0 ? 1 : 0;
  s.turn++;
  return { state: s, events };
}

function walk(board: SlipBoard, g: GuardState, to: number): void {
  const [nb, d] = stepToward(board, g.n, to);
  g.n = nb;
  if (d >= 0) g.f = d as Dir;
}

function goReturn(board: SlipBoard, g: GuardState, G: Guard): void {
  g.m = 'return';
  let to = -1;
  let best = Infinity;
  let pi = 0;
  G.poses.forEach(([n], k) => {
    const d = board.dist[g.n][n];
    if (d < best) {
      best = d;
      to = n;
      pi = k;
    }
  });
  if (best === 0) {
    g.m = 'patrol';
    g.pi = pi;
    g.f = G.poses[pi][1];
  } else walk(board, g, to);
}

function searchTurn(board: SlipBoard, g: GuardState, G: Guard): void {
  if (g.t <= 0) return goReturn(board, g, G);
  for (let k = 1; k <= 4; k++) {
    const d = ((g.f + k) % 4) as Dir;
    if (board.nodes[g.n].adj[d] >= 0) {
      g.f = d;
      break;
    }
  }
  g.t--;
}

function moveGuard(board: SlipBoard, s: SlipState, g: GuardState, G: Guard): void {
  switch (g.m) {
    case 'patrol':
      g.pi = (g.pi + 1) % G.poses.length;
      [g.n, g.f] = G.poses[g.pi];
      return;
    case 'investigate':
      if (g.n !== g.x) walk(board, g, g.x);
      else if (!g.t) {
        g.f = ((g.f + 2) % 4) as Dir;
        g.t = 1;
      } else goReturn(board, g, G);
      return;
    case 'chase':
      if (g.n !== s.last) return walk(board, g, s.last);
      g.m = 'search';
      g.t = SLIP_RULES.searchTurns;
      return searchTurn(board, g, G);
    case 'search':
      return searchTurn(board, g, G);
    case 'return':
      return goReturn(board, g, G);
  }
}

export function outcomeOf(s: SlipState): SlipOutcome | null {
  if (s.over === 'caught') return 'caught';
  if (s.over === 'out') return s.heat <= 0 ? 'clean' : 'close';
  return null;
}
