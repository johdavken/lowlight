/**
 * The gig window (gig runs spec §4): over the open MAP, a CRT terminal with the place's jobs. SIT DOWN hands the
 * job and its dealt board to the papers board over the room (`onSit`; papers/hud.ts, since 2026-11-08), which
 * plays the desk, booth nine's read and the send. Esc is the map's: it asks `handleEscape` first. Other keys are
 * taken here while the window is up. Hack and slip are gone (2026-11-01): their briefs are never dealt.
 */
import { bugReportOpen } from '../bug-report';
import { dealJobs, gigKind, type Brief } from '../../../../shared/gig/brief';
import { papersBoard, type PapersBoard } from '../../../../shared/papers/generate';
import type { PapersData } from '../../../../shared/papers/data';
import { jobCard } from './job-card';
import './gig.css';

export interface GigWindowOpts {
  place: { id: string; name: string; district: string };
  you: string;
  contact: string;
  /** GET /api/gigs?place= */
  load: () => Promise<Brief[]>;
  /** SIT DOWN: the job, its board, and the board's seed (0 on the first night). */
  onSit: (job: { brief: Brief; board: PapersBoard }) => void;
  onClose: () => void;
  /** A sound cue by name (gig/sound.ts). */
  cue?: (name: string) => void;
  reducedMotion: boolean;
  /** Default: `?gigSeed=` when present (e2e), else random. */
  seed?: () => number;
  /** GET /api/papers: the data papers boards are dealt from, and whether the first night is still to come. */
  loadPapers?: () => Promise<(PapersData & { firstNight: boolean }) | null>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function urlSeed(): number | null {
  const raw = new URLSearchParams(location.search).get('gigSeed');
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) >>> 0 : null;
}

type Screen = 'loading' | 'empty' | 'jobs' | 'error';

export class GigWindow {
  private readonly root: HTMLElement;
  private readonly where: HTMLElement;
  private readonly view: HTMLElement;
  private screen: Screen = 'loading';
  private jobs: Brief[] = [];
  private picked = 0;
  /** Papers: the data boards are dealt from (null when it wouldn't load), and each papers job's dealt board. */
  private papersData: (PapersData & { firstNight: boolean }) | null = null;
  private readonly papers = new Map<number, PapersBoard>();
  private closed = false;
  // The bug report over this takes the keys (its own listener comes later on window).
  private readonly onKey = (e: KeyboardEvent) => void (!bugReportOpen() && this.key(e));

  constructor(
    host: HTMLElement,
    private readonly opts: GigWindowOpts,
  ) {
    this.root = el('div', 'gig-window');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Gig window');
    const term = el('div', 'gig-term');
    const bar = el('header', 'gig-tbar');
    this.where = el('span', 'gig-where');
    const close = el('button', 'gig-jackout', '[ESC] JACK OUT');
    close.type = 'button';
    close.addEventListener('click', () => this.handleEscape());
    bar.append(this.where, close);
    this.view = el('div', 'gig-view');
    // The scanlines sit over the whole terminal; only the part under the title bar scrolls.
    const scroll = el('div', 'gig-scroll');
    scroll.append(this.view);
    term.append(el('div', 'gig-scan'), bar, scroll);
    this.root.append(term);
    host.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    this.paint();
    this.cue('jack-in');
    opts
      .load()
      .then(async (briefs) => {
        if (this.closed) return;
        // Hack and slip are gone: an old brief of theirs is never dealt.
        this.jobs = dealJobs(briefs.filter((b) => gigKind(b) === 'papers'));
        if (this.jobs.length) await this.dealPapers();
        if (this.closed) return;
        this.screen = this.jobs.length ? 'jobs' : 'empty';
        this.paint();
      })
      .catch(() => {
        if (this.closed) return;
        this.screen = 'empty';
        this.paint();
      });
  }

  /** Esc, from the map: true while the window is up (it always takes it, and closes). */
  handleEscape(): boolean {
    if (this.closed) return false;
    this.opts.onClose();
    return true;
  }

  /** `quiet`: SIT DOWN, the desk takes over (no jack-out cue). */
  destroy(o: { quiet?: boolean } = {}): void {
    if (this.closed) return;
    if (!o.quiet) this.cue('jack-out');
    this.closed = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  /** A cue never breaks the window (no audio, a missing file). */
  private cue(name: string): void {
    try {
      this.opts.cue?.(name);
    } catch {
      // silent
    }
  }

  // ── keys ──

  private key(e: KeyboardEvent): void {
    if (this.closed || e.key === 'Escape' || e.key === '`' || e.altKey || e.ctrlKey || e.metaKey) return;
    // Typing in a field outside the window (the dev panel) is that field's.
    const t = e.target;
    if (t instanceof HTMLElement && !this.root.contains(t) && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    // A held Enter repeats: never let it sit down twice; swallow it.
    if (e.repeat && e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let taken = true;
    if (this.screen === 'jobs') {
      if (k === 'Enter') this.start(this.picked);
      else if (k === 'ArrowRight' || k === 'ArrowDown') this.pick(this.picked + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') this.pick(this.picked - 1);
      else if (/^[1-3]$/.test(k) && Number(k) <= this.jobs.length) this.pick(Number(k) - 1);
      else taken = false;
    } else taken = false;
    // Nothing reaches the room behind the window: its type-anywhere prompt would catch a stray letter.
    if (taken || e.key.length === 1 || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  private pick(i: number): void {
    if (!this.jobs.length) return;
    this.picked = (i + this.jobs.length) % this.jobs.length;
    this.paint();
  }

  private freshSeed(): number {
    return this.opts.seed?.() ?? urlSeed() ?? (Math.random() * 2 ** 32) >>> 0;
  }

  /** Papers (spec §3.1): one board per papers job, dealt now so its card shows the cap. The first night, while it's pending, is every card's. */
  private async dealPapers(): Promise<void> {
    try {
      this.papersData = (await this.opts.loadPapers?.()) ?? null;
    } catch {
      this.papersData = null;
    }
    const data = this.papersData;
    if (!data) return;
    this.jobs.forEach((b, i) => {
      if (gigKind(b) === 'papers') this.papers.set(i, papersBoard(b.tier, data.firstNight ? 0 : this.freshSeed() || 1, data));
    });
  }

  /** SIT DOWN: the board goes up over the room (the caller closes this window and the map). */
  private start(i: number): void {
    const brief = this.jobs[i];
    if (!brief) return;
    this.picked = i;
    const board = this.papers.get(i) ?? (this.papersData ? papersBoard(brief.tier, this.freshSeed() || 1, this.papersData) : null);
    if (!board) {
      this.screen = 'error';
      this.paint();
      return;
    }
    this.opts.onSit({ brief, board });
  }

  // ── drawing ──

  private paint(): void {
    if (this.closed) return;
    const step = this.screen === 'jobs' ? `${this.jobs.length} JOB${this.jobs.length === 1 ? '' : 'S'}` : this.screen === 'empty' ? 'NO JOBS' : this.screen === 'error' ? 'ERROR' : 'CONNECTING';
    this.where.textContent = `◢ DESK // ${this.opts.place.name.toUpperCase()} · ${this.opts.place.district.toUpperCase()} · ${step}`;
    this.view.replaceChildren();
    if (this.screen === 'loading') this.view.append(el('p', 'gig-boot', '> dialing in…'));
    else if (this.screen === 'empty') this.view.append(el('p', 'gig-empty', 'no jobs posted here tonight'), el('p', 'gig-empty-close', '[ESC] CLOSE'));
    else if (this.screen === 'error') this.view.append(el('p', 'gig-error', "the desk won't resolve — try again"), el('p', 'gig-empty-close', '[ESC] CLOSE'));
    else this.paintJobs();
  }

  private paintJobs(): void {
    const boot = el('p', 'gig-boot');
    boot.append(
      `> forger's kit · ${this.opts.you} · ${this.opts.contact} on comms`,
      el('br', ''),
      `> ${this.jobs.length} job${this.jobs.length === 1 ? '' : 's'} posted for ${this.opts.place.name}. pick one.`,
    );
    const list = el('div', 'gig-jobs');
    // Hovering picks a card only once the pointer really moves: the board opens under a still
    // pointer (it was on GIGS), and the browser reports that as being over whichever card is there.
    let rest: { x: number; y: number } | null = null;
    this.jobs.forEach((b, i) => {
      const dealt = this.papers.get(i);
      const card = jobCard(b, { picked: i === this.picked, onJackIn: () => this.start(i), ...(dealt ? { cap: dealt.cap } : {}) });
      card.addEventListener('mousemove', (e) => {
        if (rest === null) rest = { x: e.clientX, y: e.clientY };
        if (rest.x === e.clientX && rest.y === e.clientY) return;
        rest = { x: -1, y: -1 }; // moved: from here on every move counts
        if (this.picked !== i) this.pick(i);
      });
      list.append(card);
    });
    this.view.append(boot, list, el('p', 'gig-hint', '[←/→] PICK · [ENTER] GO · [ESC] CLOSE'));
  }
}
