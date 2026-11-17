/**
 * The creator at 1P (character creator spec 2026-11-14): LOOK (the questions, GENERATE on the player's
 * OpenRouter key) → FIT (pick a take, box the face, line the waist) → WHO (name, pronoun, background,
 * WEARS) → KEEP. Keyboard first: arrows and Enter where there's a choice, Ctrl/⌘+Enter to GENERATE or
 * KEEP, Esc steps back. A take on its way holds the creator open, so a redraw or a second press never
 * pays twice; leaving with unkept takes asks first and throws them away.
 */
import { frontCue } from '../front-sound';
import { DEFAULT_EXPRESSION, DEFAULT_POSE, emptyFields, FIGURE_HINTS, FIGURE_LABELS, type FigureField, type FigureFields } from '../../../../shared/figure-prompt';
import { figureCrop } from '../../../../shared/figure-crop';
import { PERSONA_BACKGROUND_MAX, PERSONA_NAME_MAX, WEARS_MAX } from '../../../../shared/persona';
import { oneLine, type PersonRow, type PersonWho } from '../../../../shared/person';
import { PRONOUNS, type Pronoun } from '../../../../shared/pronoun';
import type { PeopleApi } from '../../net/people';
import './creator.css';

export type CreatorStep = 'look' | 'fit' | 'who';

export interface CreatorOptions {
  api: PeopleApi;
  /** Someone already made (EDIT), or null for someone new. */
  person: PersonRow | null;
  /** An OpenRouter key is linked: GENERATE can pay for a take. */
  key: boolean;
  /** Where a fresh take's face box and waist line start: the stand-in's. */
  defaults: { face: { x: number; y: number }; waist: number };
  onKeep(row: PersonRow): void;
  onCancel(): void;
}

/** What a take costs, as the creator says it beside GENERATE. */
export const PRICE = 'about $0.19 a take, on your OpenRouter key';
const GROUPS: [string, FigureField[]][] = [
  ['BODY', ['age', 'build', 'ethnicity', 'skin']],
  ['FACE', ['hair', 'eyes', 'expression']],
  ['WEAR', ['clothes', 'marks', 'pose', 'extra']],
];
/** How near the waist line (in screen pixels) a press grabs it rather than the face. */
const GRAB_PX = 8;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class Creator {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly status: HTMLElement;
  private stepNow: CreatorStep;
  /** The person's id: theirs on EDIT, a draft once a take or KEEP needs one. */
  private id: string | null;
  /** True for someone new: leaving removes the draft. */
  private readonly fresh: boolean;
  private readonly fields: FigureFields = { ...emptyFields() };
  /** Takes made in this creator, newest first, with where each one's face and waist sit. */
  private takes: { take: string; face: { x: number; y: number }; waist: number }[] = [];
  private on = 0;
  private pending = false;
  private confirming = false;
  private keeping = false;
  private destroyed = false;
  private readonly who: PersonWho;
  private raw = false;
  /** An OpenRouter key is linked (the server is asked again when the creator opens). */
  private hasKey: boolean;

  constructor(
    host: HTMLElement,
    private readonly o: CreatorOptions,
  ) {
    this.el = el('div', 'creator');
    this.body = el('div', 'mk-body');
    this.status = el('div', 'mk-status');
    this.status.setAttribute('role', 'status');
    this.el.append(this.body, this.status);
    host.append(this.el);
    this.hasKey = o.key;
    this.id = o.person?.id ?? null;
    this.fresh = o.person === null;
    this.who = { name: o.person?.name ?? '', pronoun: o.person?.pronoun ?? 'they', background: o.person?.background ?? '', wears: o.person?.wears ?? '' };
    this.stepNow = o.person ? 'who' : 'look';
    this.draw();
  }

  get step(): CreatorStep {
    return this.stepNow;
  }

  /** A key linked or unlinked since the creator opened: LOOK offers GENERATE or says why not. */
  setKey(key: boolean): void {
    if (key === this.hasKey) return;
    this.hasKey = key;
    if (this.stepNow === 'look' && !this.confirming) this.draw();
  }

  /** A take is on its way. */
  get busy(): boolean {
    return this.pending;
  }

  /** True when the key was the creator's; false leaves it to a focused field. */
  key(e: KeyboardEvent): boolean {
    if (this.confirming) {
      if (e.key === 'Enter') {
        void this.leave();
        return true;
      }
      if (e.key === 'Escape') {
        this.confirming = false;
        this.draw();
        return true;
      }
      return false;
    }
    if (e.key === 'Escape') {
      this.back();
      return true;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (this.stepNow === 'look') void this.generate();
      else if (this.stepNow === 'who') void this.keep();
      else this.go('who');
      return true;
    }
    if (this.stepNow === 'fit' && !this.inField(e)) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (this.takes.length > 0) this.pick((this.on + (e.key === 'ArrowRight' ? 1 : -1) + this.takes.length) % this.takes.length);
        return true;
      }
      if (e.key === 'Enter') {
        this.go('who');
        return true;
      }
    }
    return false;
  }

  focus(): void {
    this.body.querySelector<HTMLElement>('input, textarea, button')?.focus();
  }

  destroy(): void {
    this.destroyed = true;
    this.el.remove();
  }

  private inField(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  private say(text: string, bad = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('bad', bad);
  }

  private go(step: CreatorStep): void {
    if (step === 'fit' && this.takes.length === 0) return;
    this.stepNow = step;
    this.say('');
    this.draw();
    this.focus();
  }

  private back(): void {
    if (this.stepNow === 'who') {
      if (this.takes.length > 0) return this.go('fit');
      if (this.fresh) return this.go('look');
      return this.tryLeave();
    }
    if (this.stepNow === 'fit') return this.go('look');
    this.tryLeave();
  }

  private tryLeave(): void {
    if (this.pending) {
      this.say('A take is on its way: wait for it before you leave.', true);
      return;
    }
    if (this.takes.length > 0) {
      this.confirming = true;
      this.draw();
      return;
    }
    void this.leave();
  }

  private async leave(): Promise<void> {
    this.confirming = false;
    const id = this.id;
    try {
      if (id && this.takes.length > 0) await this.o.api.dropTakes(id);
      if (id && this.fresh) await this.o.api.remove(id);
    } catch {
      /* the server sweeps drafts at start */
    }
    this.o.onCancel();
  }

  private async ensureId(): Promise<string> {
    if (this.id) return this.id;
    this.id = (await this.o.api.draft()).id;
    return this.id;
  }

  private async generate(): Promise<void> {
    if (!this.hasKey || this.pending || this.destroyed) return;
    this.pending = true;
    frontCue('generate');
    this.say('Generating a take: this can take a minute.');
    this.draw();
    try {
      const id = await this.ensureId();
      const made = await this.o.api.generate(id, { ...this.fields });
      if (this.destroyed) return;
      const known = new Map(this.takes.map((t) => [t.take, t]));
      const listed = await this.o.api.takes(id).catch(() => ({ takes: [] as { take: string; made: number }[] }));
      const names = [...new Set([made.take, ...listed.takes.map((t) => t.take), ...known.keys()])].sort().reverse();
      this.takes = names.map((take) => known.get(take) ?? { take, face: { ...this.o.defaults.face }, waist: this.o.defaults.waist });
      this.on = this.takes.findIndex((t) => t.take === made.take);
      this.pending = false;
      frontCue('figure');
      this.say(typeof made.cost === 'number' ? `That take cost $${made.cost.toFixed(2)}.` : '');
      this.stepNow = 'fit';
      this.draw();
    } catch (err) {
      if (this.destroyed) return;
      this.pending = false;
      this.say(err instanceof Error ? err.message : String(err), true);
      this.draw();
    }
  }

  private pick(i: number): void {
    this.on = i;
    this.draw();
  }

  /** The take FIT has picked, if any (KEEP keeps it). */
  private picked(): { take: string; face: { x: number; y: number }; waist: number } | null {
    return this.takes[this.on] ?? null;
  }

  /** Whether WHO asks for WEARS: a figure is (or will be) theirs. */
  private hasFigure(): boolean {
    return this.picked() !== null || this.o.person?.figure === true;
  }

  private async keep(): Promise<void> {
    if (this.keeping || this.pending) return;
    const who: PersonWho = { name: this.who.name.trim(), pronoun: this.who.pronoun, background: this.who.background.trim(), wears: this.hasFigure() ? oneLine(this.who.wears) : '' };
    if (!who.name) return this.say('NAME: who are they?', true);
    if (this.hasFigure() && !who.wears) return this.say('WEARS: say what they have on.', true);
    this.keeping = true;
    this.say('Keeping…');
    try {
      const id = await this.ensureId();
      let row = await this.o.api.save(id, who);
      const take = this.picked();
      if (take) {
        row = await this.o.api.keep(id, { take: take.take, face: take.face, waist: take.waist, fields: { ...this.fields } });
        // The other takes aren't theirs: they go.
        await this.o.api.dropTakes(id).catch(() => {});
      }
      if (this.destroyed) return;
      frontCue('keep');
      this.o.onKeep(row);
    } catch (err) {
      this.keeping = false;
      if (!this.destroyed) this.say(err instanceof Error ? err.message : String(err), true);
    }
  }

  private draw(): void {
    if (this.confirming) {
      const n = this.takes.length;
      this.body.replaceChildren(
        el('div', 'mk-confirm', `Leave and throw away ${n === 1 ? 'the take' : `${n} takes`} you paid for? ENTER yes · ESC no`),
      );
      return;
    }
    const title = el('div', 'mk-steps');
    for (const s of ['look', 'fit', 'who'] as const) title.append(el('span', `mk-step${s === this.stepNow ? ' on' : ''}`, s === 'look' ? '1 LOOK' : s === 'fit' ? '2 FIT' : '3 WHO'));
    this.body.replaceChildren(title, this.stepNow === 'look' ? this.lookView() : this.stepNow === 'fit' ? this.fitView() : this.whoView());
  }

  private lookView(): HTMLElement {
    const box = el('div', 'mk-look');
    const input = (f: FigureField) => {
      const long = f === 'clothes' || f === 'extra';
      const field = long ? el('textarea', 'mk-input') : el('input', 'mk-input');
      field.dataset.field = f;
      field.value = this.fields[f];
      field.placeholder = f === 'pose' ? DEFAULT_POSE : f === 'expression' ? DEFAULT_EXPRESSION : FIGURE_HINTS[f];
      field.setAttribute('aria-label', FIGURE_LABELS[f]);
      if (field instanceof HTMLTextAreaElement) field.rows = 2;
      field.addEventListener('input', () => (this.fields[f] = field.value.slice(0, 600)));
      return this.labelled(FIGURE_LABELS[f], field);
    };
    for (const [name, fs] of GROUPS) {
      const set = el('fieldset', 'mk-group');
      set.append(el('legend', '', name), ...fs.map(input));
      box.append(set);
    }
    const actions = el('div', 'mk-actions');
    if (this.hasKey) {
      const gen = button('mk-generate', this.pending ? 'GENERATING…' : 'GENERATE', () => void this.generate());
      gen.disabled = this.pending;
      actions.append(gen, el('span', 'mk-price', PRICE));
    } else {
      actions.append(el('span', 'mk-nokey', 'No OpenRouter key linked, so no figure yet. Link one at the model step, then make their figure from their tile. They stand in the plain silhouette until then.'));
    }
    if (this.takes.length > 0) actions.append(button('mk-to-fit', `TAKES (${this.takes.length})`, () => this.go('fit')));
    actions.append(button('mk-skip', this.o.person ? 'WHO' : 'SKIP TO WHO', () => this.go('who')));
    box.append(actions);
    return box;
  }

  private labelled(text: string, field: HTMLElement): HTMLElement {
    const l = el('label', 'mk-label');
    l.append(el('span', '', text), field);
    return l;
  }

  private fitView(): HTMLElement {
    const box = el('div', 'mk-fit');
    const strip = el('div', 'mk-strip');
    const id = this.id!;
    this.takes.forEach((t, i) => {
      const b = button(`mk-take${i === this.on ? ' on' : ''}`, '', () => this.pick(i));
      b.dataset.take = t.take;
      const img = el('img', '');
      img.src = this.o.api.takeUrl(id, t.take);
      img.alt = '';
      b.append(img);
      strip.append(b);
    });
    const it = this.picked()!;
    const img = el('img', '');
    img.alt = 'the take';
    img.src = this.o.api.takeUrl(id, it.take, this.raw);
    const faceBox = el('div', 'mk-box');
    const line = el('div', 'mk-waist');
    line.append(el('span', '', 'WAIST'));
    const frame = el('div', 'mk-frame');
    frame.append(img, faceBox, line);
    const crop = el('div', 'mk-crop');
    const place = () => {
      const c = figureCrop(it.face);
      Object.assign(faceBox.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
      line.style.top = `${it.waist * 100}%`;
      Object.assign(crop.style, {
        backgroundImage: `url("${img.src}")`,
        backgroundSize: `${100 / c.w}% ${100 / c.h}%`,
        backgroundPosition: `${c.w < 1 ? (c.x / (1 - c.w)) * 100 : 0}% ${c.h < 1 ? (c.y / (1 - c.h)) * 100 : 0}%`,
      });
    };
    place();
    // Drag: near the waist line moves the line; anywhere else puts the face there.
    let mode: 'face' | 'waist' | null = null;
    const at = (e: PointerEvent) => {
      const r = frame.getBoundingClientRect();
      return r.width && r.height ? { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height), h: r.height } : null;
    };
    const move = (e: PointerEvent) => {
      const p = mode && at(e);
      if (!p) return;
      if (mode === 'waist') it.waist = round3(p.y);
      else it.face = { x: round3(p.x), y: round3(p.y) };
      place();
    };
    frame.addEventListener('pointerdown', (e) => {
      const p = at(e);
      if (!p) return;
      e.preventDefault();
      mode = Math.abs(p.y - it.waist) * p.h <= GRAB_PX ? 'waist' : 'face';
      frame.classList.add('dragging');
      try {
        frame.setPointerCapture(e.pointerId);
      } catch {
        /* a synthetic event */
      }
      if (mode === 'face') move(e);
    });
    frame.addEventListener('pointermove', move);
    const up = () => {
      mode = null;
      frame.classList.remove('dragging');
    };
    frame.addEventListener('pointerup', up);
    frame.addEventListener('pointercancel', up);
    const asMade = button(`mk-raw${this.raw ? ' on' : ''}`, 'AS GENERATED', () => {
      this.raw = !this.raw;
      this.draw();
    });
    const pics = el('div', 'mk-pics');
    const left = el('div', 'mk-pic');
    left.append(el('span', 'mk-hint', 'drag the box over the face · the line to the waist'), frame, asMade);
    const right = el('div', 'mk-pic');
    right.append(el('span', 'mk-hint', 'PORTRAIT · as the game crops it'), crop);
    pics.append(left, right);
    const actions = el('div', 'mk-actions');
    actions.append(button('mk-next', 'NEXT: WHO', () => this.go('who')), button('mk-more', 'ANOTHER TAKE', () => this.go('look')), el('span', 'mk-hint', '← → pick a take · ENTER next · ESC back'));
    box.append(strip, pics, actions);
    return box;
  }

  private whoView(): HTMLElement {
    const box = el('div', 'mk-who');
    const name = el('input', 'mk-name');
    name.maxLength = PERSONA_NAME_MAX;
    name.value = this.who.name;
    name.addEventListener('input', () => (this.who.name = name.value));
    const pronouns = el('div', 'mk-pronouns');
    const press = () => pronouns.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pronoun === this.who.pronoun)));
    for (const p of PRONOUNS) {
      const b = button('mk-pronoun', p.toUpperCase(), () => {
        this.who.pronoun = p as Pronoun;
        press();
      });
      b.dataset.pronoun = p;
      pronouns.append(b);
    }
    press();
    const background = el('textarea', 'mk-background');
    background.maxLength = PERSONA_BACKGROUND_MAX;
    background.rows = 5;
    background.value = this.who.background;
    background.placeholder = 'Who they are, where they come from, what they want. Contacts meet them as a stranger.';
    background.addEventListener('input', () => (this.who.background = background.value));
    box.append(this.labelled('NAME', name), this.labelled('THEY ARE', pronouns), this.labelled('BACKGROUND', background));
    if (this.hasFigure()) {
      const wears = el('textarea', 'mk-wears');
      wears.maxLength = WEARS_MAX;
      wears.rows = 2;
      wears.value = this.who.wears || oneLine(this.fields.clothes).slice(0, WEARS_MAX);
      this.who.wears = wears.value;
      wears.addEventListener('input', () => (this.who.wears = wears.value));
      box.append(this.labelled('WEARS · what contacts are told you have on', wears));
    }
    const actions = el('div', 'mk-actions');
    const keep = button('mk-keep', 'KEEP', () => void this.keep());
    actions.append(keep, button('mk-to-look', this.o.person?.figure || this.takes.length > 0 ? 'NEW FIGURE' : 'LOOK', () => this.go('look')), el('span', 'mk-hint', 'CTRL+ENTER keep · ESC back'));
    box.append(actions);
    return box;
  }
}
