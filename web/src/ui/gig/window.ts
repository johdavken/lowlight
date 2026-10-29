/**
 * The hack window (gig runs spec §4): over the open MAP, a CRT terminal with the place's jobs, then
 * a run on its board, then the result, which is sent once and answered by her in the room. Esc is
 * the map's: it asks `handleEscape` first. Other keys are taken here while the window is up.
 */
import { bugReportOpen } from '../bug-report';
import { dealJobs, gigKind, RESULTS_FOR, type Brief, type GigKind, type GigResult } from '../../../../shared/gig/brief';
import { generate as generateBoard } from '../../../../shared/gig/generate';
import { DECK, type Board, type Tier } from '../../../../shared/gig/rules';
import { KIT } from '../../../../shared/slip/rules';
import { HackRun, button, type Deck } from './hack-run';
import { slipBoards, type SlipBoards, type SlipGen } from '../slip/boards';
import { SlipRun, type Kit } from '../slip/run';
import { PapersRun } from '../papers/run';
import { papersBoard, type PapersBoard } from '../../../../shared/papers/generate';
import type { PapersData } from '../../../../shared/papers/data';
import type { SlipBoard } from '../../../../shared/slip/rules';
import { jobCard } from './job-card';
import type { RunEnd, RunHost, RunScreen } from './run-screen';
import './gig.css';

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

export interface GigWindowOpts {
  place: { id: string; name: string; district: string };
  you: string;
  contact: string;
  /** GET /api/gigs?place= */
  load: () => Promise<Brief[]>;
  onSend: (run: GigSend) => void;
  onClose: () => void;
  /** A sound cue by name: the hack's (gig/sound.ts) and the slip's (slip/sound.ts). */
  cue?: (name: string) => void;
  reducedMotion: boolean;
  /** The dev strip: seed, solver, REVEAL, NEW BOARD, DECK RAM, RERUN. */
  dev?: boolean;
  /** Default: `?gigSeed=` when present (e2e), else random. */
  seed?: () => number;
  /** The deck's RAM for this window's runs. Default DECK.ram. */
  ram?: number;
  generate?: (tier: Tier, seed: number) => Board;
  /** The window's music: 'slip' while a slip runs, null for the gig track (spec §7). */
  music?: (kind: GigKind | null) => void;
  /** Slip boards; default a web worker (slipBoards). */
  generateSlip?: SlipGen;
  /** GET /api/papers: the data papers boards are dealt from, and whether the first night is still to come. */
  loadPapers?: () => Promise<(PapersData & { firstNight: boolean }) | null>;
  /**
   * A big job's route (big jobs spec §3): straight onto this brief's run with this seed, no jobs list. Its
   * result goes out once, with this seed, and the window closes; walking away is a failure of its kind.
   */
  direct?: { brief: Brief; seed: number };
}

const RESULT_LABEL: Record<GigResult, string> = { clean: 'CLEAN', close: 'CLOSE CALL', traced: 'TRACED', caught: 'CAUGHT', back: 'TURNED BACK' };
/** How many seeds a job tries before saying the board won't resolve. */
const SEED_TRIES = 6;
/** How long a sent result waits for her turn to start before the window offers SEND AGAIN. */
const ANSWER_MS = 10_000;

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

type Screen = 'loading' | 'empty' | 'jobs' | 'run' | 'result' | 'error';

/** The job being run, and how it ended once it has. */
interface Run {
  brief: Brief;
  seed: number;
  end: RunEnd | null;
  detail: string;
}

export class GigWindow {
  private readonly root: HTMLElement;
  private readonly where: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly view: HTMLElement;
  private readonly devStrip: HTMLElement | null;
  /** What scrolls under the title bar: a run starts at its top. */
  private readonly scroll: HTMLElement;
  private readonly jackout: HTMLButtonElement;
  private screen: Screen = 'loading';
  private jobs: Brief[] = [];
  private picked = 0;
  private run: Run | null = null;
  private runScreen: RunScreen | null = null;
  private readonly deck: Deck;
  private readonly kit: Kit = { charges: KIT.charges };
  /** Slip boards asked for as the jobs are dealt (by job index), so SLIP IN rarely waits. */
  private readonly warm = new Map<number, { seed: number; board: Promise<SlipBoard | null> }>();
  private slipGen: SlipGen | null = null;
  /** The worker this window made (none when the opts gave a generator). */
  private ownBoards: SlipBoards | null = null;
  private playing: GigKind | null = null;
  /** Papers: the data boards are dealt from (null when it wouldn't load), and each papers job's dealt board. */
  private papersData: (PapersData & { firstNight: boolean }) | null = null;
  private readonly papers = new Map<number, PapersBoard>();
  /** Papers: the WALK AWAY / STAY confirm, while it's up. */
  private confirm: HTMLElement | null = null;
  private escArmed = false;
  /** Set when the result goes out; only a refusal clears it. */
  private sent = false;
  private refusal: string | null = null;
  private closed = false;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  // The bug report over this takes the keys (its own listener comes later on window).
  private readonly onKey = (e: KeyboardEvent) => void (!bugReportOpen() && this.key(e));

  constructor(
    host: HTMLElement,
    private readonly opts: GigWindowOpts,
  ) {
    this.deck = { ram: opts.ram ?? DECK.ram };
    this.root = el('div', 'gig-window');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Gig window');
    const term = el('div', 'gig-term');
    const bar = el('header', 'gig-tbar');
    this.where = el('span', 'gig-where');
    this.prompt = el('span', 'gig-esc-prompt', '[ESC] again to jack out');
    this.prompt.hidden = true;
    const close = (this.jackout = el('button', 'gig-jackout', '[ESC] JACK OUT'));
    close.type = 'button';
    // The button is SLIP OUT / JACK OUT itself, not Esc: it never just cancels an aim.
    close.addEventListener('click', () => this.handleEscape(true));
    bar.append(this.where, this.prompt, close);
    this.view = el('div', 'gig-view');
    this.devStrip = opts.dev ? el('div', 'gig-dev') : null;
    // The scanlines sit over the whole terminal; only the part under the title bar scrolls.
    const scroll = (this.scroll = el('div', 'gig-scroll'));
    scroll.append(this.view);
    if (this.devStrip) scroll.append(this.devStrip);
    term.append(el('div', 'gig-scan'), bar, scroll);
    this.root.append(term);
    host.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    this.paint();
    this.cue('jack-in');
    if (opts.direct) {
      void this.startDirect(opts.direct);
      return;
    }
    opts
      .load()
      .then(async (briefs) => {
        if (this.closed) return;
        this.jobs = dealJobs(briefs);
        this.jobs.forEach((b, i) => {
          if (gigKind(b) === 'slip') this.warm.set(i, this.slipBoard(b.tier, this.freshSeed()));
        });
        if (this.jobs.some((b) => gigKind(b) === 'papers')) await this.dealPapers();
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

  /** Esc, from the map: true while the window is up (it always takes it). */
  handleEscape(fromButton = false): boolean {
    if (this.closed) return false;
    // A finished run has one way out, its [ENTER] button (spec §3.7): Esc can't dodge a bad result.
    // Only once the server has refused it may Esc drop it (§8).
    if (this.screen === 'result' && !this.refusal) return true;
    if (this.screen === 'run' && !fromButton && this.runScreen?.escape()) return true;
    // Papers asks in words (spec §3.3): WALK AWAY or STAY. A second Esc is STAY.
    if (this.screen === 'run' && this.runScreen instanceof PapersRun) {
      // The officer is already reading: there's nothing left to walk away from.
      if (this.runScreen.handingOver) return true;
      if (this.confirm) this.dropConfirm();
      else this.askWalkAway();
      return true;
    }
    if (this.screen === 'run' && !this.escArmed) {
      this.escArmed = true;
      this.prompt.hidden = false;
      return true;
    }
    this.close();
    return true;
  }

  private askWalkAway(): void {
    const run = this.runScreen;
    if (!(run instanceof PapersRun)) return;
    const box = el('div', 'gig-confirm');
    box.setAttribute('role', 'alertdialog');
    box.append(
      el('p', '', 'Walk away? The client goes back on the boat.'),
      button('WALK AWAY', 'gig-confirm-go', () => {
        this.dropConfirm();
        run.walkAway();
      }),
      button('STAY', 'gig-confirm-stay', () => this.dropConfirm()),
    );
    this.confirm = box;
    this.root.querySelector('.gig-term')!.append(box);
    (box.querySelector('.gig-confirm-stay') as HTMLElement).focus();
  }

  private dropConfirm(): void {
    this.confirm?.remove();
    this.confirm = null;
  }

  /** The server refused the result: say why, and let it go again. */
  showRefusal(text: string): void {
    if (this.closed || this.screen !== 'result') return;
    this.stopWaiting();
    this.refusal = text;
    this.sent = false;
    this.paint();
  }

  destroy(): void {
    if (this.closed) return;
    this.cue('jack-out');
    this.stopWaiting();
    this.closed = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.dropRun();
    this.ownBoards?.dispose();
    this.root.remove();
  }

  /** A cue never breaks the run (no audio, a missing file). */
  private cue(name: string): void {
    try {
      this.opts.cue?.(name);
    } catch {
      // silent
    }
  }

  private close(): void {
    if (this.closed) return;
    // Direct mode: leaving before a result is walking away, a failure of the route's kind.
    if (this.opts.direct && !this.sent) {
      const kind = gigKind(this.opts.direct.brief);
      this.sent = true;
      this.opts.onSend({ kind, place: this.opts.place.id, brief: this.opts.direct.brief.id, result: RESULTS_FOR[kind][2], trace: 0, max: 0, seed: this.opts.direct.seed });
    }
    this.opts.onClose();
  }

  private kind(): GigKind {
    const brief = this.run?.brief ?? this.jobs[this.picked];
    return brief ? gigKind(brief) : 'hack';
  }

  // ── keys ──

  private key(e: KeyboardEvent): void {
    // Direct mode (a big job's route): no map above to hand Esc down, so the window takes it.
    if (this.opts.direct && e.key === 'Escape' && !this.closed) {
      e.preventDefault();
      e.stopPropagation();
      this.handleEscape();
      return;
    }
    if (this.closed || e.key === 'Escape' || e.key === '`' || e.altKey || e.ctrlKey || e.metaKey) return;
    // Typing in a field outside the window (the dev panel) is that field's.
    const t = e.target;
    if (t instanceof HTMLElement && !this.root.contains(t) && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    // A held Enter repeats: never let it act or send (the result would flash by); swallow it.
    if (e.repeat && e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // WALK AWAY / STAY is up: its buttons take Tab and Enter; nothing reaches the desk behind it.
    if (this.confirm) {
      if (!(t instanceof HTMLElement && this.confirm.contains(t))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else e.stopImmediatePropagation();
      return;
    }
    // The desk is form controls (Papers spec §3.5): a select or button in the window keeps Tab, Enter,
    // Space and type-ahead. Nothing reaches the room behind, though.
    if (this.screen === 'run' && this.runScreen instanceof PapersRun && t instanceof HTMLElement && this.root.contains(t) && /^(SELECT|BUTTON|OPTION)$/.test(t.tagName)) {
      if (!this.runScreen.key(e)) e.stopImmediatePropagation();
      return;
    }
    let taken = true;
    if (this.screen === 'jobs') {
      if (k === 'Enter') this.start(this.picked);
      else if (k === 'ArrowRight' || k === 'ArrowDown') this.pick(this.picked + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') this.pick(this.picked - 1);
      else if (/^[1-3]$/.test(k) && Number(k) <= this.jobs.length) this.pick(Number(k) - 1);
      else taken = false;
    } else if (this.screen === 'run' && this.runScreen) {
      taken = this.runScreen.key(e);
    } else if (this.screen === 'result') {
      if (k === 'Enter') this.send();
      else taken = false;
    } else taken = false;
    // Nothing reaches the room behind the window: its type-anywhere prompt would catch a stray
    // letter, and a later Enter would send it as a chat line mid-run.
    const papersTab = e.key === 'Tab' && this.screen === 'run' && this.runScreen instanceof PapersRun;
    if (!taken && papersTab) e.stopImmediatePropagation();
    else if (taken || e.key.length === 1 || e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  private pick(i: number): void {
    if (!this.jobs.length) return;
    this.picked = (i + this.jobs.length) % this.jobs.length;
    this.paint();
  }

  private disarm(): void {
    this.escArmed = false;
    this.prompt.hidden = true;
  }

  // ── a run ──

  private dropRun(): void {
    this.dropConfirm();
    this.runScreen?.destroy();
    this.runScreen = null;
  }

  private host(): RunHost {
    return {
      cue: (name) => this.cue(name),
      disarm: () => this.disarm(),
      repaint: () => this.paintBar(),
      ended: (end, detail) => {
        if (!this.run || this.closed) return;
        this.setMusic(null);
        this.disarm();
        this.run.end = end;
        this.run.detail = detail;
        this.dropRun();
        this.screen = 'result';
        this.paint();
      },
      failed: () => {
        if (this.closed) return;
        this.setMusic(null);
        this.disarm();
        this.dropRun();
        this.run = null;
        this.screen = 'error';
        this.paint();
      },
      restart: (seed) => this.start(this.picked, seed),
      dev: !!this.opts.dev,
      reducedMotion: this.opts.reducedMotion,
    };
  }

  private setMusic(kind: GigKind | null): void {
    if (this.playing === kind) return;
    this.playing = kind;
    this.opts.music?.(kind);
  }

  private freshSeed(): number {
    return this.opts.seed?.() ?? urlSeed() ?? (Math.random() * 2 ** 32) >>> 0;
  }

  private slipBoard(tier: Tier, seed: number): { seed: number; board: Promise<SlipBoard | null> } {
    if (!this.slipGen) {
      if (this.opts.generateSlip) this.slipGen = this.opts.generateSlip;
      else this.slipGen = this.ownBoards = slipBoards();
    }
    return { seed, board: this.slipGen(tier, seed) };
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

  private start(i: number, seed?: number): void {
    const brief = this.jobs[i];
    if (!brief) return;
    this.picked = i;
    this.dropRun();
    this.disarm();
    this.sent = false;
    this.refusal = null;
    if (gigKind(brief) === 'papers') {
      const data = this.papersData;
      const board = data ? (seed === undefined ? (this.papers.get(i) ?? papersBoard(brief.tier, this.freshSeed() || 1, data)) : papersBoard(brief.tier, seed, data)) : null;
      if (!board) {
        this.screen = 'error';
        this.run = { brief, seed: 0, end: null, detail: '' };
        this.paint();
        this.run = null;
        return;
      }
      this.run = { brief, seed: board.seed, end: null, detail: '' };
      this.screen = 'run';
      this.setMusic('papers');
      this.runScreen = new PapersRun(this.host(), { brief, board }, { name: this.opts.place.name }, !!this.opts.dev);
      this.paint();
      this.scroll.scrollTop = 0;
      return;
    }
    if (gigKind(brief) === 'slip') {
      // The dealt board, unless the dev strip asked for a seed; a later SLIP IN deals a fresh one.
      const job = seed === undefined ? (this.warm.get(i) ?? this.slipBoard(brief.tier, this.freshSeed())) : this.slipBoard(brief.tier, seed);
      this.warm.delete(i);
      this.run = { brief, seed: job.seed, end: null, detail: '' };
      this.screen = 'run';
      this.setMusic('slip');
      this.runScreen = new SlipRun(this.host(), { brief, seed: job.seed, board: job.board }, { name: this.opts.place.name, district: this.opts.place.district }, this.kit, urlSeed() !== null);
      this.paint();
      return;
    }
    const gen = this.opts.generate ?? generateBoard;
    const base = seed ?? this.opts.seed?.() ?? urlSeed() ?? (Math.random() * 2 ** 32) >>> 0;
    let board: Board | null = null;
    let used = base;
    for (let k = 0; k < SEED_TRIES && !board; k++) {
      try {
        used = (base + k) >>> 0;
        board = gen(brief.tier, used);
      } catch {
        board = null;
      }
    }
    this.sent = false;
    this.refusal = null;
    if (!board) {
      this.screen = 'error';
      this.run = null;
      this.paint();
      return;
    }
    this.setMusic(null);
    this.run = { brief, seed: used, end: null, detail: '' };
    this.screen = 'run';
    this.runScreen = new HackRun(this.host(), { brief, seed: used, board }, this.deck, urlSeed() !== null);
    this.paint();
  }

  /** A big job's route: its one brief, its seed, its board (papers data loaded first). */
  private async startDirect(d: { brief: Brief; seed: number }): Promise<void> {
    this.jobs = [d.brief];
    if (gigKind(d.brief) === 'papers') await this.dealPapers();
    if (this.closed) return;
    this.start(0, d.seed);
  }

  /** Direct mode: the result once, with the route's seed, then close (no row of its own to wait for). */
  private sendDirect(result: GigResult, meter = 0, max = 0): void {
    const d = this.opts.direct!;
    if (this.sent) return;
    this.sent = true;
    this.opts.onSend({ kind: gigKind(d.brief), place: this.opts.place.id, brief: d.brief.id, result, trace: meter, max, seed: d.seed });
    this.close();
  }

  private send(): void {
    const run = this.run;
    if (this.opts.direct && run?.end) return this.sendDirect(run.end.result, run.end.meter, run.end.max);
    if (this.sent || !run?.end) return;
    this.sent = true;
    this.refusal = null;
    this.paint();
    const { end } = run;
    this.opts.onSend({ kind: gigKind(run.brief), place: this.opts.place.id, brief: run.brief.id, result: end.result, trace: end.meter, max: end.max, seed: end.seed, ...(end.papers ? { papers: end.papers } : {}) });
    // No row and no refusal (the link dropped): don't wait forever.
    this.stopWaiting();
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      this.showRefusal('no answer — check the link and send again');
    }, ANSWER_MS);
  }

  private stopWaiting(): void {
    if (this.answerTimer !== null) clearTimeout(this.answerTimer);
    this.answerTimer = null;
  }

  // ── drawing ──

  private paintBar(): void {
    const step =
      this.screen === 'jobs'
        ? `${this.jobs.length} JOB${this.jobs.length === 1 ? '' : 'S'}`
        : this.screen === 'run' && this.runScreen
          ? this.runScreen.step()
          : this.screen === 'result' && this.run?.end
            ? RESULT_LABEL[this.run.end.result]
            : this.screen === 'empty'
              ? 'NO JOBS'
              : this.screen === 'error'
                ? 'ERROR'
                : 'CONNECTING';
    const kind = this.kind();
    const slip = kind === 'slip';
    this.jackout.hidden = this.screen === 'result' && !this.refusal;
    this.jackout.textContent = this.screen === 'run' && kind !== 'hack' ? (slip ? '[ESC] SLIP OUT' : '[ESC] WALK AWAY') : '[ESC] JACK OUT';
    this.prompt.textContent = slip ? '[ESC] again to slip out' : '[ESC] again to jack out';
    // Papers names the job, not the district (spec §3.3): you sit at one desk for one client.
    this.where.textContent =
      kind === 'papers' && this.screen === 'run' && this.run
        ? `◢ DESK // ${this.opts.place.name.toUpperCase()} · ${this.run.brief.title}`
        : `◢ ${slip ? 'FLOOR' : kind === 'papers' ? 'DESK' : 'GRID'} // ${this.opts.place.name.toUpperCase()} · ${this.opts.place.district.toUpperCase()} · ${step}`;
  }

  private paint(): void {
    if (this.closed) return;
    // Paper on a desk, not a screen (Papers spec §5): no CRT while the desk is up.
    this.root.classList.toggle('gig-papers-run', this.screen === 'run' && this.runScreen instanceof PapersRun);
    this.paintBar();
    if (this.screen === 'run' && this.runScreen) {
      this.runScreen.mount(this.view, this.devStrip);
      return;
    }
    this.view.replaceChildren();
    if (this.screen === 'loading') this.view.append(el('p', 'gig-boot', '> dialing in…'));
    else if (this.screen === 'empty') this.view.append(el('p', 'gig-empty', 'no jobs posted here tonight'), el('p', 'gig-empty-close', '[ESC] CLOSE'));
    else if (this.screen === 'error') this.view.append(el('p', 'gig-error', `the ${{ slip: 'floor', papers: 'desk', hack: 'board' }[this.kind()]} won't resolve — try again`), el('p', 'gig-empty-close', '[ESC] CLOSE'));
    else if (this.screen === 'jobs') this.paintJobs();
    else if (this.screen === 'result') this.paintResult();
    this.paintDev();
  }

  private paintJobs(): void {
    const boot = el('p', 'gig-boot');
    boot.append(
      `> ${DECK.name.toLowerCase()} · ${this.deck.ram} RAM · ${KIT.name.toLowerCase()} · ${this.kit.charges} charges · forger's kit · ${this.opts.you} · ${this.opts.contact} on comms`,
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

  private paintResult(): void {
    const run = this.run!;
    const end = run.end!;
    const wrap = el('div', 'gig-result');
    wrap.append(el('div', `gig-result-big gig-${end.result}`, RESULT_LABEL[end.result]), el('div', 'gig-result-detail', run.detail));
    if (this.refusal) wrap.append(el('div', 'gig-refusal', this.refusal));
    const leave = { slip: '[ENTER] WALK AWAY', papers: '[ENTER] LEAVE THE DESK', hack: '[ENTER] JACK OUT' }[gigKind(run.brief)];
    const send = button(this.refusal ? '[ENTER] SEND AGAIN' : leave, 'gig-send', () => this.send());
    send.disabled = this.sent;
    wrap.append(send);
    this.view.append(wrap);
  }

  private paintDev(): void {
    const strip = this.devStrip;
    if (!strip) return;
    strip.replaceChildren();
    const run = this.run;
    strip.append(el('span', '', run?.end ? (run.end.devLine ?? `DEV · seed ${run.end.seed} · ${run.end.result} ${run.end.meter}/${run.end.max}`) : 'DEV'));
    strip.append(el('span', 'gig-sp'));
    strip.append(
      el('span', '', `DECK RAM ${this.deck.ram}`),
      button('−', '', () => ((this.deck.ram = Math.max(0, this.deck.ram - 1)), this.paint())),
      button('+', '', () => ((this.deck.ram = Math.min(8, this.deck.ram + 1)), this.paint())),
    );
  }
}
