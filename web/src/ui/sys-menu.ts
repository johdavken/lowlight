/**
 * The SYS dropdown under the HUD's SYS button (spec 2026-10-15): volume, music, ambient, text speed,
 * text size, font, chat keys, her model, narrator thinking and the link, one row each. While it's open its keys are taken from the chat prompt: ↑ ↓ pick a row,
 * ← → (or the wheel) change it, Enter mutes or opens the MODEL menu, Esc closes. Text goes in
 * through textContent only.
 */
import { NARRATOR_THINKING, type LinkStatus, type NarratorThinking } from '../../../shared/types';
import type { SoundView } from './hud';
import type { TextSpeed } from './typing';
import type { ChatKeys } from './chat-keys';
import { CHAT_FONT_FAMILY, CHAT_FONT_LABEL, type ChatFont } from './chat-font';

export type SysRow = 'save' | 'sound' | 'music' | 'ambient' | 'text' | 'size' | 'font' | 'keys' | 'model' | 'think' | 'link';

export interface SysMenuHandlers {
  /** SAVE (opens the save card), until there's an Esc menu; SYS closes first. */
  onSave?(): void;
  /** +1 louder, −1 quieter. */
  onVolume(steps: number): void;
  onMute(): void;
  /** +1 louder, −1 quieter: the songs alone. */
  onMusic(steps: number): void;
  /** +1 louder, −1 quieter: the room's own sound (weather, room tone, lights). */
  onAmbient(steps: number): void;
  /** A click on a speed word. */
  onTextSpeed(s: TextSpeed): void;
  /** +1 faster, −1 slower. */
  onTextStep(d: number): void;
  /** +1 bigger, −1 smaller (TEXT SIZE). */
  onSizeStep(d: number): void;
  /** +1 the next font, −1 the one before (FONT). */
  onFontStep(d: number): void;
  /** CHAT KEYS: the chat box's stacks as glyphs or words. */
  onChatKeys(k: ChatKeys): void;
  /** Opens the MODEL menu (SYS has closed by then). */
  onModel(): void;
  /** NARRATOR THINKING: a word picked (a click, or ← → stepping to the next one). */
  onThinking(t: NarratorThinking): void;
  /** It opened (true) or closed (false), however it did. */
  onOpenChange?(open: boolean): void;
}

const SPEEDS: TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];
const KEYS: ChatKeys[] = ['glyphs', 'labels'];
const LINK_VALUE: Record<LinkStatus, string> = { ok: 'OK', down: 'DOWN', lost: 'SIGNAL LOST' };
const CELLS = 10;
/** Each menu's rows get their own ids (aria-activedescendant names the focused one). */
let menus = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Lights a meter's first `level` × ten cells. */
function lightMeter(meter: HTMLElement, level: number): void {
  const on = Math.round(level * CELLS);
  [...meter.children].forEach((c, i) => c.classList.toggle('on', i < on));
}

export class SysMenu {
  readonly el = el('div', 'sys-menu');
  private readonly rows: Record<SysRow, HTMLElement>;
  private readonly saveValue = el('span', 'sys-value', 'ALT+S');
  private saveBusy = false;
  private readonly soundValue = el('span', 'sys-value');
  private readonly meter = el('span', 'sys-meter');
  private readonly musicMeter = el('span', 'sys-meter');
  private readonly musicValue = el('span', 'sys-value');
  private readonly ambientMeter = el('span', 'sys-meter');
  private readonly ambientValue = el('span', 'sys-value');
  private readonly speeds = el('span', 'sys-value sys-speeds');
  private readonly size = el('span', 'sys-value sys-size');
  private readonly sizeValue = el('span', '');
  private readonly font = el('span', 'sys-value sys-font');
  private readonly fontValue = el('span', 'sys-font-name');
  private readonly keys = el('span', 'sys-value sys-keys');
  private chatKeys: ChatKeys = 'glyphs';
  private readonly model = el('span', 'sys-value hud-model');
  private readonly think = el('span', 'sys-value sys-keys sys-think');
  private thinking: NarratorThinking = 'auto';
  private readonly link = el('span', 'sys-value');
  private focus: SysRow = 'sound';
  private readonly idBase = `sys-${++menus}`;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private readonly h: SysMenuHandlers) {
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'System');
    for (const m of [this.meter, this.musicMeter, this.ambientMeter]) for (let i = 0; i < CELLS; i++) m.append(document.createElement('i'));
    for (const s of SPEEDS) {
      const w = el('i', '', s.toUpperCase());
      w.dataset.speed = s;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onTextSpeed(s);
      });
      this.speeds.append(w);
    }
    const save = this.row('save', 'SAVE', this.saveValue);
    save.hidden = true;
    save.addEventListener('click', () => this.save());
    const sound = this.row('sound', 'SOUND', this.meter, this.soundValue);
    const music = this.row('music', 'MUSIC', this.musicMeter, this.musicValue);
    const ambient = this.row('ambient', 'AMBIENT', this.ambientMeter, this.ambientValue);
    const text = this.row('text', 'TEXT', this.speeds);
    // ‹ and › step it on a click, as ← → and the wheel do.
    for (const d of [-1, 1]) {
      const b = el('i', 'sys-step', d < 0 ? '‹' : '›');
      b.dataset.step = String(d);
      b.addEventListener('click', () => this.h.onSizeStep(d));
      this.size.append(b);
      if (d < 0) this.size.append(this.sizeValue);
    }
    const size = this.row('size', 'TEXT SIZE', this.size);
    for (const d of [-1, 1]) {
      const b = el('i', 'sys-step', d < 0 ? '‹' : '›');
      b.dataset.step = String(d);
      b.addEventListener('click', () => this.h.onFontStep(d));
      this.font.append(b);
      if (d < 0) this.font.append(this.fontValue);
    }
    const font = this.row('font', 'FONT', this.font);
    for (const k of KEYS) {
      const w = el('i', '', k.toUpperCase());
      w.dataset.keys = k;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onChatKeys(k);
      });
      this.keys.append(w);
    }
    const keys = this.row('keys', 'CHAT KEYS', this.keys);
    const model = this.row('model', 'MODEL', this.model);
    for (const t of NARRATOR_THINKING) {
      const w = el('i', '', t.toUpperCase());
      w.dataset.think = t;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onThinking(t);
      });
      this.think.append(w);
    }
    const think = this.row('think', 'NARRATOR THINKING', this.think);
    const link = this.row('link', 'LINK', this.link);
    this.rows = { save, sound, music, ambient, text, size, font, keys, model, think, link };
    model.hidden = think.hidden = music.hidden = ambient.hidden = true;
    sound.addEventListener('click', () => this.h.onMute());
    model.addEventListener('click', () => {
      this.close();
      this.h.onModel();
    });
    sound.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onVolume(d)), { passive: false });
    music.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onMusic(d)), { passive: false });
    ambient.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onAmbient(d)), { passive: false });
    text.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onTextStep(d)), { passive: false });
    size.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onSizeStep(d)), { passive: false });
    font.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onFontStep(d)), { passive: false });
    this.el.append(save, sound, music, ambient, text, size, font, keys, model, think, link, el('div', 'sys-foot', '← → OR SCROLL TO CHANGE · ESC CLOSES'));
    // Clicks inside stay inside: the document's click closes SYS (and the MODEL menu).
    this.el.addEventListener('click', (e) => e.stopPropagation());
    // Listening from the start (the HUD is built before the dice table or any panel), so while open
    // its keys come first, ahead of handlers added later; closed, it lets every key by.
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.el.hidden = false;
    this.setFocus(this.shown()[0]);
    this.h.onOpenChange?.(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.h.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  showSound(v: SoundView): void {
    // No sound at all (the engine couldn't start): the row has nothing to offer. MUSIC and AMBIENT
    // only show once sound plays.
    this.rows.sound.hidden = v.kind === 'hidden';
    this.rows.music.hidden = this.rows.ambient.hidden = v.kind !== 'on';
    if (this.rows[this.focus].hidden) this.setFocus(this.shown()[0]);
    lightMeter(this.meter, v.kind === 'on' && !v.muted ? v.volume : 0);
    this.meter.hidden = v.kind !== 'on';
    if (v.kind === 'on') {
      lightMeter(this.musicMeter, v.music);
      lightMeter(this.ambientMeter, v.ambient);
      this.musicValue.textContent = `${Math.round(v.music * 100)}%`;
      this.ambientValue.textContent = `${Math.round(v.ambient * 100)}%`;
    }
    this.soundValue.textContent = v.kind === 'on' ? (v.muted ? 'MUTED' : `${Math.round(v.volume * 100)}%`) : 'CLICK FOR SOUND';
  }

  /** The SAVE row shows once the room has a save to offer. */
  showSave(on: boolean): void {
    this.rows.save.hidden = !on;
    if (this.isOpen && this.rows[this.focus].hidden) this.setFocus(this.shown()[0]);
  }

  /** While `name`'s reply streams SAVE reads WAIT FOR <NAME> and does nothing; null restores it. */
  showSaveBusy(name: string | null): void {
    this.saveBusy = name !== null;
    this.saveValue.textContent = name === null ? 'ALT+S' : `WAIT FOR ${name.toUpperCase()}`;
    this.rows.save.classList.toggle('busy', name !== null);
  }

  private save(): void {
    if (this.saveBusy) return;
    this.close();
    this.h.onSave?.();
  }

  showTextSpeed(s: TextSpeed): void {
    for (const w of this.speeds.children) w.classList.toggle('on', (w as HTMLElement).dataset.speed === s);
  }

  /** Lights the CHAT KEYS word in use. */
  showChatKeys(k: ChatKeys): void {
    this.chatKeys = k;
    for (const w of this.keys.children) w.classList.toggle('on', (w as HTMLElement).dataset.keys === k);
  }

  showTextSize(percent: number): void {
    this.sizeValue.textContent = ` ${percent}% `;
  }

  /** The transcript font's name, shown in that font. */
  showChatFont(f: ChatFont): void {
    this.fontValue.textContent = ` ${CHAT_FONT_LABEL[f]} `;
    this.fontValue.style.fontFamily = CHAT_FONT_FAMILY[f];
  }

  /** Her model, short; null hides the row (a contact without a MODEL menu), and NARRATOR THINKING with it. */
  showModel(label: string | null): void {
    this.rows.model.hidden = this.rows.think.hidden = label === null;
    this.model.textContent = label === null ? '' : `${label} ›`;
    if (label === null && (this.focus === 'model' || this.focus === 'think')) this.setFocus('link');
  }

  /** Lights the NARRATOR THINKING word in use. */
  showThinking(t: NarratorThinking): void {
    this.thinking = t;
    for (const w of this.think.children) w.classList.toggle('on', (w as HTMLElement).dataset.think === t);
  }

  showLink(s: LinkStatus): void {
    this.link.textContent = LINK_VALUE[s];
    this.link.classList.toggle('down', s !== 'ok');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }

  private row(id: SysRow, label: string, ...value: HTMLElement[]): HTMLElement {
    const r = el('div', 'sys-row');
    r.dataset.row = id;
    r.id = `${this.idBase}-${id}`;
    r.setAttribute('role', 'menuitem');
    r.append(el('span', 'sys-label', label), ...value);
    return r;
  }

  private setFocus(id: SysRow): void {
    this.focus = id;
    for (const [k, r] of Object.entries(this.rows)) r.classList.toggle('on', k === id);
    this.el.setAttribute('aria-activedescendant', this.rows[id].id);
  }

  /** The rows on show, in order (SOUND goes without sound, MUSIC and AMBIENT until it plays, MODEL without a menu). */
  private shown(): SysRow[] {
    return (Object.keys(this.rows) as SysRow[]).filter((r) => !this.rows[r].hidden);
  }

  private wheel(e: WheelEvent, step: (d: number) => void): void {
    e.preventDefault();
    if (e.deltaY !== 0) step(e.deltaY < 0 ? 1 : -1);
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    // An Alt chord opens a screen (Alt+S, Alt+J…): SYS gets out of its way and leaves the key alone.
    if (e.altKey) return this.close();
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (k === 'Escape') return this.close();
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const shown = this.shown();
      const at = shown.indexOf(this.focus);
      this.setFocus(shown[Math.max(0, Math.min(shown.length - 1, at + (k === 'ArrowDown' ? 1 : -1)))]);
      return;
    }
    const d = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    if (this.focus === 'save') {
      if (d === 0) this.save();
    } else if (this.focus === 'sound') {
      if (d !== 0) this.h.onVolume(d);
      else this.h.onMute();
    } else if (this.focus === 'music') {
      if (d !== 0) this.h.onMusic(d);
    } else if (this.focus === 'ambient') {
      if (d !== 0) this.h.onAmbient(d);
    } else if (this.focus === 'text') {
      if (d !== 0) this.h.onTextStep(d);
    } else if (this.focus === 'size') {
      if (d !== 0) this.h.onSizeStep(d);
    } else if (this.focus === 'font') {
      if (d !== 0) this.h.onFontStep(d);
    } else if (this.focus === 'keys') {
      // Two words: either arrow picks the one not in use.
      if (d !== 0) this.h.onChatKeys(this.chatKeys === 'glyphs' ? 'labels' : 'glyphs');
    } else if (this.focus === 'think') {
      if (d !== 0) {
        const n = NARRATOR_THINKING.length;
        this.h.onThinking(NARRATOR_THINKING[(NARRATOR_THINKING.indexOf(this.thinking) + d + n) % n]);
      }
    } else if (this.focus === 'model' && d === 0) {
      this.close();
      this.h.onModel();
    }
  }
}
