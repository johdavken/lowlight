/**
 * Papers' run on the board (spec §3.2–§3.6; mockup papers-board.html D): the desk drawn into the board's regions,
 * the keys (u UNDO, r RESET, Enter HAND OVER, none of them while a select or a button has focus), booth nine's
 * read, and the dev strip. Esc drops a lifted card or the picked-up token first; otherwise it's the board's
 * (WALK AWAY).
 */
import type { Brief } from '../../../../shared/gig/brief';
import { act, handOver, risk, startDesk, type Desk, type DeskAction } from '../../../../shared/papers/desk';
import type { PapersBoard } from '../../../../shared/papers/generate';
import { FIELDS, type Field } from '../../../../shared/papers/rules';
import { playBooth, showWalkedAway } from './booth';
import { renderBulletin, renderFieldHand, renderLevers, renderPapers, renderTop, type DeskRegions } from './desk-view';
import type { RunHost } from './run-host';
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

/** The focus came from the keyboard (a select always counts: it's worked from the keys). */
function keyboardFocus(n: HTMLElement): boolean {
  if (n.tagName === 'SELECT') return true;
  try {
    return n.matches(':focus-visible');
  } catch {
    return true;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class PapersRun {
  private desk: Desk;
  private regions: DeskRegions | null = null;
  private devStrip: HTMLElement | null = null;
  private notes: string[];
  private handing = false;
  private cancelBooth: (() => void) | null = null;
  private showBest = false;
  private gone = false;
  /** The field card that's lifted (its values listed), if any. */
  private lifted: Field | null = null;
  /** Booth nine's token is picked up: the bulletin's rules take it. */
  private armed = false;
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
      this.regions?.root.classList.add('pp-noart');
    };
    img.src = '/papers/stamps/seal.png';
  }

  /** True once HAND OVER (or WALK AWAY) has started: the desk is closed. */
  get handingOver(): boolean {
    return this.handing;
  }

  step(): string {
    return this.handing ? 'BOOTH NINE' : TIER_STEP[this.job.board.tier];
  }

  mount(regions: DeskRegions, devStrip: HTMLElement | null): void {
    this.regions = regions;
    this.devStrip = devStrip;
    regions.root.classList.add('pp-run');
    regions.root.classList.toggle('pp-noart', this.noArt);
    this.paint();
  }

  /** Esc: a lifted card drops, the picked-up token goes back; true when it did one (the board doesn't ask to walk away). */
  escape(): boolean {
    if (this.handing) return false;
    if (this.lifted) {
      this.lifted = null;
      this.paint();
      return true;
    }
    if (this.armed) {
      this.armed = false;
      this.paint();
      return true;
    }
    return false;
  }

  key(e: KeyboardEvent): boolean {
    if (this.handing) return true;
    const t = e.target;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // A select keeps its keys (type-ahead); a button only its own Enter and Space.
    if (t instanceof HTMLElement && (t.tagName === 'SELECT' || t.tagName === 'OPTION')) return false;
    if (t instanceof HTMLElement && t.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return false;
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
    if (this.regions) {
      showWalkedAway(this.regions, { risk: r, cap: b.cap, take: this.job.brief.take, name: b.name });
      this.regions.top.replaceChildren(...renderTop({ desk: this.desk, brief: this.job.brief, step: 'WALKED AWAY', shake: false }));
    }
    this.host.ended({ result: 'back', meter: r, max: b.cap, seed: b.seed, papers: { overlooked: this.desk.overlooked }, devLine: this.devLine() }, `walked away · risk ${r}/${b.cap}`);
  }

  destroy(): void {
    this.gone = true;
    this.cancelBooth?.();
    this.cancelBooth = null;
    this.regions = null;
  }

  private do(a: DeskAction): void {
    if (this.handing || this.gone) return;
    if (a.k === 'reset') {
      this.lifted = null;
      this.armed = false;
    }
    const r = act(this.desk, a);
    if (r.refused) {
      // Over the cap: the meter shakes, and a lifted card stays up for another pick.
      this.host.cue('papers:refuse');
      this.paint(true);
      return;
    }
    if (a.k === 'set') this.lifted = null;
    if (r.desk === this.desk) {
      // Nothing changed (the value it already had), but a lifted card still drops.
      this.paint();
      return;
    }
    this.desk = r.desk;
    // Booth nine on a rule (an UNDO can put him back) is never also in your hand.
    if (this.desk.overlooked !== null) this.armed = false;
    this.host.cue(`papers:${cueFor(a)}`);
    this.host.disarm();
    this.paint();
  }

  private handOver(): void {
    const r = this.regions;
    if (this.handing || this.gone || !r) return;
    this.handing = true;
    this.lifted = null;
    this.armed = false;
    this.host.disarm();
    this.host.cue('papers:slide');
    this.host.repaint();
    const h = handOver(this.desk);
    const b = this.job.board;
    const failed = h.checks.find((c) => !c.ok);
    const detail = `risk ${h.risk}/${b.cap} · best ${b.minWith}${h.result === 'back' && failed ? ` · ${failed.text}` : ''}`;
    const end = { result: h.result, meter: h.risk, max: b.cap, seed: b.seed, papers: { overlooked: this.desk.overlooked }, devLine: this.devLine() };
    r.top.replaceChildren(...renderTop({ desk: this.desk, brief: this.job.brief, step: 'BOOTH NINE', shake: false }));
    this.cancelBooth = playBooth(r, { checks: h.checks, result: h.result, risk: h.risk, cap: b.cap, take: this.job.brief.take, name: b.name }, {
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
    const r = this.regions;
    if (!r || this.handing) return;
    // Drawn whole: keep focus on the same control across the redraw.
    const active = document.activeElement instanceof HTMLElement && r.root.contains(document.activeElement) ? document.activeElement : null;
    // Only keyboard focus is kept: after a mouse click the keys are the desk's again (u, r, Enter hands over).
    const focused = active && keyboardFocus(active) ? active : null;
    const focusKey = focused?.dataset.f ? `select[data-doc="${focused.dataset.doc}"][data-f="${focused.dataset.f}"]` : focused?.dataset.k ? `[data-k="${focused.dataset.k}"]` : null;
    const o = {
      desk: this.desk,
      brief: this.job.brief,
      origins: this.job.board.origins,
      step: TIER_STEP[this.job.board.tier],
      notes: this.notes,
      shake: shake && !this.host.reducedMotion,
      lifted: this.lifted,
      armed: this.armed,
      onAct: (a: DeskAction) => this.do(a),
      onHandOver: () => this.handOver(),
      onDismissNote: (i: number | 'all') => {
        this.notes = i === 'all' ? [] : this.notes.filter((_, j) => j !== i);
        this.paint();
      },
      onLift: (f: Field | null) => {
        this.lifted = f;
        this.armed = false;
        this.paint();
      },
      onArm: (on: boolean) => {
        this.armed = on;
        this.lifted = null;
        this.paint();
      },
    };
    r.top.replaceChildren(...renderTop(o));
    r.log.replaceChildren(renderBulletin(o));
    r.middle.replaceChildren(renderPapers(o));
    r.levers.replaceChildren(...renderLevers(o));
    r.bottom.replaceChildren(renderFieldHand(o));
    // The control you used is drawn anew; one that's gone (a dismissed note, a picked value) hands focus on:
    // a value to its card, anything else to HAND OVER.
    if (focused) {
      const again = focusKey ? (r.root.querySelector(focusKey) as HTMLElement | null) : null;
      const card = focused.dataset.k?.startsWith('opt-') ? (r.root.querySelector(`[data-k="field-${focused.dataset.k.split('-')[1]}"]`) as HTMLElement | null) : null;
      (again ?? card ?? (r.root.querySelector('[data-k="hand"]') as HTMLElement | null))?.focus();
    }
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
