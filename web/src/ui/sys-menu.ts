/**
 * SYS (spec 2026-10-15): volume, music, voice, ambient, tips, mirror, frame rate, render scale, effects, blur, post effects, her model, reply length, reply thinking, narrator thinking and
 * the link, one row each, grouped SOUND · STAGE · GAME · MODEL. Since 2026-11-16 it opens as PAUSED's SETTINGS page
 * (pause-menu.ts, in the pause's red trace); a HUD without a pause menu still drops it under the SYS word. The chat box's own settings (text speed, text size,
 * font, chat keys) moved to the box's settings key (box-settings.ts).
 * MIRROR, NARRATOR THINKING and MODEL put a plain-words hint in the foot while picked or hovered. While it's open its keys are taken from the chat prompt: ↑ ↓ pick a row,
 * ← → (or the wheel) change it, Enter mutes or opens the MODEL menu, Esc closes. Text goes in
 * through textContent only.
 */
import { panelCue } from './panel-sound';
import { CHAT_THINKING, NARRATOR_THINKING, REPLY_LENGTHS, type ChatThinking, type LinkStatus, type NarratorThinking, type ReplyLength } from '../../../shared/types';
import type { SoundView } from './hud';
import { FRAME_RATES, type FrameRate } from './frame-rate';
import { EFFECTS_LEVELS, RENDER_SCALES, type EffectsLevel, type RenderScale } from './graphics-prefs';

export type SysRow = 'sound' | 'music' | 'voice' | 'ui' | 'ambient' | 'bg' | 'tips' | 'intro' | 'mirror' | 'fps' | 'scale' | 'fx' | 'blur' | 'post' | 'model' | 'length' | 'rthink' | 'think' | 'link';

const FOOT = '← → OR SCROLL TO CHANGE · ESC CLOSES';

/** Plain words for the rows a new player can't read from the label alone. */
const HINTS: Partial<Record<SysRow, string>> = {
  sound: 'Everything at once. Enter mutes it.',
  music: 'The songs: the title, the dial-in, the rooms that play one.',
  voice: 'The recorded narration on voiced job beats.',
  ui: 'The menus’, panels’ and table’s own sounds: rows, tabs, cards, dice.',
  bg: 'MUTE stops the sound while the game’s window isn’t the one you’re using. Hidden or minimised, it always stops.',
  ambient: 'The room’s own sound: rain on the glass, room tone, the hum of the lights.',
  intro: 'The LOWLIGHT card and the city’s lines before the splash. SKIP starts the game on the splash.',
  tips: 'Graft’s one-time tips on your first jobs. SHOW AGAIN brings back every tip you’ve seen.',
  fps: 'How often the room redraws. Lower runs cooler and saves battery.',
  scale: 'How many pixels the room is drawn with. Lower is lighter on the GPU, most of all on a high-resolution screen; the pixel art barely changes.',
  blur: 'The frosted glass behind panels and the blurred room beside the stage. Off is lighter on the GPU; panels keep their darkening.',
  post: 'Scanlines and the vignette over the room. Glitches and signal drops still play.',
  fx: 'The room’s moving extras. LOW drops dust and rain on the glass; OFF drops steam, smoke and passing lights too.',
  link: 'Whether the game can reach the model right now.',
  mirror: 'Flips the contact on the stage to face the other way. Kept per contact.',
  length: 'How long her replies run: about 50, 80 or 150 words a beat. Every contact.',
  rthink: 'Thinking time before each chat reply. AUTO is the model’s own; LOW and MEDIUM think more first: slower, costs more, often steadier.',
  think: 'Thinking time for the extras (openings, DRAW, suggested replies, dice lines), not chat replies. More is slower and costs more. AUTO thinks only if the model must.',
};

export interface SysMenuHandlers {
  /** +1 louder, −1 quieter. */
  onVolume(steps: number): void;
  onMute(): void;
  /** +1 louder, −1 quieter: the songs alone. */
  onMusic(steps: number): void;
  /** +1 louder, −1 quieter: the recorded narration of voiced job beats. */
  onVoice(steps: number): void;
  /** +1 louder, −1 quieter: the UI's own cues. */
  onUi(steps: number): void;
  /** IN BACKGROUND: true mutes while the window isn't focused. */
  onBackground(mute: boolean): void;
  /** +1 louder, −1 quieter: the room's own sound (weather, room tone, lights). */
  onAmbient(steps: number): void;
  /** TIPS: Graft's tips on or off. */
  onTips(on: boolean): void;
  /** TIPS → SHOW AGAIN: every tip unseen. */
  onTipsAgain(): void;
  /** INTRO: true skips the opening card on start up. */
  onIntro(skip: boolean): void;
  /** MIRROR: her figure on the stage flipped to face the other way, or not. */
  onMirror(on: boolean): void;
  /** FRAME RATE: a word picked (a click, or ← → stepping to the next one). */
  onFrameRate(r: FrameRate): void;
  /** RENDER SCALE: a share picked (a click, or ← → stepping to the next one). */
  onRenderScale(s: RenderScale): void;
  /** EFFECTS: a level picked (a click, or ← → stepping to the next one). */
  onEffects(l: EffectsLevel): void;
  /** BLUR: on or off. */
  onBlur(on: boolean): void;
  /** POST EFFECTS: on or off. */
  onPost(on: boolean): void;
  /** Opens the MODEL menu (SYS has closed by then). */
  onModel(): void;
  /** NARRATOR THINKING: a word picked (a click, or ← → stepping to the next one). */
  onThinking(t: NarratorThinking): void;
  /** REPLY LENGTH: a length picked. */
  onReplyLength(l: ReplyLength): void;
  /** REPLY THINKING: an effort picked. */
  onChatThinking(t: ChatThinking): void;
  /** It opened (true) or closed (false), however it did. */
  onOpenChange?(open: boolean): void;
}

const LINK_VALUE: Record<LinkStatus, string> = { ok: 'OK', down: 'DOWN', lost: 'SIGNAL LOST' };
const CELLS = 10;
/** The groups, in order; the rows go in this order for ↑ ↓ too. */
const GROUPS: { id: string; label: string; rows: SysRow[] }[] = [
  { id: 'sound', label: 'SOUND', rows: ['sound', 'music', 'voice', 'ui', 'ambient', 'bg'] },
  { id: 'stage', label: 'STAGE', rows: ['mirror', 'fps', 'scale', 'fx', 'blur', 'post'] },
  { id: 'game', label: 'GAME', rows: ['tips', 'intro'] },
  { id: 'model', label: 'MODEL', rows: ['model', 'length', 'rthink', 'think', 'link'] },
];
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
  private readonly soundValue = el('span', 'sys-value');
  private readonly meter = el('span', 'sys-meter');
  private readonly musicMeter = el('span', 'sys-meter');
  private readonly musicValue = el('span', 'sys-value');
  private readonly voiceMeter = el('span', 'sys-meter');
  private readonly voiceValue = el('span', 'sys-value');
  private readonly uiMeter = el('span', 'sys-meter');
  private readonly uiValue = el('span', 'sys-value');
  private readonly bg = el('span', 'sys-value sys-keys sys-bg');
  private bgMute = false;
  private readonly ambientMeter = el('span', 'sys-meter');
  private readonly ambientValue = el('span', 'sys-value');
  private readonly tips = el('span', 'sys-value sys-keys sys-tips');
  private tipsOn = true;
  private readonly intro = el('span', 'sys-value sys-keys sys-intro');
  private introSkipped = false;
  private readonly mirror = el('span', 'sys-value sys-keys sys-mirror');
  private mirrorOn = false;
  private readonly fps = el('span', 'sys-value sys-keys sys-fps');
  private frameRate: FrameRate = '60';
  private readonly scale = el('span', 'sys-value sys-keys sys-scale');
  private renderScale: RenderScale = '100';
  private readonly fx = el('span', 'sys-value sys-keys sys-fx');
  private effects: EffectsLevel = 'full';
  private readonly blur = el('span', 'sys-value sys-keys sys-blur');
  private blurOn = true;
  private readonly post = el('span', 'sys-value sys-keys sys-post');
  private postOn = true;
  private readonly model = el('span', 'sys-value hud-model');
  private readonly think = el('span', 'sys-value sys-keys sys-think');
  private thinking: NarratorThinking = 'auto';
  private readonly length = el('span', 'sys-value sys-keys sys-length');
  private replyLength: ReplyLength = 'normal';
  private readonly rthink = el('span', 'sys-value sys-keys sys-rthink');
  private chatThinking: ChatThinking = 'auto';
  private readonly link = el('span', 'sys-value');
  private focus: SysRow = 'sound';
  private readonly idBase = `sys-${++menus}`;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  private readonly foot = el('div', 'sys-foot', FOOT);
  private readonly groups: HTMLElement[] = [];
  private hovered: SysRow | null = null;
  /** Hints the HUD sets at run time, ahead of HINTS; a function is read as the hint shows (MODEL's names her pronoun). */
  private readonly hints: Partial<Record<SysRow, string | (() => string)>> = {};

  constructor(private readonly h: SysMenuHandlers) {
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');
    this.el.setAttribute('aria-label', 'System');
    for (const m of [this.meter, this.musicMeter, this.voiceMeter, this.uiMeter, this.ambientMeter]) for (let i = 0; i < CELLS; i++) m.append(document.createElement('i'));
    const sound = this.row('sound', 'SOUND', this.meter, this.soundValue);
    const music = this.row('music', 'MUSIC', this.musicMeter, this.musicValue);
    const voice = this.row('voice', 'VOICE', this.voiceMeter, this.voiceValue);
    const ui = this.row('ui', 'UI', this.uiMeter, this.uiValue);
    for (const mute of [false, true]) {
      const w = el('i', '', mute ? 'MUTE' : 'PLAY');
      w.dataset.bg = mute ? 'mute' : 'play';
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onBackground(mute);
      });
      this.bg.append(w);
    }
    const bg = this.row('bg', 'IN BACKGROUND', this.bg);
    const ambient = this.row('ambient', 'AMBIENT', this.ambientMeter, this.ambientValue);
    for (const on of [true, false]) {
      const w = el('i', '', on ? 'ON' : 'OFF');
      w.dataset.tips = on ? 'on' : 'off';
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onTips(on);
      });
      this.tips.append(w);
    }
    const again = el('i', 'sys-tips-again', 'SHOW AGAIN');
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      this.h.onTipsAgain();
    });
    this.tips.append(again);
    const tips = this.row('tips', 'TIPS', this.tips);
    for (const skip of [false, true]) {
      const w = el('i', '', skip ? 'SKIP' : 'PLAY');
      w.dataset.intro = skip ? 'skip' : 'play';
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onIntro(skip);
      });
      this.intro.append(w);
    }
    const intro = this.row('intro', 'INTRO', this.intro);
    for (const on of [true, false]) {
      const w = el('i', '', on ? 'ON' : 'OFF');
      w.dataset.mirror = on ? 'on' : 'off';
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onMirror(on);
      });
      this.mirror.append(w);
    }
    const mirror = this.row('mirror', 'MIRROR', this.mirror);
    for (const r of FRAME_RATES) {
      const w = el('i', '', r.toUpperCase());
      w.dataset.fps = r;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onFrameRate(r);
      });
      this.fps.append(w);
    }
    const fps = this.row('fps', 'FRAME RATE', this.fps);
    for (const r of RENDER_SCALES) {
      const w = el('i', '', `${r}%`);
      w.dataset.scale = r;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onRenderScale(r);
      });
      this.scale.append(w);
    }
    const scale = this.row('scale', 'RENDER SCALE', this.scale);
    for (const l of EFFECTS_LEVELS) {
      const w = el('i', '', l.toUpperCase());
      w.dataset.fx = l;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onEffects(l);
      });
      this.fx.append(w);
    }
    const fx = this.row('fx', 'EFFECTS', this.fx);
    const onOff = (box: HTMLElement, pick: (on: boolean) => void) => {
      for (const on of [true, false]) {
        const w = el('i', '', on ? 'ON' : 'OFF');
        w.dataset.on = on ? 'on' : 'off';
        w.addEventListener('click', (e) => {
          e.stopPropagation();
          pick(on);
        });
        box.append(w);
      }
    };
    onOff(this.blur, (on) => this.h.onBlur(on));
    onOff(this.post, (on) => this.h.onPost(on));
    const blur = this.row('blur', 'BLUR', this.blur);
    const post = this.row('post', 'POST EFFECTS', this.post);
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
    for (const l of REPLY_LENGTHS) {
      const w = el('i', '', l.toUpperCase());
      w.dataset.length = l;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onReplyLength(l);
      });
      this.length.append(w);
    }
    const length = this.row('length', 'REPLY LENGTH', this.length);
    for (const t of CHAT_THINKING) {
      const w = el('i', '', t.toUpperCase());
      w.dataset.rthink = t;
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.onChatThinking(t);
      });
      this.rthink.append(w);
    }
    const rthink = this.row('rthink', 'REPLY THINKING', this.rthink);
    const link = this.row('link', 'LINK', this.link);
    // In GROUPS's order: ↑ ↓ walk the rows as the object lists them.
    this.rows = { sound, music, voice, ui, ambient, bg, mirror, fps, scale, fx, blur, post, tips, intro, model, length, rthink, think, link };
    model.hidden = length.hidden = rthink.hidden = think.hidden = music.hidden = voice.hidden = ui.hidden = ambient.hidden = bg.hidden = true;
    sound.addEventListener('click', () => this.h.onMute());
    model.addEventListener('click', () => {
      this.close();
      this.h.onModel();
    });
    sound.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onVolume(d)), { passive: false });
    music.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onMusic(d)), { passive: false });
    voice.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onVoice(d)), { passive: false });
    ui.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onUi(d)), { passive: false });
    ambient.addEventListener('wheel', (e) => this.wheel(e, (d) => this.h.onAmbient(d)), { passive: false });
    for (const g of GROUPS) {
      const box = el('div', 'sys-group');
      box.dataset.group = g.id;
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', g.label);
      box.append(el('div', 'sys-head', g.label), ...g.rows.map((r) => this.rows[r]));
      this.groups.push(box);
      this.el.append(box);
    }
    this.el.append(this.foot);
    this.syncGroups();
    // A row that isn't obvious explains itself in the foot while it's picked or under the pointer.
    for (const [id, r] of Object.entries(this.rows) as [SysRow, HTMLElement][]) {
      r.addEventListener('mouseenter', () => {
        this.hovered = id;
        this.showHint();
      });
      r.addEventListener('mouseleave', () => {
        if (this.hovered === id) this.hovered = null;
        this.showHint();
      });
    }
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
    panelCue('sys');
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

  /** A group's head goes with its last row (no sound engine, no MODEL menu). */
  private syncGroups(): void {
    for (const g of this.groups) g.hidden = [...g.querySelectorAll<HTMLElement>('.sys-row')].every((r) => r.hidden);
  }

  showSound(v: SoundView): void {
    // No sound at all (the engine couldn't start): the row has nothing to offer. MUSIC, VOICE and AMBIENT
    // only show once sound plays.
    this.rows.sound.hidden = v.kind === 'hidden';
    this.rows.music.hidden = this.rows.voice.hidden = this.rows.ui.hidden = this.rows.ambient.hidden = this.rows.bg.hidden = v.kind !== 'on';
    this.syncGroups();
    if (this.rows[this.focus].hidden) this.setFocus(this.shown()[0]);
    lightMeter(this.meter, v.kind === 'on' && !v.muted ? v.volume : 0);
    this.meter.hidden = v.kind !== 'on';
    if (v.kind === 'on') {
      lightMeter(this.musicMeter, v.music);
      lightMeter(this.voiceMeter, v.voice);
      lightMeter(this.uiMeter, v.ui);
      this.uiValue.textContent = `${Math.round(v.ui * 100)}%`;
      this.bgMute = v.muteInBackground;
      for (const w of this.bg.children) w.classList.toggle('on', (w as HTMLElement).dataset.bg === (v.muteInBackground ? 'mute' : 'play'));
      lightMeter(this.ambientMeter, v.ambient);
      this.musicValue.textContent = `${Math.round(v.music * 100)}%`;
      this.voiceValue.textContent = `${Math.round(v.voice * 100)}%`;
      this.ambientValue.textContent = `${Math.round(v.ambient * 100)}%`;
    }
    this.soundValue.textContent = v.kind === 'on' ? (v.muted ? 'MUTED' : `${Math.round(v.volume * 100)}%`) : 'CLICK FOR SOUND';
  }


  /** Lights TIPS's ON or OFF. */
  showTips(on: boolean): void {
    this.tipsOn = on;
    for (const w of this.tips.querySelectorAll<HTMLElement>('[data-tips]')) w.classList.toggle('on', w.dataset.tips === (on ? 'on' : 'off'));
  }

  /** Lights INTRO's PLAY or SKIP. */
  showIntro(skip: boolean): void {
    this.introSkipped = skip;
    for (const w of this.intro.children) w.classList.toggle('on', (w as HTMLElement).dataset.intro === (skip ? 'skip' : 'play'));
  }

  /** Lights MIRROR's ON or OFF. */
  showMirror(on: boolean): void {
    this.mirrorOn = on;
    for (const w of this.mirror.children) w.classList.toggle('on', (w as HTMLElement).dataset.mirror === (on ? 'on' : 'off'));
  }

  /** Lights the RENDER SCALE share in use. */
  showRenderScale(s: RenderScale): void {
    this.renderScale = s;
    for (const w of this.scale.children) w.classList.toggle('on', (w as HTMLElement).dataset.scale === s);
  }

  /** Lights BLUR's ON or OFF. */
  showBlur(on: boolean): void {
    this.blurOn = on;
    for (const w of this.blur.children) w.classList.toggle('on', (w as HTMLElement).dataset.on === (on ? 'on' : 'off'));
  }

  /** Lights POST EFFECTS' ON or OFF. */
  showPost(on: boolean): void {
    this.postOn = on;
    for (const w of this.post.children) w.classList.toggle('on', (w as HTMLElement).dataset.on === (on ? 'on' : 'off'));
  }

  /** Lights the EFFECTS level in use. */
  showEffects(l: EffectsLevel): void {
    this.effects = l;
    for (const w of this.fx.children) w.classList.toggle('on', (w as HTMLElement).dataset.fx === l);
  }

  /** Lights the FRAME RATE word in use. */
  showFrameRate(r: FrameRate): void {
    this.frameRate = r;
    for (const w of this.fps.children) w.classList.toggle('on', (w as HTMLElement).dataset.fps === r);
  }

  /** Her model, short; null hides the row (a contact without a MODEL menu), and NARRATOR THINKING with it. */
  showModel(label: string | null): void {
    this.rows.model.hidden = this.rows.length.hidden = this.rows.rthink.hidden = this.rows.think.hidden = label === null;
    this.model.textContent = label === null ? '' : `${label} ›`;
    this.syncGroups();
    if (label === null && (['model', 'length', 'rthink', 'think'] as SysRow[]).includes(this.focus)) this.setFocus('link');
  }

  /** A row's foot hint, set at run time; null takes it away. */
  setHint(row: SysRow, text: string | (() => string) | null): void {
    if (text === null) delete this.hints[row];
    else this.hints[row] = text;
    if (this.isOpen) this.showHint();
  }

  /** Lights the REPLY LENGTH word in use. */
  showReplyLength(l: ReplyLength): void {
    this.replyLength = l;
    for (const w of this.length.children) w.classList.toggle('on', (w as HTMLElement).dataset.length === l);
  }

  /** Lights the REPLY THINKING word in use. */
  showChatThinking(t: ChatThinking): void {
    this.chatThinking = t;
    for (const w of this.rthink.children) w.classList.toggle('on', (w as HTMLElement).dataset.rthink === t);
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
    // The line runs from the label to the values (drawn only on the pause's page, lit on the picked row).
    r.append(el('span', 'sys-label', label), el('i', 'sys-line'), ...value);
    return r;
  }

  private setFocus(id: SysRow): void {
    this.focus = id;
    for (const [k, r] of Object.entries(this.rows)) r.classList.toggle('on', k === id);
    this.el.setAttribute('aria-activedescendant', this.rows[id].id);
    this.showHint();
  }

  /** The foot: the hovered row's hint, else the picked row's, else how to drive the menu. */
  private showHint(): void {
    const of = (r: SysRow | null) => {
      if (!r) return undefined;
      const h = this.hints[r];
      return (typeof h === 'function' ? h() : h) ?? HINTS[r];
    };
    const hint = of(this.hovered) ?? of(this.focus);
    this.foot.textContent = hint ?? FOOT;
    this.foot.classList.toggle('hint', !!hint);
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
    // ← → on a row changes its setting.
    if (d !== 0) panelCue('setting');
    if (this.focus === 'sound') {
      if (d !== 0) this.h.onVolume(d);
      else this.h.onMute();
    } else if (this.focus === 'music') {
      if (d !== 0) this.h.onMusic(d);
    } else if (this.focus === 'voice') {
      if (d !== 0) this.h.onVoice(d);
    } else if (this.focus === 'ui') {
      if (d !== 0) this.h.onUi(d);
    } else if (this.focus === 'bg') {
      if (d !== 0) this.h.onBackground(!this.bgMute);
    } else if (this.focus === 'ambient') {
      if (d !== 0) this.h.onAmbient(d);
    } else if (this.focus === 'tips') {
      // ← → flip it; Enter shows them again.
      if (d !== 0) this.h.onTips(!this.tipsOn);
      else this.h.onTipsAgain();
    } else if (this.focus === 'intro') {
      if (d !== 0) this.h.onIntro(!this.introSkipped);
    } else if (this.focus === 'mirror') {
      if (d !== 0) this.h.onMirror(!this.mirrorOn);
    } else if (this.focus === 'fps') {
      if (d !== 0) {
        const n = FRAME_RATES.length;
        this.h.onFrameRate(FRAME_RATES[(FRAME_RATES.indexOf(this.frameRate) + d + n) % n]);
      }
    } else if (this.focus === 'scale') {
      if (d !== 0) {
        const n = RENDER_SCALES.length;
        this.h.onRenderScale(RENDER_SCALES[(RENDER_SCALES.indexOf(this.renderScale) + d + n) % n]);
      }
    } else if (this.focus === 'fx') {
      if (d !== 0) {
        const n = EFFECTS_LEVELS.length;
        this.h.onEffects(EFFECTS_LEVELS[(EFFECTS_LEVELS.indexOf(this.effects) + d + n) % n]);
      }
    } else if (this.focus === 'blur') {
      if (d !== 0) this.h.onBlur(!this.blurOn);
    } else if (this.focus === 'post') {
      if (d !== 0) this.h.onPost(!this.postOn);
    } else if (this.focus === 'length') {
      if (d !== 0) {
        const n = REPLY_LENGTHS.length;
        this.h.onReplyLength(REPLY_LENGTHS[(REPLY_LENGTHS.indexOf(this.replyLength) + d + n) % n]);
      }
    } else if (this.focus === 'rthink') {
      if (d !== 0) {
        const n = CHAT_THINKING.length;
        this.h.onChatThinking(CHAT_THINKING[(CHAT_THINKING.indexOf(this.chatThinking) + d + n) % n]);
      }
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
