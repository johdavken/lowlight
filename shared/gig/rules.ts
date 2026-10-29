/**
 * Gig runs' rules (spec §3): a board of nodes you break into from ENTRY to TARGET. Every action
 * adds TRACE; past the board's maximum you're TRACED. PROBE spends the deck's RAM. Pure: `act`
 * returns a new state and never changes the one it's given.
 */

export type Tier = 'easy' | 'medium' | 'hard';
export type NodeType = 'ENTRY' | 'TARGET' | 'RELAY' | 'ICE2' | 'ICE3' | 'TRAP' | 'CACHE' | 'SENTRY' | 'KEY';
export type Outcome = 'clean' | 'close' | 'traced';
export type Cue = 'probe' | 'enter' | 'breach' | 'trap' | 'cache' | 'key' | 'watch' | 'pull' | Outcome;

/** A node and its floor position: `col` from ENTRY's 0, `row` from 0 (top) to 1. */
export interface GigNode {
  id: number;
  type: NodeType;
  col: number;
  row: number;
}

export interface Board {
  tier: Tier;
  seed: number;
  max: number;
  nodes: GigNode[];
  links: [number, number][];
  entry: number;
  target: number;
  /** The solver's best full-knowledge score, PULL included. */
  best: number;
  /** CLEAN is at or under this. */
  par: number;
  routes: number;
}

export interface RunState {
  board: Board;
  held: ReadonlySet<number>;
  /** Probed or entered: shown through the fog. */
  seen: ReadonlySet<number>;
  trace: number;
  ram: number;
  deckRam: number;
  key: boolean;
  outcome: Outcome | null;
}

export type Action = { kind: 'probe' | 'enter'; node: number } | { kind: 'pull' };
export interface LogLine {
  text: string;
  tone?: 'bad' | 'good';
}
export type ActResult = { ok: true; state: RunState; log: LogLine[]; cues: Cue[] } | { ok: false; why: string };

/** The player's deck until gear exists. Its RAM refills every run. */
export const DECK = { name: 'Patched deck', ram: 3 };
export const TIER_MAX: Record<Tier, number> = { easy: 10, medium: 12, hard: 14 };
/** Seen through the fog: lacquer is loud, sentries watch, and the take is why you're here. */
export const ALWAYS_VISIBLE: ReadonlySet<NodeType> = new Set<NodeType>(['ENTRY', 'TARGET', 'ICE2', 'ICE3', 'SENTRY']);

const BASE_COST: Record<NodeType, number> = { ENTRY: 0, TARGET: 1, RELAY: 1, ICE2: 2, ICE3: 3, TRAP: 1, CACHE: 1, SENTRY: 2, KEY: 1 };
const NAME: Record<NodeType, string> = {
  ENTRY: 'entry',
  TARGET: 'target',
  RELAY: 'relay',
  ICE2: 'lacquer 2',
  ICE3: 'lacquer 3',
  TRAP: 'trap',
  CACHE: 'cache',
  SENTRY: 'sentry',
  KEY: 'key',
};
const isLacquer = (t: NodeType) => t === 'ICE2' || t === 'ICE3';
const toneOf = (t: NodeType): LogLine['tone'] => (t === 'TRAP' ? 'bad' : t === 'CACHE' || t === 'KEY' ? 'good' : undefined);

export function neighbours(board: Board, id: number): number[] {
  const out: number[] = [];
  for (const [a, b] of board.links) {
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

export function startRun(board: Board, ram: number = DECK.ram): RunState {
  return { board, held: new Set([board.entry]), seen: new Set(), trace: 0, ram, deckRam: ram, key: false, outcome: null };
}

/** Sentries you don't hold that are linked to a node you do: each adds 1 to every action. */
export function watchers(board: Board, held: ReadonlySet<number>): number {
  return board.nodes.filter((n) => n.type === 'SENTRY' && !held.has(n.id) && neighbours(board, n.id).some((m) => held.has(m))).length;
}

/** What taking the node costs before the watch penalty; with the key, lacquer costs 1. */
export function takeCost(board: Board, id: number, key: boolean): number {
  const t = board.nodes[id].type;
  return key && isLacquer(t) ? 1 : BASE_COST[t];
}

export function isVisible(state: RunState, id: number): boolean {
  return ALWAYS_VISIBLE.has(state.board.nodes[id].type) || state.seen.has(id) || state.held.has(id);
}

export function inReach(state: RunState, id: number): boolean {
  return !state.held.has(id) && neighbours(state.board, id).some((m) => state.held.has(m));
}

/** The TRACE the action adds now, watch penalty included (a trap's +3 and a cache's refund are effects, not cost). */
export function actionCost(state: RunState, action: Action): number {
  const w = watchers(state.board, state.held);
  if (action.kind === 'probe') return w;
  if (action.kind === 'pull') return 1 + w;
  return takeCost(state.board, action.node, state.key) + w;
}

/** A won run's grade. */
export function outcomeOf(trace: number, board: Board): Outcome {
  return trace <= board.par ? 'clean' : 'close';
}

export function act(state: RunState, action: Action): ActResult {
  if (state.outcome) return { ok: false, why: 'the run is over' };
  const { board } = state;
  const w = watchers(board, state.held);
  const plus = (n: number) => `+${n}`;

  if (action.kind === 'pull') {
    if (!state.held.has(board.target)) return { ok: false, why: 'take the target first' };
    const trace = state.trace + 1 + w;
    const outcome: Outcome = trace > board.max ? 'traced' : outcomeOf(trace, board);
    return { ok: true, state: { ...state, trace, outcome }, log: [{ text: `PULL · ${plus(1 + w)}` }], cues: ['pull', outcome] };
  }

  const id = action.node;
  const node = board.nodes[id];
  if (!node || !inReach(state, id)) return { ok: false, why: 'out of reach' };

  if (action.kind === 'probe') {
    if (isVisible(state, id)) return { ok: false, why: 'already known' };
    if (state.ram < 1) return { ok: false, why: 'out of RAM' };
    const seen = new Set(state.seen).add(id);
    const trace = state.trace + w;
    const outcome = trace > board.max ? 'traced' : null;
    const log: LogLine[] = [{ text: `probe n${id} → ${NAME[node.type]} · −1 RAM${w ? ` · ${plus(w)}` : ''}`, tone: toneOf(node.type) }];
    return { ok: true, state: { ...state, seen, trace, ram: state.ram - 1, outcome }, log, cues: outcome ? ['probe', 'traced'] : ['probe'] };
  }

  const blind = !isVisible(state, id);
  const cost = takeCost(board, id, state.key) + w;
  const verb = isLacquer(node.type) ? 'breach' : node.type === 'SENTRY' ? 'blind' : blind ? 'enter blind' : 'enter';
  const log: LogLine[] = [{ text: `${verb} n${id}${blind ? ` → ${NAME[node.type]}` : ''} · ${plus(cost)}` }];
  const cues: Cue[] = [isLacquer(node.type) || node.type === 'SENTRY' ? 'breach' : 'enter'];
  let trace = state.trace + cost;
  let key = state.key;
  if (node.type === 'TRAP') {
    trace += 3;
    log.push({ text: 'tripwire · +3', tone: 'bad' });
    cues.push('trap');
  } else if (node.type === 'CACHE') {
    const back = Math.min(2, trace);
    trace -= back;
    log.push({ text: `cache · −${back}`, tone: 'good' });
    cues.push('cache');
  } else if (node.type === 'KEY') {
    key = true;
    log.push({ text: 'key lifted · lacquer costs 1', tone: 'good' });
    cues.push('key');
  } else if (node.type === 'SENTRY') {
    log.push({ text: 'sentry blinded', tone: 'good' });
  }
  const held = new Set(state.held).add(id);
  const seen = new Set(state.seen).add(id);
  if (watchers(board, held) > w) cues.push('watch');
  const outcome = trace > board.max ? 'traced' : null;
  if (outcome) cues.push('traced');
  return { ok: true, state: { ...state, held, seen, trace, key, outcome }, log, cues };
}
