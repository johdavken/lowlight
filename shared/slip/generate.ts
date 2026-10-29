/**
 * Slip's generator (spec §3.2): a seeded floor on a lattice — a carved tree plus loops — with
 * ENTRY on an edge, TARGET and EXIT far from it, hiding spots, guards on patrols that fit the
 * floor's shape, and cameras; kept only if the solver finds a clean way out that the naive route
 * misses. A port of the playable mockup's engine, call for call, so a seed makes the same board.
 */
import { rng } from '../gig/generate';
import type { Tier } from '../gig/rules';
import { allDistances } from './paths';
import { DU, DV, SLIP_MAX, type Camera, type Dir, type Guard, type PatrolKind, type SlipBoard, type SlipNode } from './rules';
import { bfsClean, naiveSeen, solveClean } from './solve';

type GuardKind = PatrolKind | 'postpace' | 'loopany';
export const SLIP_TIERS: Record<Tier, { W: number; H: number; nodes: number; extra: number; guards: GuardKind[]; cams: Camera['kind'][]; hide: number; exitIsEntry: boolean }> = {
  easy: { W: 5, H: 4, nodes: 10, extra: 3, guards: ['postpace'], cams: ['fixed'], hide: 1, exitIsEntry: true },
  medium: { W: 6, H: 5, nodes: 15, extra: 6, guards: ['loopany', 'postpace'], cams: ['sweep'], hide: 2, exitIsEntry: false },
  hard: { W: 7, H: 6, nodes: 20, extra: 8, guards: ['loop', 'pace', 'post'], cams: ['fixed', 'sweep'], hide: 2, exitIsEntry: false },
};
export const SLIP_TRIES = 400;

type Rand = () => number;
const pick = <T>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
function shuffle<T>(r: Rand, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const DIRS: Dir[] = [0, 1, 2, 3];

/** A random tree grown through the lattice (newest-biased), then extra links between neighbours. */
function carve(r: Rand, T: (typeof SLIP_TIERS)[Tier]): SlipNode[] {
  const { W, H } = T;
  const cell = new Map<string, number>();
  const nodes: SlipNode[] = [];
  const add = (u: number, v: number) => {
    const id = nodes.length;
    nodes.push({ id, u, v, type: 'plain', adj: [-1, -1, -1, -1] });
    cell.set(`${u},${v}`, id);
    return id;
  };
  const link = (a: number, b: number, d: Dir) => {
    nodes[a].adj[d] = b;
    nodes[b].adj[(d + 2) % 4] = a;
  };
  const free = (n: SlipNode) =>
    DIRS.filter((d) => {
      const u = n.u + DU[d];
      const v = n.v + DV[d];
      return u >= 0 && v >= 0 && u < W && v < H && !cell.has(`${u},${v}`);
    });
  const edgeCells: [number, number][] = [];
  for (let u = 0; u < W; u++) for (let v = 0; v < H; v++) if (u === 0 || v === 0 || u === W - 1 || v === H - 1) edgeCells.push([u, v]);
  const [su, sv] = pick(r, edgeCells);
  add(su, sv);
  let newest = 0;
  while (nodes.length < T.nodes) {
    let from = nodes[newest];
    if (r() > 0.6 || free(from).length === 0) {
      const open = nodes.filter((n) => free(n).length > 0);
      if (open.length === 0) break;
      from = pick(r, open);
    }
    const d = pick(r, free(from));
    const id = add(from.u + DU[d], from.v + DV[d]);
    link(from.id, id, d);
    newest = id;
  }
  const cand: [number, number, Dir][] = [];
  for (const n of nodes)
    for (const d of [0, 1] as Dir[]) {
      const m = cell.get(`${n.u + DU[d]},${n.v + DV[d]}`);
      if (m !== undefined && n.adj[d] === -1) cand.push([n.id, m, d]);
    }
  for (const [a, b, d] of shuffle(r, cand).slice(0, T.extra)) link(a, b, d);
  return nodes;
}

/** Simple cycles of lo..hi nodes, each in walking order. */
function cycles(nodes: SlipNode[], lo: number, hi: number, allowed: (id: number) => boolean): number[][] {
  const out: number[][] = [];
  const seen = new Set<string>();
  for (const s of nodes) {
    if (!allowed(s.id)) continue;
    const path = [s.id];
    const walk = (cur: number) => {
      if (path.length > hi) return;
      for (const nb of nodes[cur].adj) {
        if (nb < 0) continue;
        if (nb === s.id && path.length >= lo) {
          const key = [...path].sort((a, b) => a - b).join(',');
          if (!seen.has(key)) {
            seen.add(key);
            out.push([...path]);
          }
          continue;
        }
        if (nb <= s.id || path.includes(nb) || !allowed(nb)) continue;
        path.push(nb);
        walk(nb);
        path.pop();
      }
    };
    walk(s.id);
  }
  return out;
}

/** Straight runs of 2..4 links along +u or +v. */
function runs(nodes: SlipNode[], allowed: (id: number) => boolean): { seg: number[]; d: Dir }[] {
  const out: { seg: number[]; d: Dir }[] = [];
  for (const n of nodes)
    for (const d of [0, 1] as Dir[]) {
      const line = [n.id];
      let cur = n.id;
      while (nodes[cur].adj[d] >= 0 && line.length < 5) {
        cur = nodes[cur].adj[d];
        line.push(cur);
      }
      for (let len = 3; len <= line.length; len++) {
        const seg = line.slice(0, len);
        if (seg.every(allowed)) out.push({ seg, d });
      }
    }
  return out;
}

type Option = { kind: PatrolKind; poses: [number, Dir][] };

function guardFor(r: Rand, kind: GuardKind, nodes: SlipNode[], allowed: (id: number) => boolean, taken: Set<number>): Guard | null {
  const loops = (): Option[] =>
    cycles(nodes, 4, 8, allowed).map((c) => ({ kind: 'loop', poses: c.map((n, i) => [n, nodes[n].adj.indexOf(c[(i + 1) % c.length]) as Dir]) }));
  const paces = (): Option[] =>
    runs(nodes, allowed).map(({ seg, d }) => {
      const back = ((d + 2) % 4) as Dir;
      return { kind: 'pace', poses: [...seg.map((n): [number, Dir] => [n, d]), ...[...seg].reverse().map((n): [number, Dir] => [n, back])] };
    });
  const posts = (): Option[] =>
    nodes
      .filter((n) => allowed(n.id))
      .flatMap((n) => {
        const dirs = DIRS.filter((d) => n.adj[d] >= 0);
        if (dirs.length < 2) return [];
        const k = Math.floor(r() * dirs.length);
        return [{ kind: 'post' as const, poses: [...dirs.slice(k), ...dirs.slice(0, k)].map((d): [number, Dir] => [n.id, d]) }];
      });
  const postpace = (): Option[] => {
    const [a, b] = r() < 0.5 ? [paces, posts] : [posts, paces];
    const o = a();
    return o.length ? o : b();
  };
  const options =
    kind === 'loop'
      ? loops()
      : kind === 'pace'
        ? paces()
        : kind === 'post'
          ? posts()
          : kind === 'loopany'
            ? (() => {
                const o = loops();
                return o.length ? o : postpace();
              })()
            : postpace();
  const usable = options.filter((o) => o.poses.some(([n]) => !taken.has(n)));
  if (usable.length === 0) return null;
  const o = pick(r, usable);
  const starts = o.poses.map((_, i) => i).filter((i) => !taken.has(o.poses[i][0]));
  return { kind: o.kind, poses: o.poses, startPi: pick(r, starts) };
}

function generateOnce(tier: Tier, r: Rand): Omit<SlipBoard, 'seed' | 'tries' | 'solution'> | null {
  const T = SLIP_TIERS[tier];
  const nodes = carve(r, T);
  if (nodes.length < T.nodes) return null;
  const dist = allDistances(nodes);
  const edge = nodes.filter((n) => n.u === 0 || n.v === 0 || n.u === T.W - 1 || n.v === T.H - 1);
  const entry = pick(r, edge).id;
  const maxD = Math.max(...dist[entry]);
  const far = Math.ceil(maxD * 0.6);
  const targets = nodes.filter((n) => n.id !== entry && dist[entry][n.id] >= far);
  if (!targets.length) return null;
  const target = pick(r, targets).id;
  let exit = entry;
  if (!T.exitIsEntry) {
    const exits = edge.filter((n) => n.id !== target && n.id !== entry && dist[entry][n.id] >= far);
    if (!exits.length) return null;
    exit = pick(r, exits).id;
  }
  nodes[entry].type = 'ENTRY';
  nodes[target].type = 'TARGET';
  if (exit !== entry) nodes[exit].type = 'EXIT';
  const hides = shuffle(
    r,
    nodes.filter((n) => n.type === 'plain' && dist[entry][n.id] >= 2),
  ).slice(0, T.hide);
  if (hides.length < T.hide) return null;
  for (const h of hides) h.type = 'HIDE';

  // Nothing patrols or watches within 2 links of ENTRY.
  const allowed = (id: number) => dist[entry][id] >= 3;
  const taken = new Set<number>();
  const guards: Guard[] = [];
  for (const kind of T.guards) {
    const g = guardFor(r, kind, nodes, allowed, taken);
    if (!g) return null;
    taken.add(g.poses[g.startPi][0]);
    guards.push(g);
  }
  const cams: Camera[] = [];
  for (const kind of T.cams) {
    const spots: Camera[] = [];
    for (const n of nodes) {
      if (n.type !== 'plain' || !allowed(n.id) || cams.some((c) => c.node === n.id)) continue;
      const dirs = DIRS.filter((d) => n.adj[d] >= 0 && allowed(n.adj[d]));
      if (kind === 'fixed' && dirs.length >= 1) spots.push({ node: n.id, dirs: [pick(r, dirs)], kind });
      if (kind === 'sweep' && dirs.length >= 2) {
        const s = shuffle(r, dirs);
        spots.push({ node: n.id, dirs: [s[0], s[1]], kind });
      }
    }
    if (!spots.length) return null;
    cams.push(pick(r, spots));
  }
  return { tier, W: T.W, H: T.H, max: SLIP_MAX[tier], nodes, dist, entry, target, exit, guards, cams, par: 0 };
}

/** A solver-checked board for this tier and seed, or null after SLIP_TRIES draws. Deterministic. */
export function generateSlip(tier: Tier, seed: number): SlipBoard | null {
  const r = rng(seed);
  for (let tries = 1; tries <= SLIP_TRIES; tries++) {
    const drawn = generateOnce(tier, r);
    if (!drawn) continue;
    const b: SlipBoard = { ...drawn, seed, tries, solution: [] };
    if (!naiveSeen(b)) continue;
    const sol = solveClean(b);
    if (!sol.actions) continue;
    if (tier === 'hard') {
      const bare = bfsClean(b, { noTools: true, noHide: true });
      if (bare.actions || bare.capped) continue;
    }
    b.solution = sol.actions;
    return b;
  }
  return null;
}
