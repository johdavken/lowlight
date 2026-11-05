/**
 * The three-card modal (spec 2026-10-09 encounter cards §2), shared by ◆ DRAW's events and SUGGEST's
 * lines: a title over a panel of cards, ▲▼ to choose, Enter (or a click) to play one, R to deal again,
 * Esc to cancel, plus any keys of the use's own. It wears SET THE SCENE's look (scene.css) in the room.
 * Text goes in through textContent.
 */
import '../landing/scene.css';

export interface CardsCopy {
  title: string;
  loading: string;
  redraw: string;
  cancel: string;
  hints: string;
  /** Under the panel: what the cards were written from. */
  foot?: string;
}

/** What a card shows: a picture down its left edge (SUGGEST's angles), its title (and a few words beside it), its text, and anything below. */
export interface CardView {
  /** The picture's URL (3:4, cropped to fit). */
  art?: string;
  title: string;
  sub?: string;
  text: string | Node;
  extra?: Node;
}

export interface CardsPanelOptions<T> {
  copy: CardsCopy;
  /** The host's extra class (the use's colours). */
  hostClass?: string;
  header: string;
  /** A head of the use's own in place of the header line (the opening's pair). */
  head?: HTMLElement;
  /** Her model's label, at the header's right. */
  model?: string;
  /** A line under the header (SUGGEST's steer). */
  note?: string;
  /** A set already dealt: shown without a call. */
  cached: T[] | null;
  /** Deals a set; rejects with an Error. */
  load(): Promise<T[]>;
  card(item: T): CardView;
  /** A failed deal in the player's words (the raw reason goes to the console there). */
  failed(err: unknown): string;
  onPlay(item: T): void;
  onCancel(): void;
  /** A fresh set, for the room to keep until a new turn lands. */
  onCache(items: T[]): void;
  /** A key of the use's own on the chosen card (SUGGEST's E); true when it used the key. */
  extraKey?(key: string, item: T): boolean;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class CardsPanel<T> {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly refusal: HTMLElement;
  private options: T[] | null;
  private index = 0;
  private loading = false;
  private error: string | null = null;
  /** Bumped by every load and by destroy: a late answer for an older one is dropped. */
  private seq = 0;
  /**
   * The mouse has moved since the panel opened: only then does hovering a card choose it. The panel
   * opens under the mouse that clicked SUGGEST or DRAW, so a card under it isn't a choice.
   */
  private mouseMoved = false;

  constructor(host: HTMLElement, private readonly o: CardsPanelOptions<T>) {
    this.el = el('div', `encounter-host${o.hostClass ? ` ${o.hostClass}` : ''}`);
    const title = el('div', 'ep-title', o.copy.title);
    const panel = el('div', 'scene-panel encounter-panel');
    const head = o.head ?? el('div', 'sp-head');
    if (!o.head) {
      head.append(el('span', 'sp-who', o.header), el('span', 'sp-gap'));
      if (o.model) head.append(el('span', 'sp-model', o.model));
    }
    this.body = el('div', 'sp-body');
    this.refusal = el('div', 'sp-why');
    this.refusal.hidden = true;
    panel.append(head);
    if (o.note) panel.append(el('div', 'sp-note', o.note));
    panel.append(this.body, this.refusal);
    if (o.copy.foot) panel.append(el('div', 'ep-foot', o.copy.foot));
    this.el.append(title, panel, el('div', 'ep-hints', o.copy.hints));
    host.append(this.el);
    this.el.addEventListener('mousemove', () => (this.mouseMoved = true), { once: true });
    this.options = o.cached;
    if (this.options) this.render();
    else this.load();
  }

  /** The cards on screen: none while a load runs or after one failed. */
  private get shown(): T[] | null {
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
      if (shown) this.o.onPlay(shown[this.index]!);
    } else if (k === 'r' || k === 'R') this.load();
    else {
      const shown = this.shown;
      return shown && this.o.extraKey ? this.o.extraKey(k, shown[this.index]!) : false;
    }
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
        this.error = this.o.failed(err);
        this.render();
      },
    );
  }

  private render(): void {
    const C = this.o.copy;
    this.body.replaceChildren();
    if (this.loading) this.body.append(el('div', 'sp-loading', C.loading));
    else if (this.error) this.body.append(el('div', 'sp-error', this.error));
    else
      this.options?.forEach((item, i) => {
        const v = this.o.card(item);
        const card = el('div', `sp-card${i === this.index ? ' on' : ''}${v.art ? ' has-art' : ''}`);
        card.dataset.index = String(i);
        if (v.art) {
          const tile = el('div', 'sp-art');
          tile.style.backgroundImage = `url("${v.art}")`;
          card.append(tile);
        }
        const title = el('div', 'sp-title', v.title);
        if (v.sub) title.append(el('small', 'sp-sub-what', v.sub));
        const text = el('div', 'sp-card-text');
        if (typeof v.text === 'string') text.textContent = v.text;
        else text.append(v.text);
        card.append(el('span', 'sp-n', String(i + 1)), title, text);
        if (v.extra) card.append(v.extra);
        card.onclick = () => this.o.onPlay(item);
        card.onmouseenter = () => {
          if (!this.mouseMoved || this.index === i) return;
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
