import { her } from '../room/her-copy';
import { formatClock } from '../../../shared/clock';
import type { Atmosphere, ChatThinking, LinkStatus, NarratorThinking, ReplyLength } from '../../../shared/types';
import { hhmm } from './clock';
import { onClickAway } from './click-away';
import { SysMenu } from './sys-menu';
import type { FrameRate } from './frame-rate';
import type { EffectsLevel, RenderScale } from './graphics-prefs';
import { setTip } from './hover-tag';

const CLOCK_MS = 30_000;
/** The texts notice holds this long after a text lands, then folds into TEXTS' count. */
export const TEXTS_HOLD_MS = 3500;
/** Pointing away from TEXTS or the notice folds it again after this. */
export const TEXTS_LEAVE_MS = 600;
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** The SYS button's label: SYS while the link holds, else what went wrong. */
const SYS_LABEL: Record<LinkStatus, string> = { ok: 'SYS', down: 'LINK DOWN', lost: 'SIGNAL LOST' };

function span(cls: string, text = ''): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/** What SYS shows of the sound: hidden, waiting for a first tap (♪), or the volume. */
/** What SYS's SOUND rows do (main.ts hands them to the room's audio). */
export interface SoundControl {
  onToggle(): void;
  onWheel(steps: number): void;
  onMusic(steps: number): void;
  onVoice(steps: number): void;
  onUi(steps: number): void;
  onAmbient(steps: number): void;
  /** IN BACKGROUND: true mutes the sound while the window isn't focused. */
  onBackground(mute: boolean): void;
}

export type SoundView = { kind: 'hidden' } | { kind: 'locked' } | { kind: 'on'; volume: number; muted: boolean; music: number; voice: number; ui: number; ambient: number; muteInBackground: boolean };

/**
 * The bar's steps when it runs short of room: full size, then snug and tight type, then (still
 * tight) without the weather, then without the clock too, then the screens cut to their letters
 * (DICE to ◆), and last DICE gone. The room name is only ever cut short ("…"), never dropped.
 */
const FITS = ['full', 'snug', 'tight', 'no-weather', 'no-clock', 'short'] as const;

/** A screen on the bar: its word, and its Alt key when it has one (that letter underlined where it sits in the word; CREW's K isn't in it, so none). */
interface Screen {
  el: HTMLSpanElement;
  word: string;
  /** The Alt key (also the letter it shortens to), or null: DICE and MAP have none. */
  key: string | null;
  /** Its mark short of room when it has no key. */
  short: string;
}

/**
 * The HUD (the Keys bar, spec 2026-10-15): one bar across the top — ‹, the place, the clock and the
 * weather on the left; the screens (YOU, JOURNAL, SAVE, CONTACTS, LEADS, DICE, MAP) and SYS on the right —
 * plus corner brackets. While Alt is held, each screen's Alt letter is underlined (style.css); the
 * rest of the time the words are plain. SYS holds the volume, her model and the link (sys-menu.ts); its button turns red
 * when the link drops. Short of room the bar tightens its type, then steps things out (FITS).
 */
export class Hud {
  private readonly scene = span('scene', '——');
  private readonly clock = span('clock');
  /** The story clock, when the room has one (else local time). */
  private story: number | null = null;
  private readonly weather = span('weather', '——');
  /** Blackouts phase 3 §4: `KARASU · POWER OUT` while the room you're in has no power. */
  private readonly power = span('hud-power');
  private readonly powerSep = span('sep sep-power', '·');
  private readonly notice = span('notice');
  private readonly back = span('hud-back', '‹');
  private readonly you = this.screen('hud-you', 'YOU', 'Y');
  /** PEOPLE (who you know: each one's file, your texts with them, and the journal). TEXTS was its own word until 2026-11-15; its count rides this one. */
  private readonly people = this.screen('hud-people', 'PEOPLE', 'P');
  private readonly quest = this.screen('hud-quest', 'JOBS', 'Q');
  /** CREW (crew spec §4): the roster, tonight's errands and hires. */
  private readonly crew = this.screen('hud-crew', 'CREW', 'K');
  private readonly map = this.screen('hud-map', 'MAP', null, 'MAP');
  /** BOOK (lore drawer spec 2026-11-06): not a screen, a drawer beside the scene; its word lights apart from setOpen's six. */
  private readonly book = this.screen('hud-book', 'BOOK', 'B');
  private onSave: (() => void) | null = null;
  /** Whose reply is streaming (SAVE then reads WAIT FOR <NAME> and doesn't open), or null. */
  private saveBusy: string | null = null;
  private onPause?: () => void;
  /** Who's watching SYS open and close (the pause menu's SETTINGS page). */
  private readonly sysWatchers = new Set<(open: boolean) => void>();
  private readonly sys = span('hud-sys');
  /**
   * Texts you haven't seen on the deck (promised texts spec §6): `NIX · 1 TEXT`, opens TEXTS on the first sender. A notice
   * under the bar (the room HUD): it drops in when a text lands, folds into TEXTS' count after TEXTS_HOLD_MS, and is
   * back while the pointer (or focus) is on PEOPLE or on it.
   */
  private readonly texts = span('hud-texts');
  /** The notices under the bar at the right: the warning (pinned) and the texts notice. */
  private readonly notices = document.createElement('div');
  private textsArrived = false;
  /** The pointer is on TEXTS or the notice; focus is in one of them. Either shows it. */
  private textsHover = false;
  private textsFocus = false;
  private textsFoldTimer: ReturnType<typeof setTimeout> | undefined;
  private textsLeaveTimer: ReturnType<typeof setTimeout> | undefined;
  /** The bar's trace (no band, no fills): drawn from where the words landed, by drawTrace. */
  private readonly trace = document.createElementNS(NS, 'svg');
  private readonly left = document.createElement('div');
  private readonly root: HTMLElement;
  /** The link light: `.link[data-status]`, as the bar's link status always was. */
  private readonly link = span('link');
  private readonly sysNote = span('sys-note');
  private readonly sysLabel = span('sys-name', 'SYS');
  private readonly sysCaret = span('sys-caret', '▾');
  private readonly menu: SysMenu;
  private sound: SoundControl | null = null;
  private tips: { onTips(on: boolean): void; onTipsAgain(): void } | null = null;
  private intro: ((skip: boolean) => void) | null = null;
  private worldMoves: ((on: boolean) => void) | null = null;
  private mirror: ((on: boolean) => void) | null = null;
  private frameRate: ((r: FrameRate) => void) | null = null;
  private renderScale: ((s: RenderScale) => void) | null = null;
  private effects: ((l: EffectsLevel) => void) | null = null;
  private blur: ((on: boolean) => void) | null = null;
  private post: ((on: boolean) => void) | null = null;
  private figureLight: ((on: boolean) => void) | null = null;
  private onModel: (() => void) | null = null;
  private thinking: ((t: NarratorThinking) => void) | null = null;
  private replyPrefs: { onReplyLength(l: ReplyLength): void; onChatThinking(t: ChatThinking): void } | null = null;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly bar = document.createElement('div');
  private readonly onResize = () => this.fit();
  private readonly onAltDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') this.bar.classList.add('alt-held');
    // A key without Alt means Alt is up, even if its release never reached us (a window manager, an IME).
    else if (!e.altKey) this.bar.classList.remove('alt-held');
  };
  private readonly onPointerMove = (e: PointerEvent | MouseEvent) => {
    if (!e.altKey) this.bar.classList.remove('alt-held');
  };
  private readonly onAltUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') this.bar.classList.remove('alt-held');
  };
  private readonly onBlur = () => this.bar.classList.remove('alt-held');
  private readonly offClickAway: () => void;
  private readonly onDocClick = (e: MouseEvent) => {
    if (!(e.target instanceof Node && this.sys.contains(e.target))) this.menu.close();
  };
  /** Focus going anywhere but SYS (Tab on, a save or journal field) closes SYS, so it can't keep the keys. */
  private readonly onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof Node && !this.sys.contains(e.target) && !this.menu.el.contains(e.target)) this.menu.close();
  };

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('hud-root');
    const band = document.createElement('div');
    band.className = 'hud-band';
    root.append(band);
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      const c = document.createElement('div');
      c.className = `corner ${pos}`;
      root.append(c);
    }

    const left = this.left;
    left.className = 'hud hud-left';
    this.back.hidden = true;
    this.power.hidden = true;
    this.powerSep.hidden = true;
    left.append(this.back, this.scene, span('sep sep-clock', '·'), this.clock, span('sep sep-weather', '·'), this.weather, this.powerSep, this.power);

    this.menu = new SysMenu({
      onVolume: (d) => this.sound?.onWheel(d),
      onMute: () => this.sound?.onToggle(),
      onMusic: (d) => this.sound?.onMusic(d),
      onVoice: (d) => this.sound?.onVoice(d),
      onUi: (d) => this.sound?.onUi(d),
      onBackground: (mute) => this.sound?.onBackground(mute),
      onAmbient: (d) => this.sound?.onAmbient(d),
      onTips: (on) => this.tips?.onTips(on),
      onTipsAgain: () => this.tips?.onTipsAgain(),
      onIntro: (skip) => this.intro?.(skip),
      onWorldMoves: (on) => this.worldMoves?.(on),
      onMirror: (on) => this.mirror?.(on),
      onFrameRate: (r) => this.frameRate?.(r),
      onRenderScale: (r) => this.renderScale?.(r),
      onEffects: (l) => this.effects?.(l),
      onBlur: (on) => this.blur?.(on),
      onPost: (on) => this.post?.(on),
      onFigureLight: (on) => this.figureLight?.(on),
      onModel: () => this.onModel?.(),
      onThinking: (t) => this.thinking?.(t),
      onReplyLength: (l) => this.replyPrefs?.onReplyLength(l),
      onChatThinking: (t) => this.replyPrefs?.onChatThinking(t),
      onOpenChange: (open) => {
        // Closed, a SETTINGS page's SYS comes home to the HUD (shut), ready to drop under its word again.
        if (!open && this.menu.el.parentElement !== this.root) {
          this.menu.el.classList.remove('sys-paged');
          this.root.append(this.menu.el);
        }
        this.root.classList.toggle('sys-open', open);
        this.sys.setAttribute('aria-expanded', String(open));
        this.drawTrace();
        for (const w of [...this.sysWatchers]) w(open);
      },
    });
    this.sys.setAttribute('role', 'button');
    this.sys.setAttribute('aria-haspopup', 'menu');
    this.sys.setAttribute('aria-expanded', 'false');
    this.sys.tabIndex = 0;
    this.sys.append(this.link, this.sysNote, this.sysLabel, this.sysCaret);
    // The click goes on to the document (main.ts closes the MODEL menu there); onDocClick lets SYS's own clicks be.
    // With a pause menu, SYS opens PAUSED on its SETTINGS page; without one, it drops down under the word.
    this.sys.onclick = () => (this.onPause ? this.onPause() : this.menu.toggle());
    // A mouse press doesn't take keyboard focus from the prompt (Tab still reaches SYS).
    this.sys.addEventListener('mousedown', (e) => e.preventDefault());
    this.sys.onkeydown = (e) => {
      if ((e.key !== 'Enter' && e.key !== ' ') || this.menu.isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      if (this.onPause) this.onPause();
      else this.menu.open();
    };
    this.sys.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY !== 0) this.sound?.onWheel(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );

    const right = document.createElement('div');
    right.className = 'hud hud-right';
    this.notice.hidden = true;
    for (const s of [this.you, this.people, this.quest, this.map]) s.el.hidden = true;
    this.texts.hidden = true;
    this.texts.setAttribute('role', 'button');
    this.texts.tabIndex = 0;
    setTip(this.texts, 'Open your texts');
    this.texts.addEventListener('click', () => this.openNotice());
    this.texts.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.openNotice();
    });
    for (const n of [this.people.el, this.texts]) {
      n.addEventListener('pointerenter', () => this.hoverTexts(true));
      n.addEventListener('pointerleave', () => this.hoverTexts(false));
      n.addEventListener('focusin', () => {
        this.textsFocus = true;
        this.syncTexts();
      });
      n.addEventListener('focusout', () => {
        this.textsFocus = false;
        this.syncTexts();
      });
    }
    // The drop and the ping play once: off when done, so a hover doesn't replay the drop, and the trace is drawn
    // again from where the notice came to rest.
    this.texts.addEventListener('animationend', () => {
      this.texts.classList.remove('drop');
      this.drawTrace();
    });
    this.people.el.addEventListener('animationend', () => this.people.el.classList.remove('ping'));
    right.append(...[this.you, this.people, this.quest, this.crew, this.map, this.book].map((s) => s.el), this.sys);
    this.notices.className = 'hud-notices';
    // The texts notice first: folded it still holds its place, which then sits left of the pinned warning, not under it.
    this.notices.append(this.texts, this.notice);
    this.trace.setAttribute('class', 'hud-trace');
    this.trace.setAttribute('aria-hidden', 'true');

    this.bar.className = 'hud-bar';
    this.bar.dataset.fit = 'full';
    this.bar.append(left, right);
    root.append(this.trace, this.bar, this.notices, this.menu.el);
    this.setLink('down');
    this.tick();
    this.timer = setInterval(() => this.tick(), CLOCK_MS);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onAltDown, true);
    window.addEventListener('keyup', this.onAltUp, true);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('click', this.onDocClick);
    // Also on pointerdown, as the room's panels close (a surface that keeps its clicks can't hold SYS open).
    this.offClickAway = onClickAway(
      (n) => this.sys.contains(n) || this.menu.el.contains(n),
      () => this.menu.close(),
    );
    document.addEventListener('focusin', this.onFocusIn);
    // The pixel font loading late changes every width in the bar.
    document.fonts?.addEventListener('loadingdone', this.onResize);
  }

  /** A screen's element (hidden until its setter shows it), with its Alt key as `data-key`. */
  private screen(cls: string, word: string, key: string | null, short = key ?? word): Screen {
    const el = span(cls);
    if (key) el.dataset.key = key;
    return { el, word, key, short };
  }

  /**
   * Takes the first step of FITS at which the bar fits (the last when none does). The room name may
   * be cut short only from the tight step on, so the type tightens first. Then the trace under it is drawn again.
   */
  private fit(): void {
    const cut = (n: HTMLElement) => n.scrollWidth > n.clientWidth;
    for (const [i, f] of FITS.entries()) {
      this.bar.dataset.fit = f;
      this.labels();
      const names = i >= FITS.indexOf('tight') || !cut(this.scene);
      if (names && this.bar.scrollWidth <= this.bar.clientWidth) break;
    }
    this.drawTrace();
  }

  /**
   * The bar's trace (the room HUD, docs/mockups/hud-frames.html keysTrace): one fine line under the words on whole
   * pixels: a ring at its left end, three slanted blocks after the place, a 45° jog down and back up before the
   * screens, a tick between words, a bright run under the open screen in its colour, bracket corners on SYS, dots
   * before it, a short second line under the place; and a leader from the texts notice while it shows. Rects are in
   * window pixels, so they're divided by #game's zoom.
   */
  private drawTrace(): void {
    this.trace.replaceChildren();
    const box = this.root.getBoundingClientRect();
    const k = this.root.offsetWidth ? box.width / this.root.offsetWidth : 0;
    if (!k) return;
    const at = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { l: Math.round((b.left - box.left) / k), r: Math.round((b.right - box.left) / k), t: Math.round((b.top - box.top) / k), b: Math.round((b.bottom - box.top) / k) };
    };
    const seen = (el: Element) => el.getClientRects().length > 0;
    const bar = at(this.bar);
    const y = bar.b + 5;
    const add = (tag: string, cls: string, attrs: Record<string, string | number>) => this.trace.append(svgEl(tag, { class: cls, ...attrs }));
    const leftEnd = Math.max(bar.l, ...[...this.left.children].filter(seen).map((c) => at(c).r));
    const words = [this.you, this.people, this.quest, this.crew, this.map, this.book].filter((s) => !s.el.hidden && seen(s.el));
    const sys = at(this.sys);
    const x0 = bar.l - 14;
    const bx = leftEnd + 14;
    const jogA = bx + 52;
    const jogB = (words[0] ? at(words[0].el).l : sys.l) - 24;
    const pts = jogB - jogA >= 24 ? [[x0 + 4, y], [jogA, y], [jogA + 6, y + 6], [jogB - 6, y + 6], [jogB, y], [sys.r, y]] : [[x0 + 4, y], [sys.r, y]];
    // The middle of the dropped stretch, on the stage, for what centres under it (the deduction board's AGAINST).
    const stage = this.root.closest<HTMLElement>('#game');
    // No drop drawn (a crowded bar): nothing to centre on, and no stale middle from another room (review).
    if (stage && jogB - jogA >= 24) stage.style.setProperty('--bar-drop-mid', `${Math.round(this.root.offsetLeft + (jogA + jogB) / 2)}px`);
    else stage?.style.removeProperty('--bar-drop-mid');
    add('polyline', 'kt', { points: pts.map((p) => p.join(',')).join(' ') });
    add('polyline', 'kt k2', { points: `${x0 + 12},${y + 4} ${x0 + 150},${y + 4} ${x0 + 156},${y + 10} ${x0 + 230},${y + 10}` });
    add('circle', 'kring', { cx: x0, cy: y, r: 4 });
    add('rect', 'kb', { x: x0 - 1, y: y - 1, width: 2, height: 2 });
    for (let i = 0; i < 3; i++) {
      const b = bx + i * 13;
      add('polygon', 'kb', { points: `${b},${y + 2} ${b + 4},${y - 3} ${b + 13},${y - 3} ${b + 9},${y + 2}` });
    }
    for (const [i, w] of words.entries()) {
      if (i === 0) continue;
      const x = Math.round((at(words[i - 1].el).r + at(w.el).l) / 2);
      add('rect', 'kb', { x, y: y - 3, width: 1, height: 6 });
    }
    add('rect', 'kb', { x: sys.l - 7, y: y - 3, width: 1, height: 6 });
    for (let i = 0; i < 3; i++) add('rect', 'kb', { x: sys.l - 34 + i * 6, y: y + 5, width: 2, height: 2 });
    add('rect', 'kb', { x: sys.r + 4, y: y - 2, width: 4, height: 4 });
    // An open screen's word, else JOBS while a job is on the table (the table's head line climbs into its run).
    const open = words.find((w) => w.el.classList.contains('open'));
    const lit = open ?? (this.jobUp ? words.find((w) => w === this.quest) : undefined);
    if (lit) {
      const w = at(lit.el);
      add('line', `kon${!open ? ' job' : lit === this.crew || lit === this.people ? ' crew' : lit === this.book ? ' book' : ''}`, { x1: w.l, y1: y, x2: w.r - 5, y2: y });
    }
    const on = this.menu.isOpen ? ' on' : '';
    add('polyline', `ksys${on}`, { points: `${sys.l},${sys.t + 8} ${sys.l},${sys.t} ${sys.l + 8},${sys.t}` });
    add('polyline', `ksys${on}`, { points: `${sys.r - 8},${sys.b} ${sys.r},${sys.b} ${sys.r},${sys.b - 8}` });
    if (this.textsShown() && seen(this.people.el) && seen(this.texts)) {
      // The notice's leader: from its top edge just past the cut, straight, then 45° up to the trace under PEOPLE.
      // Placed from layout offsets in its row, so a drop or fold animation's transform doesn't move it.
      const row = at(this.notices);
      const n = { l: row.l + this.texts.offsetLeft, t: row.t + this.texts.offsetTop };
      const w = at(this.people.el);
      const from = [n.l + 24, n.t] as const;
      const to = [Math.round(w.l + (w.r - w.l) * 0.4), y] as const;
      const d = Math.min(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
      const mid = [to[0] - Math.sign(to[0] - from[0]) * d, to[1] - Math.sign(to[1] - from[1]) * d];
      add('polyline', 'nlead', { points: `${from.join(',')} ${mid.join(',')} ${to.join(',')}` });
      add('circle', 'nlead-ring', { cx: to[0], cy: to[1], r: 4 });
      add('rect', 'nlead-dot', { x: from[0] - 2, y: from[1] - 2, width: 4, height: 4 });
    }
  }

  /** The screens' words with their Alt letter underlined, or (from the `short` step) just the letter; SAVE busy reads WAIT FOR <NAME>. */
  private labels(): void {
    const short = this.bar.dataset.fit === 'short';
    for (const s of [this.you, this.people, this.quest, this.crew, this.map, this.book]) {
      if (short) s.el.textContent = s.short;
      else if (s.key && s.word.includes(s.key)) {
        const at = s.word.indexOf(s.key);
        const u = document.createElement('u');
        u.textContent = s.word.slice(at, at + 1);
        s.el.replaceChildren(s.word.slice(0, at), u, s.word.slice(at + 1));
      } else s.el.textContent = s.word;
    }
  }

  /** Shows `‹` before the scene name; clicking it (or Alt+T) calls `onClick` (back to the title menu). */
  setBackLink(onClick: () => void): void {
    this.back.hidden = false;
    this.back.dataset.key = 'T';
    setTip(this.back, 'Title (Alt+T)');
    this.back.setAttribute('role', 'link');
    this.back.tabIndex = 0;
    this.back.onclick = onClick;
    this.back.onkeydown = (e) => {
      if (e.key === 'Enter') onClick();
    };
    this.fit();
  }

  /** Shows one of the bar's screens: a click or Enter closes SYS and calls `onClick`. */
  private button(s: Screen, onClick: () => void, title?: string): void {
    const b = s.el;
    b.hidden = false;
    if (title !== undefined) setTip(b, title);
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const run = () => {
      this.menu.close();
      onClick();
    };
    b.onclick = run;
    b.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation(); // not also a [CONTINUE] page turn
      run();
    };
    this.fit();
  }

  /** Shows PEOPLE (opens the PEOPLE screen: the roster, FILE and JOURNAL). */
  setPeople(onClick: () => void): void {
    this.button(this.people, onClick, 'People (Alt+P)');
  }

  /** Shows the MAP link (opens the city map). */
  setMapLink(onClick: () => void): void {
    this.button(this.map, onClick);
  }

  /** What SAVE does (the pause menu's row, Alt+S): opens the save prompt, unless a reply is streaming (see setSaveBusy). */
  setSave(onClick: () => void): void {
    this.onSave = onClick;
  }

  /** SAVE pressed (its button or the S key): opens the prompt only while nobody is replying. */
  pressSave(): void {
    if (this.saveBusy === null) this.onSave?.();
  }

  /** While `contactName`'s reply streams SAVE won't open (the pause menu reads WAIT FOR <NAME>); null restores it. */
  setSaveBusy(contactName: string | null): void {
    this.saveBusy = contactName;
  }

  /** Who SAVE waits on (her reply streaming), or null. */
  get saveBlockedBy(): string | null {
    return this.saveBusy;
  }

  /** The room has a pause menu: the SYS word opens it on SETTINGS (a pointer's way in; Esc is the keyboard's). */
  setPause(onClick: () => void): void {
    this.onPause = onClick;
  }

  /** SYS as the pause menu's SETTINGS page: opened inside `host`, it goes back to the HUD when it closes. */
  readonly settings = {
    open: (host: HTMLElement): void => {
      this.menu.el.classList.add('sys-paged');
      host.append(this.menu.el);
      this.menu.open();
    },
    close: (): void => this.menu.close(),
    /** Calls `cb` each time SYS opens or closes, however it did; returns the remover. */
    watch: (cb: (open: boolean) => void): (() => void) => {
      this.sysWatchers.add(cb);
      return () => this.sysWatchers.delete(cb);
    },
  };

  /** SYS opens where it stands (the dropdown, or nothing new if it's already up), its first row lit. */
  openSys(): void {
    this.menu.open();
  }

  /** The bar's place and clock as one line (`THE NOODLE STALL · SAT 05:30`), for the pause menu. */
  where(): string {
    return [this.scene.textContent, this.clock.textContent].filter((x) => x && x !== '——').join(' · ');
  }

  /** Lights the open screen's word (YOU, PEOPLE, QUEST, CREW or MAP) in SYS's blue; null: none open. */
  setOpen(screen: 'you' | 'people' | 'quest' | 'crew' | 'map' | null): void {
    for (const [s, k] of [[this.you, 'you'], [this.people, 'people'], [this.quest, 'quest'], [this.crew, 'crew'], [this.map, 'map']] as const) s.el.classList.toggle('open', k === screen);
    if (screen !== null) this.onScreen?.();
    this.drawTrace();
  }

  /** A job is on the table: JOBS takes the bright run (in the table's colour) while no screen is open over it. */
  setJobUp(on: boolean): void {
    if (this.jobUp === on) return;
    this.jobUp = on;
    this.quest.el.classList.toggle('job-up', on);
    this.drawTrace();
  }
  private jobUp = false;

  /** SYS is open, and has the keys. */
  get sysOpen(): boolean {
    return this.menu.isOpen;
  }

  /** Shows BOOK: opens or closes the lore drawer. */
  setBook(onClick: () => void): void {
    this.button(this.book, onClick, 'Book (Alt+B)');
  }

  /** The number beside BOOK (style.css draws it, so the word's letters can change under it); 0 shows none. */
  setBookCount(n: number): void {
    if (n > 0) this.book.el.dataset.count = String(n);
    else delete this.book.el.dataset.count;
  }

  /** Lights BOOK while the drawer is open. */
  setBookOpen(on: boolean): void {
    this.book.el.classList.toggle('open', on);
    this.drawTrace();
  }

  /** Hears a screen open (setOpen with one of the six): the drawer goes. */
  onScreenOpen(fn: () => void): void {
    this.onScreen = fn;
  }
  private onScreen: (() => void) | null = null;

  /** What the texts notice does: opens PEOPLE's TEXTS on its first sender. */
  setTextsNotice(onOpen: (contact: string) => void): void {
    this.onTextsNotice = onOpen;
  }
  private onTextsNotice: ((contact: string) => void) | null = null;
  private textsFrom: readonly { id: string; name: string }[] = [];
  private openNotice(): void {
    const first = this.textsFrom[0];
    if (first) this.onTextsNotice?.(first.id);
  }

  /** Shows CREW (opens the CREW screen). */
  setCrew(onClick: () => void): void {
    this.button(this.crew, onClick, 'Crew (Alt+K)');
  }

  /** The room's district has no power (blackouts phase 3 §4): `KARASU · POWER OUT`; hidden while it has. */
  setPower(here: { name: string } | null): void {
    this.power.hidden = this.powerSep.hidden = here === null;
    this.power.textContent = here ? `${here.name.toUpperCase()} · POWER OUT` : '';
    this.fit();
  }

  /**
   * Who has texted you unseen: `NIX · 1 TEXT`, `2 TEXTS · NIX, HICKS` on the notice, the count on PEOPLE; hidden when
   * nobody has. A new sender, or more of them, drops the notice in again for TEXTS_HOLD_MS.
   */
  setTexts(from: readonly { id: string; name: string }[]): void {
    const before = new Set(this.textsFrom.map((f) => f.id));
    const more = from.length > before.size || from.some((f) => !before.has(f.id));
    this.textsFrom = from;
    this.texts.hidden = from.length === 0;
    this.people.el.classList.toggle('texts-new', from.length > 0);
    if (from.length > 0) this.people.el.dataset.count = String(from.length);
    else delete this.people.el.dataset.count;
    const names = from.map((f) => f.name.toUpperCase()).join(', ');
    this.texts.textContent = from.length === 1 ? `${names} · 1 TEXT` : `${from.length} TEXTS · ${names}`;
    if (from.length === 0) {
      clearTimeout(this.textsFoldTimer);
      this.textsArrived = false;
    } else if (more) {
      clearTimeout(this.textsFoldTimer);
      this.textsArrived = true;
      this.texts.classList.remove('drop');
      void this.texts.offsetWidth; // restart the drop
      this.texts.classList.add('drop');
      this.textsFoldTimer = setTimeout(() => {
        this.textsArrived = false;
        this.syncTexts();
        this.people.el.classList.remove('ping');
        void this.people.el.offsetWidth;
        this.people.el.classList.add('ping');
      }, TEXTS_HOLD_MS);
    }
    // Same senders (a re-send of the list): the notice keeps its time.
    this.syncTexts();
    this.fit();
  }

  /** The texts notice is up: just landed, or the pointer (or focus) is on PEOPLE or on it. */
  private textsShown(): boolean {
    return !this.texts.hidden && (this.textsArrived || this.textsHover || this.textsFocus);
  }

  private hoverTexts(on: boolean): void {
    clearTimeout(this.textsLeaveTimer);
    if (on) {
      this.textsHover = true;
      this.syncTexts();
    } else
      this.textsLeaveTimer = setTimeout(() => {
        this.textsHover = false;
        this.syncTexts();
      }, TEXTS_LEAVE_MS);
  }

  private syncTexts(): void {
    this.texts.classList.toggle('folded', !this.textsShown());
    this.drawTrace();
  }

  /** A crew result you haven't seen: CREW carries a dot until the screen opens. */
  setCrewDot(on: boolean): void {
    this.crew.el.classList.toggle('crew-new', on);
  }

  /** Shows YOU (opens the character sheet). */
  setYou(onClick: () => void): void {
    this.button(this.you, onClick, 'You (Alt+Y)');
  }

  /** QUEST's click (the list of quests that can start here, quest lines spec §3); shown only by setQuestShown. */
  setQuest(onClick: () => void): void {
    this.button(this.quest, onClick, 'Jobs (Alt+Q)');
    this.setQuestShown(false);
  }

  /** QUEST shows only while there's a quest to start here (or one that can't go on). */
  setQuestShown(on: boolean): void {
    if (this.quest.el.hidden === !on) return;
    this.quest.el.hidden = !on;
    this.fit();
  }

  /** QUEST glows while a quest that can start here hasn't been looked at (the list opening puts it out). */
  setQuestNew(on: boolean): void {
    this.quest.el.classList.toggle('quest-new', on);
  }

  /** Her model, short, as SYS's MODEL row (it opens the MODEL menu). No `onClick`, or no label, hides the row. */
  setModel(label: string | null, onClick: (() => void) | null): void {
    this.onModel = onClick;
    this.menu.showModel(onClick && label !== null ? label : null);
    this.menu.setHint('model', label !== null ? () => her().changeModel : null);
  }

  /**
   * SYS's sound: a click on the SOUND row (or Enter there) mutes, ← → and the wheel step the volume
   * (+1 up, −1 down); on MUSIC and AMBIENT they step those levels.
   */
  setSoundControl(handlers: SoundControl): void {
    this.sound = handlers;
  }

  showSound(view: SoundView): void {
    this.menu.showSound(view);
    this.sysNote.textContent = view.kind === 'locked' ? '♪' : '';
    setTip(this.sys, view.kind === 'locked' ? 'Click anywhere for sound' : 'Sound, model and link');
    this.fit();
  }

  /** SYS → TIPS: on/off and SHOW AGAIN (main.ts hands them to Graft's tips). */
  setTipsControl(h: { onTips(on: boolean): void; onTipsAgain(): void }): void {
    this.tips = h;
  }

  showTips(on: boolean): void {
    this.menu.showTips(on);
  }

  /** SYS → WORLD MOVES (off-screen moves spec §6): what a pick does (main.ts saves it on the server). */
  setWorldMovesControl(onPick: (on: boolean) => void): void {
    this.worldMoves = onPick;
  }

  showWorldMoves(on: boolean): void {
    this.menu.showWorldMoves(on);
  }

  /** SYS → INTRO: what a pick does (main.ts saves it; the next start up reads it). */
  setIntroControl(onPick: (skip: boolean) => void): void {
    this.intro = onPick;
  }

  showIntro(skip: boolean): void {
    this.menu.showIntro(skip);
  }

  /** SYS → MIRROR: what a pick does (main.ts flips her figure and saves it). */
  setMirrorControl(onPick: (on: boolean) => void): void {
    this.mirror = onPick;
  }

  showMirror(on: boolean): void {
    this.menu.showMirror(on);
  }

  /** SYS → FRAME RATE: what a pick does (main.ts saves it and caps the renderer). */
  setFrameRateControl(onPick: (r: FrameRate) => void): void {
    this.frameRate = onPick;
  }

  showFrameRate(r: FrameRate): void {
    this.menu.showFrameRate(r);
  }

  /** SYS → RENDER SCALE, EFFECTS, BLUR, POST EFFECTS and FIGURE LIGHT: what a pick does (main.ts saves it and tells the renderer). */
  setGraphicsControl(o: { onRenderScale(s: RenderScale): void; onEffects(l: EffectsLevel): void; onBlur(on: boolean): void; onPost(on: boolean): void; onFigureLight(on: boolean): void }): void {
    this.renderScale = o.onRenderScale;
    this.effects = o.onEffects;
    this.blur = o.onBlur;
    this.post = o.onPost;
    this.figureLight = o.onFigureLight;
  }

  showFigureLight(on: boolean): void {
    this.menu.showFigureLight(on);
  }

  showBlur(on: boolean): void {
    this.menu.showBlur(on);
  }

  showPost(on: boolean): void {
    this.menu.showPost(on);
  }

  showRenderScale(s: RenderScale): void {
    this.menu.showRenderScale(s);
  }

  showEffects(l: EffectsLevel): void {
    this.menu.showEffects(l);
  }

  /** SYS → NARRATOR THINKING: what a pick does (main.ts saves it on the server). Shown with the MODEL row. */
  setThinkingControl(onPick: (t: NarratorThinking) => void): void {
    this.thinking = onPick;
  }

  showThinking(t: NarratorThinking): void {
    this.menu.showThinking(t);
  }

  /** SYS → REPLY LENGTH and REPLY THINKING: what a pick does (main.ts saves it on the server). Shown with the MODEL row. */
  setReplyPrefsControl(o: { onReplyLength(l: ReplyLength): void; onChatThinking(t: ChatThinking): void }): void {
    this.replyPrefs = o;
  }

  showReplyPrefs(p: { length: ReplyLength; thinking: ChatThinking }): void {
    this.menu.showReplyLength(p.length);
    this.menu.showChatThinking(p.thinking);
  }

  /** Stops the clock and lets go of the window. */
  dispose(): void {
    clearInterval(this.timer);
    clearTimeout(this.textsFoldTimer);
    clearTimeout(this.textsLeaveTimer);
    this.menu.dispose();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onAltDown, true);
    window.removeEventListener('keyup', this.onAltUp, true);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('click', this.onDocClick);
    this.offClickAway();
    document.removeEventListener('focusin', this.onFocusIn);
    document.fonts?.removeEventListener('loadingdone', this.onResize);
  }

  setScene(name: string): void {
    this.scene.textContent = name.toUpperCase();
    setTip(this.scene, name.toUpperCase()); // the bar may cut it short
    this.fit();
  }

  setAtmosphere(a: Atmosphere): void {
    this.weather.textContent =
      a.weather === 'none' ? 'CLEAR' : `${a.weather.toUpperCase()} ${Math.round(a.weatherLevel * 100)}%`;
    this.fit();
  }

  /** `socket-down` is the browser↔server socket dropping; to the user it is still a lost link. SYS turns red. */
  setLink(s: LinkStatus | 'socket-down'): void {
    const status: LinkStatus = s === 'socket-down' ? 'down' : s;
    this.link.dataset.status = status;
    this.sysLabel.textContent = SYS_LABEL[status];
    this.sys.classList.toggle('down', status !== 'ok');
    this.menu.showLink(status);
    this.fit();
  }

  /** A persistent warning, pinned under the bar (e.g. the renderer failed); `null` hides it. */
  setNotice(text: string | null): void {
    this.notice.hidden = text === null;
    this.notice.textContent = text ?? '';
    this.fit();
  }

  /** The playthrough's story clock (minutes since Day 1 00:00): it stands in for local time; null puts local time back. */
  setClock(m: number | null): void {
    this.story = m;
    this.tick();
    this.fit();
  }

  private tick(): void {
    this.clock.textContent = this.story !== null ? formatClock(this.story).toUpperCase() : hhmm(new Date());
  }
}
