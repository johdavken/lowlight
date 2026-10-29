import { her } from '../room/her-copy';
import { formatClock } from '../../../shared/clock';
import type { Atmosphere, LinkStatus, NarratorThinking } from '../../../shared/types';
import { hhmm } from './clock';
import { onClickAway } from './click-away';
import { SysMenu } from './sys-menu';
import type { TextSpeed } from './typing';
import type { ChatKeys } from './chat-keys';
import type { ChatFont } from './chat-font';

const CLOCK_MS = 30_000;

/** The SYS button's label: SYS while the link holds, else what went wrong. */
const SYS_LABEL: Record<LinkStatus, string> = { ok: 'SYS', down: 'LINK DOWN', lost: 'SIGNAL LOST' };

function span(cls: string, text = ''): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/** What SYS shows of the sound: hidden, waiting for a first tap (♪), or the volume. */
export type SoundView = { kind: 'hidden' } | { kind: 'locked' } | { kind: 'on'; volume: number; muted: boolean; music: number; ambient: number };

/**
 * The bar's steps when it runs short of room: full size, then snug and tight type, then (still
 * tight) without the weather, then without the clock too, then the screens cut to their letters
 * (DICE to ◆), and last DICE gone. The room name is only ever cut short ("…"), never dropped.
 */
const FITS = ['full', 'snug', 'tight', 'no-weather', 'no-clock', 'short'] as const;

/** A screen on the bar: its word, and its Alt key when it has one (the first letter, underlined). */
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
 * rest of the time the words are plain. SYS holds the volume, text speed, her model and the link (sys-menu.ts); its button turns red
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
  /** PEOPLE (contacts, leads and the journal, as tabs of one screen). */
  private readonly people = this.screen('hud-people', 'PEOPLE', 'P');
  private readonly quest = this.screen('hud-quest', 'QUEST', 'Q');
  /** CREW (crew spec §4): the roster, tonight's errands and hires. */
  private readonly crew = this.screen('hud-crew', 'CREW', 'K');
  private readonly map = this.screen('hud-map', 'MAP', null, 'MAP');
  private onSave: (() => void) | null = null;
  /** Whose reply is streaming (SAVE then reads WAIT FOR <NAME> and doesn't open), or null. */
  private saveBusy: string | null = null;
  private readonly sys = span('hud-sys');
  /** Texts you haven't seen on the deck (promised texts spec §6): `NIX · 1 TEXT`, opens the deck. */
  private readonly texts = span('hud-texts');
  /** The link light: `.link[data-status]`, as the bar's link status always was. */
  private readonly link = span('link');
  private readonly sysNote = span('sys-note');
  private readonly sysLabel = span('sys-name', 'SYS');
  private readonly sysCaret = span('sys-caret', '▾');
  private readonly menu: SysMenu;
  private sound: { onToggle(): void; onWheel(steps: number): void; onMusic(steps: number): void; onAmbient(steps: number): void } | null = null;
  private speed: { onPick(s: TextSpeed): void; onStep(d: number): void } | null = null;
  private sizeStep: ((d: number) => void) | null = null;
  private fontStep: ((d: number) => void) | null = null;
  private chatKeys: ((k: ChatKeys) => void) | null = null;
  private onModel: (() => void) | null = null;
  private thinking: ((t: NarratorThinking) => void) | null = null;
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
    root.classList.add('hud-root');
    const band = document.createElement('div');
    band.className = 'hud-band';
    root.append(band);
    for (const pos of ['tl', 'tr', 'bl', 'br']) {
      const c = document.createElement('div');
      c.className = `corner ${pos}`;
      root.append(c);
    }

    const left = document.createElement('div');
    left.className = 'hud hud-left';
    this.back.hidden = true;
    this.power.hidden = true;
    this.powerSep.hidden = true;
    left.append(this.back, this.scene, span('sep sep-clock', '·'), this.clock, span('sep sep-weather', '·'), this.weather, this.powerSep, this.power);

    this.menu = new SysMenu({
      onVolume: (d) => this.sound?.onWheel(d),
      onMute: () => this.sound?.onToggle(),
      onMusic: (d) => this.sound?.onMusic(d),
      onAmbient: (d) => this.sound?.onAmbient(d),
      onTextSpeed: (s) => this.speed?.onPick(s),
      onTextStep: (d) => this.speed?.onStep(d),
      onSizeStep: (d) => this.sizeStep?.(d),
      onFontStep: (d) => this.fontStep?.(d),
      onChatKeys: (k) => this.chatKeys?.(k),
      onModel: () => this.onModel?.(),
      onThinking: (t) => this.thinking?.(t),
      onSave: () => this.pressSave(),
      onOpenChange: (open) => this.sys.setAttribute('aria-expanded', String(open)),
    });
    this.sys.setAttribute('role', 'button');
    this.sys.setAttribute('aria-haspopup', 'menu');
    this.sys.setAttribute('aria-expanded', 'false');
    this.sys.tabIndex = 0;
    this.sys.append(this.link, this.sysNote, this.sysLabel, this.sysCaret);
    // The click goes on to the document (main.ts closes the MODEL menu there); onDocClick lets SYS's own clicks be.
    this.sys.onclick = () => this.menu.toggle();
    // A mouse press doesn't take keyboard focus from the prompt (Tab still reaches SYS).
    this.sys.addEventListener('mousedown', (e) => e.preventDefault());
    this.sys.onkeydown = (e) => {
      if ((e.key !== 'Enter' && e.key !== ' ') || this.menu.isOpen) return;
      e.preventDefault();
      e.stopPropagation();
      this.menu.open();
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
    this.texts.title = 'Open your deck';
    this.texts.addEventListener('click', () => window.open('/deck', '_blank'));
    this.texts.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.open('/deck', '_blank');
    });
    right.append(this.texts, this.notice, ...[this.you, this.people, this.quest, this.crew, this.map].map((s) => s.el), this.sys);

    this.bar.className = 'hud-bar';
    this.bar.dataset.fit = 'full';
    this.bar.append(left, right);
    root.append(this.bar, this.menu.el);
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
   * be cut short only from the tight step on, so the type tightens first.
   */
  private fit(): void {
    const cut = (n: HTMLElement) => n.scrollWidth > n.clientWidth;
    for (const [i, f] of FITS.entries()) {
      this.bar.dataset.fit = f;
      this.labels();
      const names = i >= FITS.indexOf('tight') || !cut(this.scene);
      if (names && this.bar.scrollWidth <= this.bar.clientWidth) return;
    }
  }

  /** The screens' words with their Alt letter underlined, or (from the `short` step) just the letter; SAVE busy reads WAIT FOR <NAME>. */
  private labels(): void {
    const short = this.bar.dataset.fit === 'short';
    for (const s of [this.you, this.people, this.quest, this.crew, this.map]) {
      if (short) s.el.textContent = s.short;
      else if (s.key) {
        const u = document.createElement('u');
        u.textContent = s.word.slice(0, 1);
        s.el.replaceChildren(u, s.word.slice(1));
      } else s.el.textContent = s.word;
    }
  }

  /** Shows `‹` before the scene name; clicking it (or Alt+T) calls `onClick` (back to the title menu). */
  setBackLink(onClick: () => void): void {
    this.back.hidden = false;
    this.back.dataset.key = 'T';
    this.back.title = 'Title (Alt+T)';
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
    if (title !== undefined) b.title = title;
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

  /** Shows PEOPLE (opens the PEOPLE screen: CONTACTS, LEADS and JOURNAL as tabs). */
  setPeople(onClick: () => void): void {
    this.button(this.people, onClick, 'People (Alt+P)');
  }

  /** Shows the MAP link (opens the city map). */
  setMapLink(onClick: () => void): void {
    this.button(this.map, onClick);
  }

  /** Shows SAVE (opens the save prompt), unless a reply is streaming (see setSaveBusy). */
  setSave(onClick: () => void): void {
    this.onSave = onClick;
    // SAVE lives in SYS until there's an Esc menu; Alt+S still saves from anywhere.
    this.menu.showSave(true);
  }

  /** SAVE pressed (its button or the S key): opens the prompt only while nobody is replying. */
  pressSave(): void {
    if (this.saveBusy === null) this.onSave?.();
  }

  /** While `contactName`'s reply streams SAVE reads WAIT FOR <NAME> and won't open; null restores it. */
  setSaveBusy(contactName: string | null): void {
    if (contactName === this.saveBusy) return;
    this.saveBusy = contactName;
    this.menu.showSaveBusy(contactName);
  }

  /** Lights the open screen's word (YOU, PEOPLE, CREW or MAP) in SYS's blue; null: none open. */
  setOpen(screen: 'you' | 'people' | 'crew' | 'map' | null): void {
    for (const [s, k] of [[this.you, 'you'], [this.people, 'people'], [this.crew, 'crew'], [this.map, 'map']] as const) s.el.classList.toggle('open', k === screen);
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

  /** Who has texted you unseen: `NIX · 1 TEXT`, `2 TEXTS · NIX, HICKS`; hidden when nobody has. */
  setTexts(from: readonly { id: string; name: string }[]): void {
    this.texts.hidden = from.length === 0;
    const names = from.map((f) => f.name.toUpperCase()).join(', ');
    this.texts.textContent = from.length === 1 ? `${names} · 1 TEXT` : `${from.length} TEXTS · ${names}`;
    this.fit();
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
    this.button(this.quest, onClick, 'Quests here (Alt+Q)');
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
    const row = this.menu.el.querySelector<HTMLElement>('.sys-row[data-row="model"]');
    if (row) row.title = label !== null ? her().changeModel(label) : '';
  }

  /**
   * SYS's sound: a click on the SOUND row (or Enter there) mutes, ← → and the wheel step the volume
   * (+1 up, −1 down); on MUSIC and AMBIENT they step those levels.
   */
  setSoundControl(handlers: { onToggle(): void; onWheel(steps: number): void; onMusic(steps: number): void; onAmbient(steps: number): void }): void {
    this.sound = handlers;
  }

  showSound(view: SoundView): void {
    this.menu.showSound(view);
    this.sysNote.textContent = view.kind === 'locked' ? '♪' : '';
    this.sys.title = view.kind === 'locked' ? 'Click anywhere for sound' : 'Sound, text speed, model and link';
    this.fit();
  }

  /** SYS's text speed: a speed word calls `onPick`, ← → and the wheel `onStep` (+1 faster, −1 slower). */
  setTextSpeedControl(handlers: { onPick(s: TextSpeed): void; onStep(d: number): void }): void {
    this.speed = handlers;
  }

  showTextSpeed(speed: TextSpeed): void {
    this.menu.showTextSpeed(speed);
  }

  /** SYS's TEXT SIZE: ← → and the wheel call `onStep` (+1 bigger, −1 smaller). */
  setTextSizeControl(onStep: (d: number) => void): void {
    this.sizeStep = onStep;
  }

  /** SYS's FONT: ← →, ‹ › and the wheel call `onStep` (+1 the next font, −1 the one before). */
  setChatFontControl(onStep: (d: number) => void): void {
    this.fontStep = onStep;
  }

  showChatFont(f: ChatFont): void {
    this.menu.showChatFont(f);
  }

  /** SYS → CHAT KEYS: what a pick does (main.ts saves and applies it). */
  setChatKeysControl(onPick: (k: ChatKeys) => void): void {
    this.chatKeys = onPick;
  }

  showChatKeys(k: ChatKeys): void {
    this.menu.showChatKeys(k);
  }

  /** SYS → NARRATOR THINKING: what a pick does (main.ts saves it on the server). Shown with the MODEL row. */
  setThinkingControl(onPick: (t: NarratorThinking) => void): void {
    this.thinking = onPick;
  }

  showThinking(t: NarratorThinking): void {
    this.menu.showThinking(t);
  }

  showTextSize(percent: number): void {
    this.menu.showTextSize(percent);
  }

  /** Stops the clock and lets go of the window. */
  dispose(): void {
    clearInterval(this.timer);
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
    this.scene.title = name.toUpperCase(); // the bar may cut it short
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

  /** A persistent warning shown before the screens (e.g. the renderer failed); `null` hides it. */
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
