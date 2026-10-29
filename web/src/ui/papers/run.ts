/**
 * Papers' run screen (spec §3.2–§3.6): the desk, the keys (u UNDO, r RESET, Enter HAND OVER, none
 * of them while a select or a button has focus), booth nine's walk-through, and the dev strip.
 * The window owns Esc: WALK AWAY is its confirm.
 */
import type { Brief } from '../../../../shared/gig/brief';
import { act, handOver, risk, startDesk, type Desk, type DeskAction } from '../../../../shared/papers/desk';
import type { PapersBoard } from '../../../../shared/papers/generate';
import { FIELDS } from '../../../../shared/papers/rules';
import type { RunHost, RunScreen } from '../gig/run-screen';
import { playBooth } from './booth';
import { renderDesk } from './desk-view';
import type { PapersCueName } from './sound';

const TIER_STEP = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' } as const;
/** A cue per desk action (spec §9). */
function cueFor(a: DeskAction): PapersCueName {
  if (a.k === 'extra') return a.x === 'renewal' && a.on ? 'stamp' : 'paper';
  if (a.k === 'note') return 'note';
  if (a.k === 'overlook') return 'blind';
  if (a.k === 'reset') return 'paper';
  return 'pick';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class PapersRun implements RunScreen {
  private desk: Desk;
  private view: HTMLElement | null = null;
  private devStrip: HTMLElement | null = null;
  private notes: string[];
  private handing = false;
  private cancelBooth: (() => void) | null = null;
  private showBest = false;
  private gone = false;
  /** The stamp art wouldn't load: every stamp shows its words (spec §5.1). Probed once. */
  private noArt = false;

  constructor(
    private readonly host: RunHost,
    private readonly job: { brief: Brief; board: PapersBoard },
    private readonly place: { name: string },
    private readonly dev: boolean,
  ) {
    this.desk = startDesk(job.board);
    this.notes = [...job.board.notes];
    const img = new Image();
    img.onerror = () => {
      this.noArt = true;
      this.view?.querySelector('.pp-run')?.classList.add('pp-noart');
    };
    img.src = '/papers/stamps/seal.png';
  }

  /** The papers root: the tokens and the no-art state live on it, for the desk and the booth alike. */
  private root(): HTMLElement {
    return el('div', `pp-run${this.noArt ? ' pp-noart' : ''}`);
  }

  /** True once HAND OVER (or WALK AWAY) has started: the desk is closed. */
  get handingOver(): boolean {
    return this.handing;
  }

  step(): string {
    return this.handing ? 'BOOTH NINE' : TIER_STEP[this.job.board.tier];
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
    if (this.handing) return true;
    const t = e.target;
    if (t instanceof HTMLElement && (t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.tagName === 'OPTION')) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'u') this.do({ k: 'undo' });
    else if (k === 'r') this.do({ k: 'reset' });
    else if (k === 'Enter') {
      if (!e.repeat) this.handOver();
    } else return false;
    return true;
  }

  /** WALK AWAY (spec §3.3): the client goes back on the boat, at the RISK the desk was at. */
  walkAway(): void {
    if (this.handing || this.gone) return;
    this.handing = true;
    const b = this.job.board;
    const r = risk(this.desk);
    this.host.ended({ result: 'back', meter: r, max: b.cap, seed: b.seed, papers: { overlooked: this.desk.overlooked }, devLine: this.devLine() }, `walked away · risk ${r}/${b.cap}`);
  }

  destroy(): void {
    this.gone = true;
    this.cancelBooth?.();
    this.cancelBooth = null;
    this.view = null;
  }

  private do(a: DeskAction): void {
    if (this.handing || this.gone) return;
    const r = act(this.desk, a);
    if (r.refused) {
      this.host.cue('papers:refuse');
      this.paint(true);
      return;
    }
    if (r.desk === this.desk) return;
    this.desk = r.desk;
    this.host.cue(`papers:${cueFor(a)}`);
    this.host.disarm();
    this.paint();
  }

  private handOver(): void {
    if (this.handing || this.gone || !this.view) return;
    this.handing = true;
    this.host.disarm();
    this.host.cue('papers:slide');
    this.host.repaint();
    const h = handOver(this.desk);
    const b = this.job.board;
    const failed = h.checks.find((c) => !c.ok);
    const detail = `risk ${h.risk}/${b.cap} · best ${b.minWith}${h.result === 'back' && failed ? ` · ${failed.text}` : ''}`;
    const end = { result: h.result, meter: h.risk, max: b.cap, seed: b.seed, papers: { overlooked: this.desk.overlooked }, devLine: this.devLine() };
    const root = this.root();
    this.view.replaceChildren(root);
    this.cancelBooth = playBooth(root, h.checks, h.result, {
      reducedMotion: this.host.reducedMotion,
      cue: (n) => this.host.cue(`papers:${n}`),
      done: () => {
        if (!this.gone) this.host.ended(end, detail);
      },
    });
  }

  private devLine(): string {
    const b = this.job.board;
    return `DEV · seed ${b.seed} · min ${b.min} · with booth ${b.minWith} · naive ${b.naive === Infinity ? '∞' : b.naive} · traps ${b.traps} · ${b.optimal} best · attempt ${b.attempts}`;
  }

  private paint(shake = false): void {
    const view = this.view;
    if (!view || this.handing) return;
    // Drawn whole: keep focus on the same control across the redraw.
    const focused = document.activeElement instanceof HTMLElement && view.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused?.dataset.f ? `select[data-doc="${focused.dataset.doc}"][data-f="${focused.dataset.f}"]` : focused?.dataset.k ? `[data-k="${focused.dataset.k}"]` : null;
    const head = el('div', 'pp-head');
    head.append(el('h4', '', this.job.brief.title));
    for (const [k, v] of [
      ['CLIENT', this.job.brief.client],
      ['TARGET', this.job.brief.target],
      ['TAKE', this.job.brief.take],
    ]) {
      const s = el('span', '', `${k} `);
      s.append(el('b', '', v));
      head.append(s);
    }
    const root = this.root();
    root.append(
      head,
      el('p', 'pp-brief', this.job.brief.text),
      renderDesk({
        desk: this.desk,
        origins: this.job.board.origins,
        notes: this.notes,
        shake: shake && !this.host.reducedMotion,
        onAct: (a) => this.do(a),
        onHandOver: () => this.handOver(),
        onDismissNote: (i) => {
          this.notes = i === 'all' ? [] : this.notes.filter((_, j) => j !== i);
          this.paint();
        },
      }),
    );
    view.replaceChildren(root);
    // The control you used is drawn anew; one that's gone (a dismissed note) hands focus to HAND OVER.
    if (focused) ((focusKey && (view.querySelector(focusKey) as HTMLElement | null)) || (view.querySelector('[data-k="hand"]') as HTMLElement | null))?.focus();
    this.paintDev();
  }

  private paintDev(): void {
    const strip = this.devStrip;
    if (!strip || !this.dev) return;
    const best = el('span', 'pp-dev-best');
    if (this.showBest) {
      const b = this.job.board;
      const diff = FIELDS.filter((f) => b.best[f] !== b.truth[f]).map((f) => `${f} → ${b.best[f]}`);
      if (b.best.medical !== b.truth.medical) diff.push(`${b.best.medical ? '+' : '−'} medical slip`);
      if (b.best.renewal !== b.truth.renewal) diff.push(`${b.best.renewal ? '+' : '−'} renewal stamp`);
      if (b.overlook !== null) diff.push(`booth nine on rule ${b.overlook + 1}`);
      best.textContent = diff.join(' · ') || 'no changes';
    }
    const toggle = el('button', '', 'SHOW BEST');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      this.showBest = !this.showBest;
      this.paintDev();
    });
    strip.replaceChildren(el('span', '', this.devLine()), toggle, best);
  }
}
