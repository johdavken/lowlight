/**
 * The subtitle box's settings (docs/mockups/box-settings.html, ABOVE): a small key on the box's top-right edge opens a
 * glass panel rising over the box's right end, in the box's colour. TEXT (speed), TEXT SIZE, FONT and CHAT KEYS moved
 * here from SYS; BOX COLOUR, BOX GLASS, AUTO PAGE, SPEAKER LINE and TEXT EFFECT are new (box-prefs.ts). While it's open
 * its keys come first: ↑ ↓ pick a row, ← → change it (Enter flips a two-way row), Esc or a click elsewhere closes.
 * Its rows only report a pick; main.ts saves and applies it and shows it back. Text goes in through textContent only.
 */
import { panelCue } from './panel-sound';
import { AUTO_PAGES, BOX_COLOURS, BOX_DEFAULTS, BOX_SWATCHES, clampGlass, TEXT_EFFECTS, type BoxPrefs, type BoxSwatch } from './box-prefs';
import { CHAT_FONT_FAMILY, CHAT_FONT_LABEL, type ChatFont } from './chat-font';
import type { ChatKeys } from './chat-keys';
import type { TextSpeed } from './typing';
import { setTip } from './hover-tag';

export type BoxRow = 'text' | 'size' | 'font' | 'auto' | 'effect' | 'colour' | 'glass' | 'line' | 'keys';
/** The LINE section's rows: the chat box's own look and keys. */
const LINE_ROWS: readonly BoxRow[] = ['colour', 'glass', 'line', 'keys'];

const SPEEDS: TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];
const KEYS: ChatKeys[] = ['glyphs', 'labels'];
const FOOT = '↑ ↓ MOVE // ← → CHANGE // ESC CLOSE';
/** Plain words for a row that needs them, in the foot while it's picked or under the pointer. */
const HINTS: Partial<Record<BoxRow, string>> = {
  auto: 'A long reply turns its own page once the page has typed out.',
  effect: 'DECODE: her words come in out of glyph noise as she types.',
  colour: 'SPEAKER follows whoever talks. A colour holds the box; names keep their own.',
};
/** TEXT EFFECT's tip at INSTANT, where DECODE is struck out (playtest). */
const DECODE_AT_INSTANT = 'DECODE needs a typing speed: at INSTANT her words are all there at once.';
/** Each panel's rows get their own ids (aria-activedescendant names the focused one). */
let panels = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** The key as a trace node (playtest 2026-11-17, red trace): a ring the line runs into, then the word. */
const GLYPH = '<i class="bs-ring" aria-hidden="true"></i><span class="bs-word">TEXT</span>';

export class BoxSettings {
  readonly key = el('button', 'bs-key');
  readonly panel = el('div', 'bs-panel');
  private readonly rows = {} as Record<BoxRow, HTMLElement>;
  private readonly order: BoxRow[] = [];
  /** The LINE section's head: it and its rows step out on the crew rules' board, which has no chat box (textOnly). */
  private readonly lineSec = el('div', 'bs-sec', 'LINE');
  /** The foot: a row's tip in its own two-line space, the keys under it, so nothing moves as the tip changes. */
  private readonly foot = el('div', 'bs-foot');
  private readonly tip = el('span', 'bs-tip');
  private focus: BoxRow = 'text';
  private hovered: BoxRow | null = null;
  private readonly idBase = `bs-${++panels}`;
  private prefs: BoxPrefs = { ...BOX_DEFAULTS };
  private chatKeys: ChatKeys = 'glyphs';
  private speedNow: TextSpeed = 'normal';
  private speed: { onPick(s: TextSpeed): void; onStep(d: number): void } | null = null;
  private sizeStep: ((d: number) => void) | null = null;
  private fontStep: ((d: number) => void) | null = null;
  private keysPick: ((k: ChatKeys) => void) | null = null;
  private prefsPick: ((p: BoxPrefs) => void) | null = null;
  private readonly speeds = el('span', 'bs-value bs-words');
  private readonly sizeValue = el('span', 'bs-num');
  private readonly fontValue = el('span', 'bs-num bs-font');
  private readonly keys = el('span', 'bs-value bs-words');
  private readonly auto = el('span', 'bs-value bs-words');
  private readonly effect = el('span', 'bs-value bs-words');
  private readonly colours = el('span', 'bs-value bs-swatches');
  private readonly glassFill = el('i', '');
  private readonly glassValue = el('span', 'bs-pct');
  private readonly line = el('span', 'bs-value bs-words');
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  /** A pointerdown anywhere else closes it, the bar's words and SYS too: a screen opening over it takes the keys. */
  private readonly onDown = (e: Event) => {
    const t = e.target;
    if (t instanceof Node && (this.panel.contains(t) || this.key.contains(t))) return;
    this.close();
  };
  /** Watches the box while open: gone (the archive, no line, a walk-out), the panel closes with it. */
  private readonly watch = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => this.hiddenWithBox() && this.close()) : null;

  constructor(root: HTMLElement) {
    this.key.type = 'button';
    setTip(this.key, 'BOX SETTINGS');
    this.key.setAttribute('aria-label', 'Box settings');
    this.key.setAttribute('aria-haspopup', 'menu');
    this.key.setAttribute('aria-expanded', 'false');
    this.key.innerHTML = GLYPH;
    // A press doesn't take focus from the prompt (Tab still reaches it).
    this.key.addEventListener('mousedown', (e) => e.preventDefault());
    this.key.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.panel.hidden = true;
    this.panel.setAttribute('role', 'menu');
    this.panel.setAttribute('aria-label', 'Chat settings');
    const head = el('div', 'bs-head');
    head.append(el('span', 'bs-plate', 'CHAT'));

    this.words(this.speeds, SPEEDS, (s) => this.speed?.onPick(s), 'speed');
    const size = this.stepper(this.sizeValue, (d) => this.sizeStep?.(d));
    const font = this.stepper(this.fontValue, (d) => this.fontStep?.(d));
    this.words(this.keys, KEYS, (k) => this.keysPick?.(k), 'keys');
    this.words(this.auto, AUTO_PAGES, (a) => this.setPrefs({ autoPage: a }), 'auto');
    this.words(this.effect, TEXT_EFFECTS, (t) => this.setPrefs({ effect: t }), 'effect');
    this.words(this.line, ['on', 'off'], (v) => this.setPrefs({ line: v === 'on' }), 'line');
    for (const c of BOX_COLOURS) {
      const b = el('i', c === 'speaker' ? 'bs-speaker' : 'bs-swatch', c === 'speaker' ? 'SPEAKER' : undefined);
      b.dataset.colour = c;
      if (c !== 'speaker') {
        b.style.setProperty('--s', BOX_SWATCHES[c as BoxSwatch]);
        setTip(b, c);
      }
      b.addEventListener('click', () => this.setPrefs({ colour: c }));
      this.colours.append(b);
    }
    const glass = el('span', 'bs-value bs-glass');
    const track = el('span', 'bs-track');
    track.append(this.glassFill);
    track.addEventListener('click', (e) => {
      const r = track.getBoundingClientRect();
      if (r.width > 0) this.setPrefs({ glass: clampGlass(((e.clientX - r.left) / r.width) * 100) });
    });
    glass.append(track, this.glassValue);

    const body = el('div', 'bs-rows');
    body.append(
      el('div', 'bs-sec', 'TEXT'),
      this.row('text', 'TEXT', this.speeds),
      this.row('size', 'TEXT SIZE', size),
      this.row('font', 'FONT', font),
      this.row('auto', 'AUTO PAGE', this.auto),
      this.row('effect', 'TEXT EFFECT', this.effect),
      this.lineSec,
      this.row('colour', 'COLOUR', this.colours),
      this.row('glass', 'SHADE', glass),
      this.row('line', 'SPEAKER LINE', this.line),
      this.row('keys', 'CHAT KEYS', this.keys),
    );
    // Clicks inside stay inside: nothing behind the panel takes them.
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    this.foot.append(this.tip, el('span', 'bs-nav', FOOT));
    this.panel.append(head, body, this.foot);
    root.append(this.key, this.panel);
    this.showPrefs(this.prefs);
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    panelCue('sys');
    this.showScope();
    this.panel.hidden = false;
    this.key.classList.add('on');
    this.key.setAttribute('aria-expanded', 'true');
    // It opens on its first row, as SYS does.
    this.setFocus(this.order[0]);
    // Its keys come first while it's open, and only then.
    window.addEventListener('keydown', this.onKey, true);
    document.addEventListener('pointerdown', this.onDown, true);
    this.fitTip();
    const root = this.panel.closest('.feed-root');
    if (root) this.watch?.observe(root, { attributes: true, attributeFilter: ['class'] });
    this.watch?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * The tip's space, as tall as the tallest tip at the scale the stage is drawn at now (playtest: a fixed two lines
   * clipped some at other window sizes), so it never clips and never moves the panel as the tip changes.
   */
  private fitTip(): void {
    const keep = this.tip.textContent;
    this.tip.style.height = 'auto';
    let tallest = 0;
    for (const t of [...Object.values(HINTS), DECODE_AT_INSTANT]) {
      this.tip.textContent = t;
      tallest = Math.max(tallest, this.tip.scrollHeight);
    }
    this.tip.textContent = keep;
    this.tip.style.height = tallest > 0 ? `${tallest}px` : '';
  }

  /** The box isn't showing (the archive, no line in it, a walk-out): neither is the panel. At a table the key and the
   * panel stand on the JOB column instead (style.css; playtest 2026-11-11), so an empty box keeps them. */
  private hiddenWithBox(): boolean {
    const root = this.panel.closest('.feed-root');
    const atTable = !!root?.parentElement?.querySelector(':scope > .tb.hud:not([hidden]):not(.phone)');
    return !!root?.matches('.expanded') || (!atTable && !!root?.matches('.box-empty')) || document.documentElement.classList.contains('walking-out');
  }

  close(): void {
    if (!this.isOpen) return;
    this.panel.hidden = true;
    this.key.classList.remove('on');
    this.key.setAttribute('aria-expanded', 'false');
    window.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('pointerdown', this.onDown, true);
    this.watch?.disconnect();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** TEXT: a word calls `onPick`, ← → `onStep` (+1 faster, −1 slower). */
  setTextSpeedControl(handlers: { onPick(s: TextSpeed): void; onStep(d: number): void }): void {
    this.speed = handlers;
  }

  showTextSpeed(s: TextSpeed): void {
    this.speedNow = s;
    this.light(this.speeds, 'speed', s);
    // DECODE decodes as she types: at INSTANT there's no typing, so it's struck out (still kept for a typing speed).
    this.effect.querySelector('[data-effect="decode"]')?.classList.toggle('struck', s === 'instant');
    this.showHint();
  }

  /** TEXT SIZE: ← → and ‹ › call `onStep` (+1 bigger, −1 smaller). */
  setTextSizeControl(onStep: (d: number) => void): void {
    this.sizeStep = onStep;
  }

  showTextSize(percent: number): void {
    this.sizeValue.textContent = `${percent}%`;
  }

  /** FONT: ← → and ‹ › call `onStep` (+1 the next font, −1 the one before). */
  setChatFontControl(onStep: (d: number) => void): void {
    this.fontStep = onStep;
  }

  /** The font's name, shown in that font. */
  showChatFont(f: ChatFont): void {
    this.fontValue.textContent = CHAT_FONT_LABEL[f];
    this.fontValue.style.fontFamily = CHAT_FONT_FAMILY[f];
  }

  /** CHAT KEYS: what a pick does (main.ts saves and applies it). */
  setChatKeysControl(onPick: (k: ChatKeys) => void): void {
    this.keysPick = onPick;
  }

  showChatKeys(k: ChatKeys): void {
    this.chatKeys = k;
    this.light(this.keys, 'keys', k);
  }

  /** BOX COLOUR, BOX GLASS, AUTO PAGE, SPEAKER LINE, TEXT EFFECT: a change calls `onPick` with the whole set. */
  setPrefsControl(onPick: (p: BoxPrefs) => void): void {
    this.prefsPick = onPick;
  }

  showPrefs(p: BoxPrefs): void {
    this.prefs = { ...p };
    this.light(this.auto, 'auto', p.autoPage);
    this.light(this.effect, 'effect', p.effect);
    this.light(this.line, 'line', p.line ? 'on' : 'off');
    for (const b of this.colours.children) b.classList.toggle('on', (b as HTMLElement).dataset.colour === p.colour);
    this.glassFill.style.width = `${p.glass}%`;
    this.glassValue.textContent = `${p.glass}%`;
  }

  dispose(): void {
    this.close();
    this.key.remove();
    this.panel.remove();
  }

  private setPrefs(change: Partial<BoxPrefs>): void {
    this.prefsPick?.({ ...this.prefs, ...change });
  }

  /** A row of words, each a pick; the one in use is lit by `light`. */
  private words<T extends string>(into: HTMLElement, values: readonly T[], pick: (v: T) => void, data: string): void {
    for (const v of values) {
      const w = el('i', '', v.toUpperCase());
      w.dataset[data] = v;
      w.addEventListener('click', () => {
        panelCue('setting');
        pick(v);
      });
      into.append(w);
    }
  }

  private light(into: HTMLElement, data: string, v: string): void {
    for (const w of into.children) w.classList.toggle('on', (w as HTMLElement).dataset[data] === v);
  }

  /** ‹ value ›: the arrows step it on a click, as ← → do. */
  private stepper(value: HTMLElement, step: (d: number) => void): HTMLElement {
    const box = el('span', 'bs-value bs-stepper');
    for (const d of [-1, 1]) {
      const b = el('i', 'bs-step', d < 0 ? '‹' : '›');
      b.dataset.step = String(d);
      b.addEventListener('click', () => {
        panelCue('setting');
        step(d);
      });
      box.append(b);
      if (d < 0) box.append(value);
    }
    return box;
  }

  private row(id: BoxRow, label: string, value: HTMLElement): HTMLElement {
    const r = el('div', 'bs-row');
    r.dataset.row = id;
    r.id = `${this.idBase}-${id}`;
    r.setAttribute('role', 'menuitem');
    r.append(el('span', 'bs-label', label), value);
    // A click picks the row too, so the keys carry on from where the pointer was.
    r.addEventListener('click', () => this.setFocus(id));
    r.addEventListener('mouseenter', () => {
      this.hovered = id;
      this.showHint();
    });
    r.addEventListener('mouseleave', () => {
      if (this.hovered === id) this.hovered = null;
      this.showHint();
    });
    this.rows[id] = r;
    this.order.push(id);
    return r;
  }

  /**
   * Only what applies (playtest): on the crew rules' board the chat box is hidden, so the LINE section (the box's colour,
   * shade, speaker line and keys) steps out and the panel lists the TEXT rows alone. Read as it opens.
   */
  get textOnly(): boolean {
    return this.panel.closest('.crew-board') !== null;
  }

  private showScope(): void {
    const only = this.textOnly;
    this.panel.classList.toggle('bs-text-only', only);
    this.lineSec.hidden = only;
    for (const id of LINE_ROWS) this.rows[id].hidden = only;
  }

  /** The rows ↑ ↓ step through: the ones shown. */
  private shownRows(): BoxRow[] {
    return this.order.filter((id) => !this.rows[id].hidden);
  }

  private setFocus(id: BoxRow): void {
    this.focus = id;
    for (const [k, r] of Object.entries(this.rows)) r.classList.toggle('on', k === id);
    this.panel.setAttribute('aria-activedescendant', this.rows[id].id);
    this.showHint();
  }

  private showHint(): void {
    const of = (r: BoxRow | null) => (r === 'effect' && this.speedNow === 'instant' ? DECODE_AT_INSTANT : r ? HINTS[r] : undefined);
    const hint = of(this.hovered) ?? of(this.focus);
    this.tip.textContent = hint ?? '';
    this.foot.classList.toggle('hint', !!hint);
  }

  /** ← → (d ±1) or Enter (d 0) on the picked row. */
  private change(d: number): void {
    const p = this.prefs;
    const cycle = <T>(list: readonly T[], v: T) => list[(list.indexOf(v) + d + list.length) % list.length];
    switch (this.focus) {
      case 'text':
        if (d !== 0) this.speed?.onStep(d);
        break;
      case 'size':
        if (d !== 0) this.sizeStep?.(d);
        break;
      case 'font':
        if (d !== 0) this.fontStep?.(d);
        break;
      case 'auto':
        if (d !== 0) this.setPrefs({ autoPage: cycle(AUTO_PAGES, p.autoPage) });
        break;
      case 'colour':
        if (d !== 0) this.setPrefs({ colour: cycle(BOX_COLOURS, p.colour) });
        break;
      case 'glass':
        if (d !== 0) this.setPrefs({ glass: clampGlass(p.glass + d * 10) });
        break;
      // Two-way rows: either arrow or Enter picks the other.
      case 'effect':
        this.setPrefs({ effect: p.effect === 'type' ? 'decode' : 'type' });
        break;
      case 'line':
        this.setPrefs({ line: !p.line });
        break;
      case 'keys':
        this.keysPick?.(this.chatKeys === 'glyphs' ? 'labels' : 'glyphs');
        break;
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    // Hidden with the box (the archive, no line in it, a walk-out): it lets the keys go.
    if (this.hiddenWithBox()) return this.close();
    // An Alt chord opens a screen: the panel gets out of its way.
    if (e.altKey) return this.close();
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(k)) return;
    // A line half typed in the prompt keeps its Enter and its caret keys; Esc still closes.
    const t = e.target;
    if (k !== 'Escape' && (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) && t.value !== '') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'Escape') return this.close();
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const rows = this.shownRows();
      const at = rows.indexOf(this.focus);
      this.setFocus(rows[Math.max(0, Math.min(rows.length - 1, at + (k === 'ArrowDown' ? 1 : -1)))]);
      return;
    }
    if (k === 'ArrowRight' || k === 'ArrowLeft') panelCue('setting');
    this.change(k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0);
  }
}
