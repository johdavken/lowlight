/**
 * The papers board (mockup docs/mockups/papers-board.html, D, 2026-11-08): Papers' desk as a HUD over the room,
 * in a table shell like Graft's job table. Taking a job on the map's GIGS closes the map and puts this up; the
 * stage around it (your figure out, the contact to the right, the dim) comes with the shell's `tb hud`.
 *
 * It owns the keys while it's up (chat stays closed: nothing reaches the prompt), Esc's WALK AWAY / STAY, and
 * the send: once booth nine has read, LEAVE THE DESK (Enter) sends the result, once; her row closes the board
 * (main.ts), a refusal or ten quiet seconds offer SEND AGAIN, and Esc may leave then.
 */
import { bugReportOpen } from '../bug-report';
import type { Brief, GigKind, GigResult } from '../../../../shared/gig/brief';
import type { PapersBoard } from '../../../../shared/papers/generate';
import { mountTableShell, type TableShell } from '../../room/table/shell';
import { btn, type DeskRegions } from './desk-view';
import { PapersRun } from './run';
import type { RunEnd, RunHost } from './run-host';
import './hud.css';

/** What goes to the server: the socket's `gig` message. */
export interface GigSend {
  kind: GigKind;
  /** Papers: the rule booth nine looked past. */
  papers?: { overlooked: number | null };
  place: string;
  brief: string;
  result: GigResult;
  trace: number;
  max: number;
  seed: number;
}

export interface PapersHudOpts {
  /** The job and the board dealt for it; the place it came off. */
  brief: Brief;
  board: PapersBoard;
  place: { id: string; name: string };
  onSend: (run: GigSend) => void;
  /** Leaving without sending: only once a send was refused or went unanswered (spec §8). */
  onClose: () => void;
  /** A sound cue by name (`papers:`…). */
  cue?: (name: string) => void;
  /** The chat line's hint while the board holds the keys; null gives it back. */
  hint?: (text: string | null) => void;
  reducedMotion: boolean;
  /** The dev strip: the run's seed and its best. */
  dev?: boolean;
  /** Something is open over the board (a screen, the map, the pause menu): its keys are its own. */
  blocked?: () => boolean;
}

/** How long a sent result waits for her turn to start before the board offers SEND AGAIN. */
export const ANSWER_MS = 10_000;
const HINT_DESK = 'THE DESK · U UNDO · R RESET · ⏎ HAND OVER · ESC WALK AWAY';
const HINT_READ = 'BOOTH NINE IS READING';
const HINT_DONE = 'THE DESK · ⏎ LEAVE THE DESK';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class PapersHud {
  private readonly shell: TableShell;
  private readonly regions: DeskRegions;
  private readonly run: PapersRun;
  private readonly devStrip: HTMLElement | null;
  private end: RunEnd | null = null;
  private confirm: HTMLElement | null = null;
  private sent = false;
  private refusal: string | null = null;
  private closed = false;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onKey = (e: KeyboardEvent) => void (!bugReportOpen() && this.key(e));

  constructor(
    host: HTMLElement,
    private readonly opts: PapersHudOpts,
  ) {
    this.shell = mountTableShell(host, { hud: true });
    const root = this.shell.root;
    root.classList.add('pp-hud');
    this.regions = { root, top: this.shell.top!, log: this.shell.log!, middle: this.shell.middle, levers: this.shell.levers!, bottom: this.shell.bottom };
    this.devStrip = opts.dev ? root.appendChild(el('div', 'pp-dev')) : null;
    this.run = new PapersRun(this.host(), { brief: opts.brief, board: opts.board }, { name: opts.place.name }, !!opts.dev);
    this.run.mount(this.regions, this.devStrip);
    this.shell.open();
    // The prompt had the focus (the type-anywhere chat): it gives it up, so nothing is drafted at the desk.
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#input')) document.activeElement.blur();
    window.addEventListener('keydown', this.onKey, true);
    this.opts.hint?.(HINT_DESK);
  }

  get root(): HTMLElement {
    return this.shell.root;
  }

  /** The server refused the result: say why, and let it go again. */
  showRefusal(text: string): void {
    if (this.closed || !this.end) return;
    this.stopWaiting();
    this.refusal = text;
    this.sent = false;
    this.paintSend();
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopWaiting();
    window.removeEventListener('keydown', this.onKey, true);
    this.run.destroy();
    this.shell.close();
    this.shell.root.remove();
    this.opts.hint?.(null);
  }

  private host(): RunHost {
    return {
      cue: (n) => this.cue(n),
      disarm: () => {},
      repaint: () => this.opts.hint?.(this.run.handingOver ? HINT_READ : HINT_DESK),
      ended: (end) => {
        this.dropConfirm();
        this.end = end;
        this.opts.hint?.(HINT_DONE);
        this.paintSend();
      },
      dev: !!this.opts.dev,
      reducedMotion: this.opts.reducedMotion,
    };
  }

  /** A cue never breaks the run (no audio, a missing file). */
  private cue(name: string): void {
    try {
      this.opts.cue?.(name);
    } catch {
      // silent
    }
  }

  /** The levers once it's over: LEAVE THE DESK, or SEND AGAIN under the refusal. */
  private paintSend(): void {
    const box = el('div', 'pp-send');
    if (this.refusal) box.append(el('p', 'pp-refusal', this.refusal));
    const send = btn(this.refusal ? 'SEND AGAIN' : 'LEAVE THE DESK', 'pp-send-go', () => this.send(), { 'data-k': 'send' });
    send.disabled = this.sent;
    box.append(send, el('kbd', '', '⏎'));
    this.regions.levers.replaceChildren(box);
  }

  private send(): void {
    const end = this.end;
    if (this.sent || !end || this.closed) return;
    this.sent = true;
    this.refusal = null;
    this.paintSend();
    const { brief, place } = this.opts;
    // No row and no refusal (the link dropped): don't wait forever. Set first: a refusal said at once (no link)
    // clears it rather than being overwritten ten seconds on.
    this.stopWaiting();
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      this.showRefusal('no answer — check the link and send again');
    }, ANSWER_MS);
    this.opts.onSend({ kind: 'papers', place: place.id, brief: brief.id, result: end.result, trace: end.meter, max: end.max, seed: end.seed, ...(end.papers ? { papers: end.papers } : {}) });
  }

  private stopWaiting(): void {
    if (this.answerTimer !== null) clearTimeout(this.answerTimer);
    this.answerTimer = null;
  }

  // ── WALK AWAY ──

  private askWalkAway(): void {
    const box = el('div', 'pp-confirm');
    box.setAttribute('role', 'alertdialog');
    box.append(
      el('p', '', 'Walk away? The client goes back on the boat.'),
      btn('WALK AWAY', 'pp-confirm-go', () => {
        this.dropConfirm();
        this.run.walkAway();
      }),
      btn('STAY', 'pp-confirm-stay', () => this.dropConfirm()),
    );
    this.confirm = box;
    this.shell.root.append(box);
    (box.querySelector('.pp-confirm-stay') as HTMLElement).focus();
  }

  private dropConfirm(): void {
    this.confirm?.remove();
    this.confirm = null;
  }

  // ── keys ──

  private escape(): void {
    // A finished run has one way out, its button (spec §3.7): Esc can't dodge a bad result. Only once the
    // server has refused it, or never answered, may Esc drop it (§8).
    if (this.end) {
      if (this.refusal) this.opts.onClose();
      return;
    }
    // The officer is already reading: there's nothing left to walk away from.
    if (this.run.handingOver) return;
    if (this.confirm) this.dropConfirm();
    else if (!this.run.escape()) this.askWalkAway();
  }

  private key(e: KeyboardEvent): void {
    if (this.closed || e.key === '`' || e.altKey || e.ctrlKey || e.metaKey || this.opts.blocked?.()) return;
    const t = e.target;
    const stop = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Esc is the board's (never the pause menu's) while it's up, wherever the focus is.
    if (e.key === 'Escape') {
      stop();
      if (!e.repeat) this.escape();
      return;
    }
    // Typing in a field outside the board (the dev panel) is that field's. The chat prompt isn't one while the board
    // is up (chat stays closed at the desk): a click on its bar or a Tab past the board can focus it, and its keys
    // are still the desk's.
    if (t instanceof HTMLElement && !this.shell.root.contains(t) && !t.closest('#input') && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    // A held Enter repeats: never let it act or send (the result would flash by); swallow it.
    if (e.repeat && e.key === 'Enter') return stop();
    const inside = t instanceof HTMLElement && this.shell.root.contains(t);
    // WALK AWAY / STAY is up: its buttons take Tab and Enter; nothing reaches the desk behind it.
    if (this.confirm) {
      if (!(t instanceof HTMLElement && this.confirm.contains(t))) stop();
      else e.stopImmediatePropagation();
      return;
    }
    // The desk is form controls (spec §3.5): a select keeps its keys and type-ahead, a button its Enter, Space and
    // Tab; u and r still work the desk from a button. Nothing reaches the room behind, though.
    const tag = inside ? (t as HTMLElement).tagName : '';
    if (tag === 'SELECT' || tag === 'OPTION' || (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab'))) {
      e.stopImmediatePropagation();
      return;
    }
    let taken: boolean;
    if (this.end) {
      taken = e.key === 'Enter';
      if (taken) this.send();
    } else taken = this.run.key(e);
    // Nothing reaches the room: the prompt would catch a stray letter, and a later Enter would send it as a
    // chat line mid-run. Tab moves through the board's own controls.
    if (e.key === 'Tab' && !taken) e.stopImmediatePropagation();
    else if (taken || e.key.length === 1 || e.key === 'Enter') stop();
  }
}
