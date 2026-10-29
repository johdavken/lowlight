/**
 * The YOU step (spec 2026-10-08 playable persona §2): after 1P locks, who you are on that character.
 * PLAY AS <NAME> keeps them as written; EDIT starts from their name and file; CUSTOM from nothing.
 * The rows read the select screen's keys; while the form is open its fields type for themselves
 * (key() leaves every key but Esc and Ctrl/⌘+Enter to them). Text goes in through textContent/value.
 */
import { capAtWordBoundary, PERSONA_BACKGROUND_MAX, PERSONA_NAME_MAX, type PlaythroughPersona } from '../../../shared/persona';
import { PRONOUNS, type Pronoun } from '../../../shared/pronoun';
import { COPY } from './copy';
import './you.css';

type Kind = 'as' | 'edit' | 'custom';
const KINDS: Kind[] = ['as', 'edit', 'custom'];

/** The character's file as EDIT's starting point: their name, and tagline then bio paragraphs (blank lines between), capped on a word. */
export function editPrefill(a: { name: string; tagline: string; bio: string[] }): PlaythroughPersona {
  const background = [a.tagline, ...a.bio].map((s) => s.trim()).filter(Boolean).join('\n\n');
  return { name: a.name, background: capAtWordBoundary(background, PERSONA_BACKGROUND_MAX) };
}

export interface YouPanelOptions {
  character: { name: string; pronoun: Pronoun; tagline: string; bio: string[] };
  /** The persona already chosen (back from 2P): the form opens with it. */
  initial: PlaythroughPersona | null;
  /** null: play as them. */
  onChoose: (p: PlaythroughPersona | null) => void;
  onBack: () => void;
  /** The form opened or closed (the select screen's hints follow it). */
  onChange?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class YouPanel {
  readonly el: HTMLElement;
  private index = 0;
  /** The open form: what it started from (EDIT unchanged chooses none). Null: the rows. */
  private form: {
    kind: 'edit' | 'custom';
    start: PlaythroughPersona;
    name: HTMLInputElement;
    /** Their pronoun as picked (the character's until changed). */
    pronoun: Pronoun;
    background: HTMLTextAreaElement;
    confirm: HTMLButtonElement;
    count: HTMLElement;
  } | null = null;

  constructor(host: HTMLElement, private readonly o: YouPanelOptions) {
    this.el = el('div', 'you-panel');
    host.append(this.el);
    if (o.initial) this.openForm(o.initial.kind ?? 'custom', o.initial);
    else this.renderRows();
  }

  /** True when the key was the panel's; false leaves it to a focused field (or nothing). */
  key(e: KeyboardEvent): boolean {
    if (this.form) {
      if (e.key === 'Escape') {
        this.closeForm();
        return true;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        this.confirm();
        return true;
      }
      return false;
    }
    if (e.key === 'Escape') {
      this.o.onBack();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      this.index = Math.max(0, Math.min(KINDS.length - 1, this.index + (e.key === 'ArrowDown' ? 1 : -1)));
      this.renderRows();
      return true;
    }
    if (e.key === 'Enter') {
      this.pick(KINDS[this.index]);
      return true;
    }
    return false;
  }

  /** Puts the keys in the form's name field when it's open (the panel may be built before it's in the page). */
  focus(): void {
    this.form?.name.focus();
  }

  /** True while the NAME / BACKGROUND form is open. */
  get editing(): boolean {
    return this.form !== null;
  }

  destroy(): void {
    this.el.remove();
  }

  private label(kind: Kind): string {
    const Y = COPY.you;
    return kind === 'as' ? Y.playAs(this.o.character.name) : kind === 'edit' ? Y.edit : Y.custom;
  }

  private renderRows(): void {
    this.form = null;
    this.el.replaceChildren();
    const list = el('div', 'yp-list');
    KINDS.forEach((kind, i) => {
      const row = el('div', `yp-row${i === this.index ? ' on' : ''}`, this.label(kind));
      row.dataset.kind = kind;
      row.onclick = () => {
        this.index = i;
        this.pick(kind);
      };
      list.append(row);
    });
    this.el.append(list);
  }

  private pick(kind: Kind): void {
    if (kind === 'as') return this.o.onChoose(null);
    this.openForm(kind, kind === 'edit' ? editPrefill(this.o.character) : { name: '', background: '' });
  }

  private openForm(kind: 'edit' | 'custom', start: PlaythroughPersona): void {
    const Y = COPY.you;
    this.el.replaceChildren();
    const box = el('div', 'yp-form');
    const name = el('input', 'yp-name');
    name.maxLength = PERSONA_NAME_MAX;
    name.value = start.name;
    name.setAttribute('aria-label', Y.name);
    const background = el('textarea', 'yp-background');
    background.maxLength = PERSONA_BACKGROUND_MAX;
    background.value = start.background;
    background.placeholder = Y.placeholder;
    background.setAttribute('aria-label', Y.background);
    // SHE · HE · THEY: buttons in the form's tab order, like its fields; the character's until changed.
    const pronouns = el('div', 'yp-pronoun');
    const press = () => pronouns.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pronoun === this.form?.pronoun)));
    for (const p of PRONOUNS) {
      const b = el('button', 'yp-pronoun-btn', p.toUpperCase());
      b.type = 'button';
      b.dataset.pronoun = p;
      b.onclick = () => {
        if (!this.form) return;
        this.form.pronoun = p;
        press();
      };
      pronouns.append(b);
    }
    const count = el('div', 'yp-count');
    const confirm = el('button', 'yp-confirm', Y.confirm);
    confirm.type = 'button';
    confirm.onclick = () => this.confirm();
    const back = el('button', 'yp-back', Y.back);
    back.type = 'button';
    back.onclick = () => this.closeForm();
    const buttons = el('div', 'yp-buttons');
    buttons.append(confirm, back);
    box.append(el('label', 'yp-label', Y.name), name, el('label', 'yp-label', Y.pronoun), pronouns, el('label', 'yp-label', Y.background), background, count, buttons);
    this.el.append(box);
    this.form = { kind, start, name, pronoun: start.pronoun ?? this.o.character.pronoun, background, confirm, count };
    press();
    const sync = () => this.sync();
    name.addEventListener('input', sync);
    background.addEventListener('input', sync);
    this.sync();
    name.focus();
    this.o.onChange?.();
  }

  private sync(): void {
    const f = this.form;
    if (!f) return;
    f.count.textContent = COPY.you.count(f.background.value.length);
    f.confirm.disabled = f.name.value.trim() === '';
  }

  private closeForm(): void {
    this.renderRows();
    this.o.onChange?.();
  }

  private confirm(): void {
    const f = this.form;
    if (!f || f.confirm.disabled) return;
    // Their pronoun is kept only when it differs from the character's (a later change to hers then still applies).
    const own = f.pronoun !== this.o.character.pronoun;
    const chosen: PlaythroughPersona = { name: f.name.value.trim(), background: f.background.value.trim(), kind: f.kind, ...(own ? { pronoun: f.pronoun } : {}) };
    // EDIT left as the character is written is playing as him (none), even when reopened.
    const as = editPrefill(this.o.character);
    const unchanged = f.kind === 'edit' && !own && chosen.name === as.name.trim() && chosen.background === as.background.trim();
    this.o.onChoose(unchanged ? null : chosen);
  }
}
