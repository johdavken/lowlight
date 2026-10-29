/**
 * Slip's solver (spec §3.3). A board is only dealt with a never-seen route, so par is 0 and the
 * question is only "is there a clean way out, and what is it": a breadth-first search over the
 * states where nobody has seen you. Run in stages, cheapest first — no tools, JAM only, then NOISE
 * too — because NOISE sends guards off their routes and multiplies the states.
 */
import { stepToward } from './paths';
import { illegal, SLIP_RULES, startSlip, step, type SlipAction, type SlipBoard, type SlipState } from './rules';

export const TURN_CAP = 60;
export const STATE_CAP = 8000;

export interface SolveOpts {
  noTools?: boolean;
  noNoise?: boolean;
  noHide?: boolean;
}
export interface SolveResult {
  actions: SlipAction[] | null;
  states: number;
  capped: boolean;
}

function actionsFor(board: SlipBoard, s: SlipState, opts: SolveOpts): SlipAction[] {
  const out: SlipAction[] = [];
  for (const d of [0, 1, 2, 3] as const) if (!illegal(board, s, { k: 'move', d })) out.push({ k: 'move', d });
  out.push({ k: 'wait' });
  if (s.p === board.target && !s.lifted) out.push({ k: 'lift' });
  if (opts.noTools || s.charges <= 0) return out;
  // Only throws someone would hear: a wasted charge never helps.
  if (!opts.noNoise)
    for (const n of board.nodes) {
      if (board.dist[s.p][n.id] > SLIP_RULES.noiseRange) continue;
      if (s.g.some((g) => (g.m === 'patrol' || g.m === 'return') && board.dist[g.n][n.id] <= SLIP_RULES.hearRange)) out.push({ k: 'noise', n: n.id });
    }
  board.cams.forEach((c, i) => {
    if (board.dist[s.p][c.node] <= SLIP_RULES.jamRange && s.jam[i] === 0) out.push({ k: 'jam', c: i });
  });
  return out;
}

/** The state without its charges: a state reached with more charges left covers the same one with fewer. */
function key(s: SlipState): string {
  let k = `${s.p}|${s.lifted ? 1 : 0}|${s.phase}|${s.jam.join('.')}|`;
  for (const g of s.g) k += `${g.n}.${g.f}.${g.m}.${g.pi}.${g.x}.${g.t};`;
  return k;
}

interface Path {
  a: SlipAction;
  prev: Path | null;
}

/** One stage: the shortest never-seen route out, or null. */
export function bfsClean(board: SlipBoard, opts: SolveOpts = {}): SolveResult {
  const s0 = startSlip(board);
  const best = new Map<string, number>([[key(s0), s0.charges]]);
  let frontier: { s: SlipState; path: Path | null }[] = [{ s: s0, path: null }];
  let states = 1;
  for (let depth = 0; depth < TURN_CAP && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { s, path } of frontier)
      for (const a of actionsFor(board, s, opts)) {
        const t = step(board, s, a, { noHide: opts.noHide }).state;
        if (t.heat > 0 || t.over === 'caught') continue;
        const p: Path = { a, prev: path };
        if (t.over === 'out') {
          const actions: SlipAction[] = [];
          for (let q: Path | null = p; q; q = q.prev) actions.unshift(q.a);
          return { actions, states, capped: false };
        }
        const k = key(t);
        const had = best.get(k);
        if (had !== undefined && had >= t.charges) continue;
        best.set(k, t.charges);
        if (++states > STATE_CAP) return { actions: null, states, capped: true };
        next.push({ s: t, path: p });
      }
    frontier = next;
  }
  return { actions: null, states, capped: false };
}

/** In stages: no tools, then JAM only, then everything. A caller's noTools runs that one stage alone. */
export function solveClean(board: SlipBoard, opts: SolveOpts = {}): SolveResult {
  if (opts.noTools) return bfsClean(board, opts);
  let states = 0;
  const stages: SolveOpts[] = [{ noTools: true }, { noNoise: true }, {}];
  for (const [i, stage] of stages.entries()) {
    const r = bfsClean(board, { ...opts, ...stage });
    states += r.states;
    if (r.actions || i === stages.length - 1) return { ...r, states };
  }
  throw new Error('unreachable');
}

/** The naive route — shortest in, LIFT, shortest out, no waiting, no tools — gets you seen (or blocked). */
export function naiveSeen(board: SlipBoard): boolean {
  let s = startSlip(board);
  const go = (to: number): boolean => {
    while (s.p !== to && !s.over) {
      const [nb, d] = stepToward(board, s.p, to);
      if (d === -1) return true;
      const a: SlipAction = { k: 'move', d };
      if (illegal(board, s, a)) return true;
      s = step(board, s, a).state;
      if (s.heat > 0 || s.over === 'caught') return true;
      if (nb === board.exit && s.lifted) return false;
    }
    return s.heat > 0 || s.over === 'caught';
  };
  if (go(board.target)) return true;
  s = step(board, s, { k: 'lift' }).state;
  if (s.heat > 0 || s.over === 'caught') return true;
  if (board.exit === s.p) return false;
  return go(board.exit);
}
