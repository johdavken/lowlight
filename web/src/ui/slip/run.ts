/**
 * Slip's run screen (spec §4.3–§4.6): the camera-feed board, HEAT and KIT, what's going on, the
 * selected node, the log, the keys (moves on the lattice, WAIT, aiming NOISE and JAM, LIFT), and
 * the dev strip. The board arrives from a promise (a worker); until then, "casing the floor".
 */
import type { Brief } from '../../../../shared/gig/brief';
import {
  camLabel,
  guardLabel,
  illegal,
  outcomeOf,
  predictWatch,
  SLIP_RULES,
  startSlip,
  step,
  watchedBy,
  type Dir,
  type SlipAction,
  type SlipBoard,
  type SlipEvent,
  type SlipState,
} from '../../../../shared/slip/rules';
import { button } from '../gig/hack-run';
import type { RunHost, RunScreen } from '../gig/run-screen';
import { SlipBoardView } from './board-view';
import type { SlipCueName } from './sound';

/** The kit the window keeps across runs (the dev strip's KIT CHARGES changes it). */
export interface Kit {
  charges: number;
}

/** Arrows and WASD on the lattice, as the board is drawn: up is up-right, right is down-right. */
const KEY_DIR: Record<string, Dir> = { ArrowUp: 3, w: 3, ArrowRight: 0, d: 0, ArrowDown: 1, s: 1, ArrowLeft: 2, a: 2 };
/** How long the last move shows before the result screen (none under reduced motion). */
const END_MS = 420;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Aim = { k: 'noise' | 'jam'; targets: number[]; i: number };

/** A turn's cues (spec §7): one per kind of event, and one "spotted" however many saw you. */
function cuesFor(events: SlipEvent[]): SlipCueName[] {
  const out: SlipCueName[] = [];
  const add = (c: SlipCueName) => out.includes(c) || out.push(c);
  for (const e of events) {
    if (e.k === 'move') add('step');
    else if (e.k === 'wait' || e.k === 'noise' || e.k === 'jam' || e.k === 'hide' || e.k === 'lift') add(e.k);
    else if (e.k === 'spotted' || e.k === 'seen' || e.k === 'camera') add('spotted');
  }
  return out;
}

export class SlipRun implements RunScreen {
  private board: SlipBoard | null = null;
  private st: SlipState | null = null;
  private view: HTMLElement | null = null;
  private devStrip: HTMLElement | null = null;
  private boardView: SlipBoardView | null = null;
  private side: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private sel: number | null = null;
  private aim: Aim | null = null;
  private log: { cls: string; text: string; t: number }[] = [];
  private solIdx = 0;
  private gone = false;

  constructor(
    private readonly host: RunHost,
    private readonly job: { brief: Brief; seed: number; board: Promise<SlipBoard | null> },
    private readonly place: { name: string; district: string },
    private readonly kit: Kit,
    /** e2e: expose the clean route on window.__nixRoom.slip. */
    private readonly exposeSolution = false,
  ) {
    job.board.then(
      (b) => this.arrive(b),
      () => this.arrive(null),
    );
  }

  step(): string {
    return this.job.brief.title.toUpperCase();
  }

  mount(view: HTMLElement, devStrip: HTMLElement | null): void {
    this.view = view;
    this.devStrip = devStrip;
    if (!this.board) {
      view.replaceChildren(el('p', 'gig-boot slip-loading', '> casing the floor…'));
      if (devStrip) devStrip.replaceChildren(el('span', '', `DEV · seed ${this.job.seed} · casing…`));
      return;
    }
    this.build();
  }

  escape(): boolean {
    if (!this.aim) return false;
    this.aim = null;
    this.paint();
    return true;
  }

  key(e: KeyboardEvent): boolean {
    const st = this.st;
    if (!st || !this.board || st.over) return false;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.aim) {
      if (k === 'Tab') this.cycleAim(e.shiftKey ? -1 : 1);
      else if (k === 'Enter') this.fire();
      return true;
    }
    if (k in KEY_DIR) {
      const d = KEY_DIR[k];
      if (this.board.nodes[st.p].adj[d] < 0) this.toast('no way through');
      else this.act({ k: 'move', d });
    } else if (k === ' ') this.act({ k: 'wait' });
    else if (k === 'n') this.startAim('noise');
    else if (k === 'j') this.startAim('jam');
    else if (k === 'Enter') {
      if (st.p === this.board.target && !st.lifted) this.act({ k: 'lift' });
      else this.toast('nothing to lift here');
    } else return false;
    return true;
  }

  destroy(): void {
    this.gone = true;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    this.boardView?.destroy();
    this.boardView = null;
    this.view = null;
  }

  // ── the board arrives ──

  private arrive(b: SlipBoard | null): void {
    if (this.gone) return;
    if (!b) return this.host.failed();
    this.board = b;
    this.st = startSlip(b, this.kit.charges);
    this.log = [{ cls: 'slip-d', text: `on the floor · ${b.guards.length} guard${b.guards.length === 1 ? '' : 's'}, ${b.cams.length} camera${b.cams.length === 1 ? '' : 's'} · kit ${this.st.charges}`, t: 0 }];
    if (this.exposeSolution) {
      const hook = (window as unknown as { __nixRoom?: { slip?: { solution(): SlipAction[] } } }).__nixRoom;
      if (hook) hook.slip = { solution: () => b.solution };
    }
    this.host.repaint();
    if (this.view) this.build();
  }

  private build(): void {
    const view = this.view!;
    const b = this.board!;
    const brief = this.job.brief;
    view.replaceChildren();
    const head = el('div', 'gig-run-head');
    head.append(el('h4', 'gig-run-title slip-run-title', brief.title), el('span', 'gig-run-info', `${brief.client} · ${brief.target} · take: ${brief.take}`));
    const grid = el('div', 'gig-run slip-run');
    const boardHost = el('div', 'slip-board-host');
    this.side = el('aside', 'gig-side slip-side');
    grid.append(boardHost, this.side);
    view.append(head, grid);
    this.boardView?.destroy();
    this.boardView = new SlipBoardView(boardHost, b, { onNode: (id) => this.click(id), reducedMotion: this.host.reducedMotion, placeName: this.place.name });
    this.toastEl = el('div', 'slip-toast');
    boardHost.append(
      el('p', 'slip-hint', '[↑] ↗ · [→] ↘ · [↓] ↙ · [←] ↖ MOVE (or WASD) · [SPACE] WAIT · [N] NOISE · [J] JAM · [ENTER] LIFT · [ESC] CANCEL / SLIP OUT · click a linked node to move'),
      this.toastEl,
    );
    this.paint();
  }

  // ── turns ──

  private act(a: SlipAction): void {
    const b = this.board!;
    const st = this.st!;
    const why = illegal(b, st, a);
    if (why) return this.toast(why);
    const before = st.heat;
    const r = step(b, st, a);
    this.st = r.state;
    this.host.disarm();
    for (const e of r.events) this.logEvent(e, r.state.turn);
    for (const c of cuesFor(r.events)) this.host.cue(`slip:${c}`);
    this.paint();
    if (r.state.heat > before) this.shake();
    if (r.state.over) this.end();
  }

  private end(): void {
    const st = this.st!;
    const b = this.board!;
    const result = outcomeOf(st)!;
    const detail = `${result === 'caught' ? 'nothing taken' : this.job.brief.take} · heat ${st.heat}/${b.max}`;
    this.host.cue(`slip:${result}`);
    const go = () => {
      this.endTimer = null;
      if (!this.gone) this.host.ended({ result, meter: st.heat, max: b.max, seed: this.job.seed }, detail);
    };
    if (this.host.reducedMotion) go();
    else this.endTimer = setTimeout(go, END_MS);
  }

  private logEvent(e: SlipEvent, turn: number): void {
    const line: [string, string] | null =
      e.k === 'wait'
        ? ['slip-d', 'waited']
        : e.k === 'hide'
          ? ['slip-c', '▣ into the booth: out of sight']
          : e.k === 'noise'
            ? e.guard === null
              ? ['slip-d', '~ noise thrown · nobody heard it']
              : ['slip-c', `~ noise thrown · ${guardLabel(e.guard)} goes to look`]
            : e.k === 'jam'
              ? ['slip-c', `⌁ ${camLabel(e.cam)} jammed · ${SLIP_RULES.jamTurns} turns`]
              : e.k === 'spotted'
                ? ['slip-r', `◉ ${guardLabel(e.guard)} spotted you · +${e.heat} heat · they're coming`]
                : e.k === 'seen'
                  ? ['slip-r', `◉ ${guardLabel(e.guard)} still has eyes on you · +${e.heat}`]
                  : e.k === 'camera'
                    ? ['slip-r', `◎ ${camLabel(e.cam)} caught you on the feed · +${e.heat}`]
                    : e.k === 'lift'
                      ? ['slip-g', '◆ lifted · now get out']
                      : e.k === 'caught'
                        ? ['slip-r', e.why === 'heat' ? '✕ too hot · they lock the floor down' : e.hidden ? `✕ ${guardLabel(e.guard!)} found you in the booth` : `✕ ${guardLabel(e.guard!)} walked right into you`]
                        : e.k === 'out'
                          ? ['slip-g', '⇢ out the door']
                          : null;
    if (line) this.log.unshift({ cls: line[0], text: line[1], t: turn });
    this.log.length = Math.min(this.log.length, 60);
  }

  // ── aiming and clicks ──

  private startAim(k: 'noise' | 'jam'): void {
    const b = this.board!;
    const st = this.st!;
    if (st.charges <= 0) return this.toast('no charges');
    const targets =
      k === 'noise'
        ? b.nodes.filter((n) => n.id !== st.p && b.dist[st.p][n.id] <= SLIP_RULES.noiseRange).map((n) => n.id)
        : b.cams.map((_, i) => i).filter((i) => b.dist[st.p][b.cams[i].node] <= SLIP_RULES.jamRange && st.jam[i] === 0);
    if (!targets.length) return this.toast(k === 'jam' ? 'no camera in range' : 'nowhere to throw');
    this.host.disarm();
    this.aim = { k, targets, i: 0 };
    this.paint();
  }

  private cycleAim(by: number): void {
    const aim = this.aim!;
    aim.i = (aim.i + by + aim.targets.length) % aim.targets.length;
    this.host.disarm();
    this.host.cue('select');
    this.paint();
  }

  private fire(): void {
    const aim = this.aim!;
    this.aim = null;
    const t = aim.targets[aim.i];
    this.act(aim.k === 'noise' ? { k: 'noise', n: t } : { k: 'jam', c: t });
  }

  /** Pads the aim lights: nodes for NOISE, the cameras' nodes for JAM. */
  private aimNodes(): { targets: number[]; cur: number } | null {
    const aim = this.aim;
    if (!aim) return null;
    const node = (t: number) => (aim.k === 'noise' ? t : this.board!.cams[t].node);
    return { targets: aim.targets.map(node), cur: node(aim.targets[aim.i]) };
  }

  private click(id: number): void {
    const b = this.board;
    const st = this.st;
    if (!b || !st || st.over) return;
    if (this.aim) {
      const aim = this.aim;
      const i = aim.k === 'noise' ? aim.targets.indexOf(id) : aim.targets.findIndex((c) => b.cams[c].node === id);
      if (i < 0) return this.toast('out of range');
      aim.i = i;
      return this.fire();
    }
    const d = b.nodes[st.p].adj.indexOf(id);
    if (d >= 0) {
      this.sel = null;
      return this.act({ k: 'move', d: d as Dir });
    }
    this.sel = this.sel === id ? null : id;
    this.host.disarm();
    this.host.cue('select');
    this.paint();
  }

  private toast(text: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      if (this.toastEl) this.toastEl.textContent = '';
    }, 1600);
  }

  private shake(): void {
    const box = this.side?.querySelector('.slip-heat');
    if (!box || this.host.reducedMotion) return;
    box.classList.remove('slip-shake');
    void (box as HTMLElement).offsetWidth;
    box.classList.add('slip-shake');
  }

  // ── drawing ──

  private paint(): void {
    const b = this.board;
    const st = this.st;
    if (!b || !st || !this.boardView || !this.side) return;
    const moves = b.nodes[st.p].adj.filter((n) => n >= 0 && !st.g.some((g) => g.n === n));
    this.boardView.render(st, { sel: this.sel, aim: this.aimNodes(), moves });
    this.side.replaceChildren(this.heatBox(), this.kitBox(), this.statusBox(), this.inspector(), this.logBox());
    this.paintDev();
  }

  private heatBox(): HTMLElement {
    const b = this.board!;
    const st = this.st!;
    const box = el('div', `gig-box slip-heat${st.heat >= b.max - 2 ? ' slip-hot' : ''}`);
    const pips = el('div', 'gig-pips');
    for (let i = 0; i < b.max; i++) pips.append(el('span', `gig-pip${i < st.heat ? ' gig-pip-on' : ''}`));
    box.append(el('h5', '', st.heat === 0 ? 'HEAT · clean = never seen' : 'HEAT'), el('div', 'gig-num slip-num', `${st.heat} / ${b.max}`), pips);
    return box;
  }

  private kitBox(): HTMLElement {
    const st = this.st!;
    const box = el('div', 'gig-box slip-kit');
    const pips = el('div', 'gig-pips');
    for (let i = 0; i < this.kit.charges; i++) pips.append(el('span', `gig-pip${i < st.charges ? ' gig-pip-on' : ''}`));
    box.append(el('h5', '', 'KIT · STREET KIT'), el('div', 'gig-num slip-num', `${st.charges} / ${this.kit.charges}`), pips);
    return box;
  }

  private statusBox(): HTMLElement {
    const b = this.board!;
    const st = this.st!;
    const box = el('div', 'gig-box slip-status');
    const line = (cls: string, text: string) => box.append(el('div', cls, text));
    const chasing = st.g.filter((g) => g.m === 'chase').length;
    const searching = st.g.filter((g) => g.m === 'search').length;
    if (chasing) line('slip-r', `◉ ${chasing} guard${chasing > 1 ? 's' : ''} chasing`);
    if (searching) line('slip-r', `? ${searching} guard${searching > 1 ? 's' : ''} searching`);
    st.g.forEach((g, i) => g.m === 'investigate' && line('slip-c', `~ ${guardLabel(i)} checking a noise`));
    st.jam.forEach((t, i) => t > 0 && line('slip-c', `⌁ ${camLabel(i)} jammed · ${t}`));
    if (b.nodes[st.p].type === 'HIDE') line('slip-c', '▣ hidden');
    if (st.lifted) line('slip-g', '◆ lifted, now get out');
    if (!box.childElementCount) line('slip-d', 'quiet');
    return box;
  }

  private inspector(): HTMLElement {
    const b = this.board!;
    const st = this.st!;
    const id = this.sel ?? st.p;
    const n = b.nodes[id];
    const lines: string[] = [];
    if (id === st.p) lines.push('you are here');
    if (n.type === 'HIDE') lines.push("HIDE: you can't be seen here, but a guard who walks into you finds you");
    if (n.type === 'TARGET') lines.push(st.lifted ? 'lifted' : 'LIFT here, then get to the exit');
    if (id === b.exit && n.type !== 'TARGET') lines.push(st.lifted ? 'step here to get out' : 'the way out, once you have it');
    const who = (ws: ReturnType<typeof watchedBy>) => ws.filter((w) => w.nodes.includes(id)).map((w) => (w.guard !== undefined ? guardLabel(w.guard) : camLabel(w.cam!)));
    if (n.type !== 'HIDE') {
      const now = who(watchedBy(b, st));
      const next = who(predictWatch(b, st));
      if (now.length) lines.push(`watched now by ${now.join(', ')}`);
      if (next.length) lines.push(`watched next turn by ${next.join(', ')}`);
    }
    b.guards.forEach((g, i) => g.poses.some((p) => p[0] === id) && lines.push(`on ${guardLabel(i)}'s route (${g.kind})`));
    const box = el('div', 'gig-box slip-insp');
    const acts = el('div', 'gig-acts');
    const jamOk = st.charges > 0 && b.cams.some((c, i) => b.dist[st.p][c.node] <= SLIP_RULES.jamRange && st.jam[i] === 0);
    acts.append(button('[SPACE] WAIT', 'gig-act', () => this.act({ k: 'wait' })));
    if (st.p === b.target && !st.lifted) acts.append(button('[ENTER] LIFT', 'gig-act slip-act-lift', () => this.act({ k: 'lift' })));
    const noise = button('[N] NOISE', 'gig-act slip-act-tool', () => this.startAim('noise'));
    noise.disabled = st.charges <= 0;
    const jam = button('[J] JAM', 'gig-act slip-act-tool', () => this.startAim('jam'));
    jam.disabled = !jamOk;
    acts.append(noise, jam);
    box.append(el('div', 'gig-what', n.type === 'plain' ? 'FLOOR' : n.type), el('p', '', lines.join(' · ') || 'open floor'), acts);
    if (this.aim)
      box.append(
        el(
          'p',
          'slip-aiming',
          this.aim.k === 'noise'
            ? `NOISE: pick a node within ${SLIP_RULES.noiseRange} · [TAB] next · [ENTER] throw · [ESC] cancel`
            : `JAM: pick a camera within ${SLIP_RULES.jamRange} · [TAB] next · [ENTER] jam · [ESC] cancel`,
        ),
      );
    return box;
  }

  private logBox(): HTMLElement {
    const box = el('div', 'gig-box');
    const log = el('div', 'gig-log slip-log');
    for (const l of this.log) log.append(el('div', l.cls, `T${String(l.t).padStart(2, '0')} ${l.text}`));
    box.append(el('h5', '', 'LOG'), log);
    return box;
  }

  private paintDev(): void {
    const strip = this.devStrip;
    const b = this.board;
    if (!strip || !b) return;
    strip.replaceChildren(
      el('span', '', `DEV · seed ${this.job.seed} · ${b.nodes.length} nodes · tries ${b.tries} · solution ${b.solution.length} turns`),
      el('span', 'gig-sp'),
      button('SHOW SOLUTION ▸', '', () => this.showSolution()),
      button('NEW BOARD', '', () => this.host.restart((Math.random() * 2 ** 32) >>> 0)),
      button('RERUN SAME BOARD', '', () => this.host.restart(this.job.seed)),
      el('span', '', `KIT CHARGES ${this.kit.charges}`),
      button('−', '', () => ((this.kit.charges = Math.max(0, this.kit.charges - 1)), this.paintDev())),
      button('+', '', () => ((this.kit.charges = Math.min(6, this.kit.charges + 1)), this.paintDev())),
    );
  }

  /** One action of the clean route per press; played away from it, the run starts over first. */
  private showSolution(): void {
    const b = this.board!;
    if (this.st!.over) return;
    if (this.st!.turn !== this.solIdx) {
      // The route was found with the full kit, whatever the dev strip says now.
      this.st = startSlip(b);
      this.solIdx = 0;
      this.aim = null;
      this.log = this.log.slice(-1);
    }
    const a = b.solution[this.solIdx++];
    if (a) this.act(a);
  }
}
