/**
 * ENCOUNTER (spec 2026-10-09 encounter cards §2): from ◆ DRAW in the room, three events her model
 * deals for this moment. Enter plays one (she reacts at once), R redraws, Esc cancels. It wears
 * SET THE SCENE's look (scene.css) in the room. Text goes in through textContent.
 */
import type { Encounter } from '../../../shared/encounter';
import { NarratorFailure } from '../net/scenario';
import { her } from './her-copy';
import '../landing/scene.css';

export const ENCOUNTER_COPY = {
  title: 'ENCOUNTER',
  loading: '// DEALING THREE EVENTS…',
  failed: (why: string) => `// COULDN'T DEAL EVENTS — ${why}`,
  redraw: '↻ REDRAW',
  cancel: '[ESC] CANCEL',
  hints: '[▲▼] CHOOSE · [ENTER] PLAY · [R] REDRAW · [ESC] CANCEL',
  foot: "Written from: the room's lore and art, the time and weather, both public files, who else is here, and the last 8 lines.",
  noKey: 'Link a key at select to have events dealt.',
} as const;

/** The header's who's-here part: `SILAS IS HERE`, `HAE, SILAS ARE HERE`; null with no one else here. */
export function hereLine(names: string[]): string | null {
  if (names.length === 0) return null;
  return `${names.map((n) => n.toUpperCase()).join(', ')} ${names.length === 1 ? 'IS' : 'ARE'} HERE`;
}

/** A refusal shown as it is (no key, busy), not as // COULDN'T DEAL EVENTS. */
export class EncounterNotice extends Error {}

export interface EncounterPanelOptions {
  /** "<YOU> × <HER> · <ROOM> · <TIME> · <WEATHER>[ · <OTHERS> IS|ARE HERE]" */
  header: string;
  /** Her model's label, at the header's right. */
  model?: string;
  /** A set already dealt (and not yet played past): shown without a call. */
  cached: Encounter[] | null;
  /** Deals three; rejects with an Error (or an EncounterNotice). */
  load(): Promise<Encounter[]>;
  onPlay(e: Encounter): void;
  onCancel(): void;
  /** A fresh set, for the room to keep until a new turn lands. */
  onCache(e: Encounter[]): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class EncounterPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly refusal: HTMLElement;
  private options: Encounter[] | null;
  private index = 0;
  private loading = false;
  private error: string | null = null;
  /** Bumped by every load and by destroy: a late answer for an older one is dropped. */
  private seq = 0;

  constructor(host: HTMLElement, private readonly o: EncounterPanelOptions) {
    this.el = el('div', 'encounter-host');
    const title = el('div', 'ep-title', ENCOUNTER_COPY.title);
    const panel = el('div', 'scene-panel encounter-panel');
    const head = el('div', 'sp-head');
    head.append(el('span', 'sp-who', o.header), el('span', 'sp-gap'));
    if (o.model) head.append(el('span', 'sp-model', o.model));
    this.body = el('div', 'sp-body');
    this.refusal = el('div', 'sp-why');
    this.refusal.hidden = true;
    panel.append(head, this.body, this.refusal, el('div', 'ep-foot', ENCOUNTER_COPY.foot));
    this.el.append(title, panel, el('div', 'ep-hints', ENCOUNTER_COPY.hints));
    host.append(this.el);
    this.options = o.cached;
    if (this.options) this.render();
    else this.load();
  }

  /** The cards on screen: none while a load runs or after one failed. */
  private get shown(): Encounter[] | null {
    return this.loading || this.error ? null : this.options;
  }

  /** The panel's keys; true when it used the key. */
  key(e: KeyboardEvent): boolean {
    const k = e.key;
    if (k === 'Escape') this.o.onCancel();
    else if (k === 'ArrowDown' || k === 'ArrowUp') {
      const shown = this.shown;
      if (!shown) return true;
      this.index = Math.max(0, Math.min(shown.length - 1, this.index + (k === 'ArrowDown' ? 1 : -1)));
      this.render();
    } else if (k === 'Enter') {
      const shown = this.shown;
      if (shown) this.o.onPlay(shown[this.index]);
    } else if (k === 'r' || k === 'R') this.load();
    else return false;
    return true;
  }

  /** The server refused the play (busy, no key): said under the cards, which stay. */
  showRefusal(text: string): void {
    this.refusal.textContent = text;
    this.refusal.hidden = false;
  }

  destroy(): void {
    this.seq++;
    this.el.remove();
  }

  private load(): void {
    // One deal at a time: R while one runs would pay for a second.
    if (this.loading) return;
    const seq = ++this.seq;
    this.loading = true;
    this.error = null;
    this.refusal.hidden = true;
    this.render();
    this.o.load().then(
      (options) => {
        if (seq !== this.seq) return;
        this.loading = false;
        this.options = options;
        this.index = 0;
        this.o.onCache(options);
        this.render();
      },
      (err: unknown) => {
        if (seq !== this.seq) return;
        this.loading = false;
        if (err instanceof EncounterNotice) this.error = err.message;
        else {
          // Plain words for the player (spec 2026-10-14 §4).
          this.error = ENCOUNTER_COPY.failed(her().encounters.failedWhy(err instanceof NarratorFailure ? err.kind : 'unknown'));
          // The raw reason is for whoever's debugging, never on screen (spec 2026-10-14 §1).
          console.warn('[narrator] events:', err instanceof Error ? err.message : String(err));
        }
        this.render();
      },
    );
  }

  private render(): void {
    const C = ENCOUNTER_COPY;
    this.body.replaceChildren();
    if (this.loading) this.body.append(el('div', 'sp-loading', C.loading));
    else if (this.error) this.body.append(el('div', 'sp-error', this.error));
    else
      this.options?.forEach((e, i) => {
        const card = el('div', `sp-card${i === this.index ? ' on' : ''}`);
        card.dataset.index = String(i);
        card.append(el('span', 'sp-n', String(i + 1)), el('div', 'sp-title', e.title), el('div', 'sp-card-text', e.text));
        if (e.stranger) {
          const who = el('span', 'ep-who', `+ ${e.stranger.name.toUpperCase()}`);
          who.append(el('em', 'ep-voice', e.stranger.voice));
          card.append(who);
        }
        card.onclick = () => this.o.onPlay(e);
        card.onmouseenter = () => {
          if (this.index === i) return;
          this.index = i;
          this.render();
        };
        this.body.append(card);
      });
    const row = el('div', 'sp-options');
    const redraw = el('button', 'sp-reroll', C.redraw);
    redraw.type = 'button';
    redraw.onclick = () => this.load();
    const cancel = el('button', 'sp-cancel', C.cancel);
    cancel.type = 'button';
    cancel.onclick = () => this.o.onCancel();
    row.append(redraw, cancel);
    this.body.append(row);
  }
}
