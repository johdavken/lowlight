/**
 * The hack's run screen (gig runs spec §4): the isometric board, RAM and TRACE, the selected
 * node's actions, the log, and the hack's dev buttons. Moved out of the gig window unchanged when
 * Slip arrived (Slip spec §4.1).
 */
import type { Brief } from '../../../../shared/gig/brief';
import { act, DECK, inReach, isVisible, startRun, takeCost, watchers, type Action, type Board, type NodeType, type RunState } from '../../../../shared/gig/rules';
import { solve } from '../../../../shared/gig/solve';
import { BoardView } from './board-view';
import type { RunHost, RunScreen } from './run-screen';

const NAME: Record<NodeType, string> = { ENTRY: 'ENTRY', TARGET: 'TARGET', RELAY: 'RELAY', ICE2: 'LACQUER 2', ICE3: 'LACQUER 3', TRAP: 'TRAP', CACHE: 'CACHE', SENTRY: 'SENTRY', KEY: 'KEY' };
const ABOUT: Record<NodeType, string> = {
  ENTRY: 'Where you jacked in.',
  TARGET: 'The take. Take it, then PULL to finish the run.',
  RELAY: 'An ordinary node. Nothing here.',
  ICE2: 'Corp lacquer. Costs 2 to breach.',
  ICE3: 'Thick lacquer. Costs 3 to breach.',
  TRAP: 'A tripwire. Entering it costs +3 trace.',
  CACHE: 'A leftover backdoor. Entering it gives back 2 trace.',
  SENTRY: 'A watcher. While you hold a node next to it, every action costs +1. Take it (2) to blind it.',
  KEY: 'A stolen credential. Once you hold it, all lacquer costs 1.',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** What Tab cycles: the nodes in reach (by id), then the target once it's yours. */
export function candidates(state: RunState): number[] {
  const out = state.board.nodes.filter((n) => inReach(state, n.id)).map((n) => n.id);
  if (state.held.has(state.board.target) && !state.outcome) out.push(state.board.target);
  return out;
}

/** The ENTER button for a node: its verb, its TRACE cost now (a known trap at its full 4), and whether it's risky. */
export function enterPreview(state: RunState, id: number): { verb: string; cost: number; danger: boolean; wouldTrace: boolean } {
  const type = state.board.nodes[id].type;
  const known = isVisible(state, id);
  const base = known ? takeCost(state.board, id, state.key) + (type === 'TRAP' ? 3 : 0) : 1;
  const cost = base + watchers(state.board, state.held);
  const verb = !known ? 'ENTER BLIND' : type === 'ICE2' || type === 'ICE3' ? 'BREACH' : type === 'SENTRY' ? 'BLIND IT' : 'ENTER';
  const back = known && type === 'CACHE' ? 2 : 0;
  const wouldTrace = state.trace + cost - back > state.board.max;
  return { verb, cost, danger: wouldTrace || (known && type === 'TRAP'), wouldTrace };
}

/** Under the meter: who's watching, and the key. Empty when neither. */
export function watchLine(state: RunState): string {
  const w = watchers(state.board, state.held);
  const parts: string[] = [];
  if (w) parts.push(`◉ ${w} sentr${w > 1 ? 'ies' : 'y'} watching · every action +${w}`);
  if (state.key) parts.push('⚷ key held · lacquer costs 1');
  return parts.join(' · ');
}

/** The deck the window keeps across runs (the dev strip's DECK RAM and REVEAL BOARD change it). */
export interface Deck {
  ram: number;
  reveal?: boolean;
}

export class HackRun implements RunScreen {
  private state: RunState;
  private sel: number | null = null;
  private log: { text: string; tone?: 'bad' | 'good' }[];
  private board: BoardView | null = null;
  private view: HTMLElement | null = null;
  private devStrip: HTMLElement | null = null;
  private done = false;

  constructor(
    private readonly host: RunHost,
    private readonly job: { brief: Brief; seed: number; board: Board },
    private readonly deck: Deck,
    /** e2e: expose the solver's route on window.__nixRoom.gig. */
    exposePath: boolean,
  ) {
    this.state = startRun(job.board, deck.ram);
    this.log = [{ text: `jacked in · ${job.brief.target}` }];
    if (exposePath) {
      const hook = (window as unknown as { __nixRoom?: { gig?: { path(): number[] | null } } }).__nixRoom;
      if (hook) hook.gig = { path: () => solve(job.board).path };
    }
  }

  step(): string {
    return this.job.brief.tier.toUpperCase();
  }

  mount(view: HTMLElement, devStrip: HTMLElement | null): void {
    this.view = view;
    this.devStrip = devStrip;
    this.paint();
  }

  escape(): boolean {
    return false;
  }

  key(e: KeyboardEvent): boolean {
    if (this.done) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Tab') this.cycle(e.shiftKey ? -1 : 1);
    else if (k === 'p' && this.sel !== null) this.do({ kind: 'probe', node: this.sel });
    else if (k === 'e' && this.sel !== null) this.do({ kind: 'enter', node: this.sel });
    else if (k === 'Enter' && this.state.held.has(this.state.board.target)) this.do({ kind: 'pull' });
    else return false;
    return true;
  }

  destroy(): void {
    this.board?.destroy();
    this.board = null;
    this.view = null;
  }

  private cycle(step: number): void {
    const list = candidates(this.state);
    if (!list.length) return;
    const at = this.sel === null ? -1 : list.indexOf(this.sel);
    this.sel = list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length];
    this.host.disarm();
    this.host.cue('select');
    this.paint();
  }

  private select(id: number): void {
    this.sel = id;
    this.host.disarm();
    this.host.cue('select');
    this.paint();
  }

  private do(action: Action): void {
    const r = act(this.state, action);
    if (!r.ok) return;
    this.state = r.state;
    this.log = [...[...r.log].reverse(), ...this.log];
    this.host.disarm();
    for (const c of r.cues) this.host.cue(c);
    const outcome = r.state.outcome;
    if (outcome) {
      this.done = true;
      const b = r.state.board;
      const detail = outcome === 'traced' ? `The trace went past ${b.max}. ${this.job.brief.target.split(' · ')[0]} has your deck's signature for tonight.` : `${this.job.brief.take} · trace ${r.state.trace}/${b.max}`;
      this.host.ended({ result: outcome, meter: r.state.trace, max: b.max, seed: this.job.seed, devLine: this.devLine() }, detail);
      return;
    }
    this.paint();
  }

  private paint(): void {
    const view = this.view;
    if (!view) return;
    const { state } = this;
    if (!this.board) {
      view.replaceChildren();
      const head = el('div', 'gig-run-head');
      head.append(el('h4', 'gig-run-title', this.job.brief.title), el('span', 'gig-run-info', `${this.job.brief.client} · ${this.job.brief.target} · take: ${this.job.brief.take}`));
      const grid = el('div', 'gig-run');
      const boardHost = el('div', 'gig-board-host');
      const side = el('aside', 'gig-side');
      grid.append(boardHost, side);
      view.append(head, grid);
      this.board = new BoardView(boardHost, { onSelect: (id) => this.select(id), reducedMotion: this.host.reducedMotion, reveal: !!this.deck.reveal });
      boardHost.append(legend(state.board.tier === 'hard'));
    }
    this.board.render(state, this.sel);
    view.querySelector<HTMLElement>('.gig-side')!.replaceChildren(this.ramBox(), this.traceBox(), this.inspector(), this.logBox());
    this.paintDev();
  }

  private ramBox(): HTMLElement {
    const { state } = this;
    const box = el('div', 'gig-box gig-rambox');
    box.append(el('h5', '', `RAM · ${DECK.name.toUpperCase()}`), el('div', 'gig-num', `${state.ram} / ${state.deckRam}${state.ram < 1 ? ' · out — go in blind' : ''}`), pips(state.deckRam, state.ram, null));
    return box;
  }

  private traceBox(): HTMLElement {
    const { state } = this;
    const b = state.board;
    const box = el('div', `gig-box gig-tracebox${state.trace >= b.max - 2 ? ' gig-hot' : ''}`);
    box.append(el('h5', '', 'TRACE'), el('div', 'gig-num', `${state.trace} / ${b.max} · clean ≤ ${b.par}`), pips(b.max, state.trace, b.par), el('div', 'gig-watchline', watchLine(state)));
    return box;
  }

  private inspector(): HTMLElement {
    const { state } = this;
    const box = el('div', 'gig-box gig-insp');
    const id = this.sel;
    if (id === null) {
      box.append(el('div', 'gig-what', 'SELECT A NODE'), el('p', '', 'Click a node next to yours, or [TAB]. Unknown nodes are ? until you probe them (1 RAM) or enter them. Lacquer, sentries and the target are always visible.'));
      return box;
    }
    const n = state.board.nodes[id];
    const known = isVisible(state, id);
    const acts = el('div', 'gig-acts');
    const t = watchers(state.board, state.held);
    if (state.held.has(id) && id === state.board.target) {
      acts.append(button(`[ENTER] PULL · ${1 + t}`, 'gig-act gig-act-pull', () => this.do({ kind: 'pull' })));
    } else if (state.held.has(id)) {
      acts.append(el('span', 'gig-note gig-good', 'Yours.'));
    } else if (inReach(state, id)) {
      if (!known) {
        const probe = button(`[P] PROBE · 1 RAM${t ? ` +${t} trace` : ''}`, 'gig-act gig-act-probe', () => this.do({ kind: 'probe', node: id }));
        if (state.ram < 1) {
          probe.disabled = true;
          probe.title = 'out of RAM';
        }
        acts.append(probe);
      }
      const p = enterPreview(state, id);
      acts.append(button(`[E] ${p.verb} · ${p.cost}`, `gig-act gig-act-enter${p.danger ? ' gig-danger' : ''}`, () => this.do({ kind: 'enter', node: id })));
      if (p.wouldTrace) acts.append(el('div', 'gig-note gig-bad', 'this would trace you'));
    } else {
      acts.append(el('span', 'gig-note', 'Out of reach. Take a node next to it first.'));
    }
    box.append(
      el('div', 'gig-what', `n${id} · ${known ? NAME[n.type] : 'UNKNOWN'}`),
      el('p', '', known ? ABOUT[n.type] : 'Could be a relay, a trap, a cache — or, on hard boards, a key.'),
      acts,
    );
    return box;
  }

  private logBox(): HTMLElement {
    const box = el('div', 'gig-box');
    const log = el('div', 'gig-log');
    for (const l of this.log) log.append(el('div', l.tone ? `gig-${l.tone}` : '', `> ${l.text}`));
    box.append(el('h5', '', 'LOG'), log);
    return box;
  }

  private devLine(): string {
    const b = this.state.board;
    return `DEV · seed ${this.job.seed} · ${b.nodes.length} nodes · ${b.routes} routes · best ${b.best}/${b.max} · par ${b.par}`;
  }

  private paintDev(): void {
    const strip = this.devStrip;
    if (!strip) return;
    strip.replaceChildren();
    const b = this.state.board;
    strip.append(
      el('span', '', this.devLine()),
      el('span', 'gig-sp'),
      el('span', '', `DECK RAM ${this.deck.ram}`),
      button('−', '', () => ((this.deck.ram = Math.max(0, this.deck.ram - 1)), this.paintDev())),
      button('+', '', () => ((this.deck.ram = Math.min(8, this.deck.ram + 1)), this.paintDev())),
      button(this.deck.reveal ? 'HIDE BOARD' : 'REVEAL BOARD', '', () => {
        this.deck.reveal = !this.deck.reveal;
        this.board?.destroy();
        this.board = null;
        this.paint();
      }),
      button('NEW BOARD', '', () => this.host.restart((Math.random() * 2 ** 32) >>> 0)),
      button('RERUN SAME BOARD', '', () => this.host.restart(this.job.seed)),
    );
  }
}

export function button(text: string, cls: string, run: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}

function pips(count: number, on: number, mark: number | null): HTMLElement {
  const row = el('div', 'gig-pips');
  for (let i = 0; i < count; i++) row.append(el('span', `gig-pip${i < on ? ' gig-pip-on' : ''}${mark !== null && i === mark ? ' gig-pip-par' : ''}`));
  return row;
}

function legend(hard: boolean): HTMLElement {
  const l = el('div', 'gig-legend');
  const items: [string, string, string][] = [
    ['■', 'gig-c-green', 'yours'],
    ['?', '', 'unknown'],
    ['▦', 'gig-c-cyan', 'lacquer'],
    ['◉', 'gig-c-red', 'sentry'],
    ['✕', 'gig-c-red', 'trap'],
    ['+2', 'gig-c-green', 'cache'],
    ...(hard ? ([['⚷', 'gig-c-key', 'key']] as [string, string, string][]) : []),
    ['◆︎', 'gig-c-pink', 'target'],
  ];
  for (const [g, c, t] of items) {
    const s = el('span', '');
    s.append(el('b', c, g), t);
    l.append(s);
  }
  l.append(el('span', 'gig-legend-keys', '[TAB] NEXT · [P] PROBE · [E] TAKE · [ENTER] PULL'));
  return l;
}
