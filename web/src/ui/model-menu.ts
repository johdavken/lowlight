/**
 * A direct character's MODEL menu: her provider credit, the curated models with prices, and OTHER…
 * to search the catalog (or paste any id). Choosing sends `set_model`; the server answers with a new
 * `model` event, or `model_rejected`. Text goes in through textContent / value only.
 */
import type { ClientEvent, ModelChoice, ModelEvent } from '../../../shared/types';
import { searchModels } from '../net/link';

const SEARCH_MIN = 2;
const SEARCH_SHOWN = 8;
const DEBOUNCE_MS = 150;

const price = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const rejected = (reason: string): string | undefined =>
  reason === 'unknown-model' ? '// UNKNOWN MODEL' : undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class ModelMenu {
  private readonly panel = el('div', 'model-menu');
  private event: ModelEvent | null = null;
  private error = '';
  private typing = false;
  private input: HTMLInputElement | null = null;
  private readonly found = el('div', 'mm-found');
  private results: ModelChoice[] = [];
  /** The highlighted search result; -1 sends what's typed. */
  private hit = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The query the results answer. */
  private answered = '';
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.isOpen) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };

  constructor(
    root: HTMLElement,
    private readonly send: (e: ClientEvent) => void,
    private readonly search: (q: string) => Promise<{ results: ModelChoice[] }> = searchModels,
    private readonly debounceMs = DEBOUNCE_MS,
  ) {
    this.panel.hidden = true;
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    root.append(this.panel);
  }

  get isOpen(): boolean {
    return !this.panel.hidden;
  }

  update(e: ModelEvent): void {
    // An OTHER… id the server accepted: done.
    if (this.typing && this.event && e.model !== this.event.model) this.close();
    this.event = e;
    if (this.isOpen) this.render();
  }

  reject(reason: string): void {
    this.error = rejected(reason) ?? '// NOT CHANGED';
    if (this.isOpen) this.render();
  }

  open(): void {
    this.error = '';
    this.typing = false;
    this.input = null;
    this.results = [];
    this.answered = '';
    this.hit = -1;
    this.panel.hidden = false;
    this.render();
    window.addEventListener('keydown', this.onKey, true);
  }

  close(): void {
    this.panel.hidden = true;
    if (this.timer) clearTimeout(this.timer);
    window.removeEventListener('keydown', this.onKey, true);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private choose(id: string): void {
    this.send({ type: 'set_model', model: id });
  }

  private render(): void {
    const e = this.event;
    this.panel.replaceChildren();
    if (!e) return;
    if (typeof e.credit === 'number') this.panel.append(el('div', 'mm-credit', `$${e.credit.toFixed(2)} LEFT`));
    for (const c of e.choices ?? []) {
      const row = el('button', `mm-row${c.id === e.model ? ' current' : ''}`);
      row.type = 'button';
      row.title = c.id;
      row.append(el('span', 'mm-label', `${c.id === e.model ? '▸ ' : ''}${c.label}`), ' ', el('span', 'mm-price', `${price(c.priceIn)} / ${price(c.priceOut)}`));
      row.onclick = () => {
        this.choose(c.id);
        this.close();
      };
      this.panel.append(row);
    }
    if (this.typing) {
      // Kept across renders so a model event or a rejection doesn't drop what's typed.
      if (!this.input) this.input = this.makeInput();
      this.panel.append(this.input, this.found);
      this.renderFound();
      queueMicrotask(() => this.input?.focus());
    } else {
      const other = el('button', 'mm-other', 'OTHER…');
      other.type = 'button';
      other.onclick = () => {
        this.typing = true;
        this.render();
      };
      this.panel.append(other);
    }
    if (this.error) this.panel.append(el('div', 'mm-error', this.error));
  }

  private makeInput(): HTMLInputElement {
    const input = el('input', 'mm-input');
    input.placeholder = 'search models, or paste an id';
    input.addEventListener('input', () => this.query(input.value.trim()));
    input.addEventListener('keydown', (k) => {
      k.stopPropagation();
      if (k.key === 'ArrowDown' || k.key === 'ArrowUp') {
        k.preventDefault();
        const n = Math.min(this.results.length, SEARCH_SHOWN);
        this.hit = Math.max(-1, Math.min(n - 1, this.hit + (k.key === 'ArrowDown' ? 1 : -1)));
        this.renderFound();
      } else if (k.key === 'Enter') {
        k.preventDefault();
        const id = this.results[this.hit]?.id ?? input.value.trim();
        if (!id) return;
        this.error = '';
        this.choose(id);
      } else if (k.key === 'Escape') this.close();
    });
    return input;
  }

  private query(q: string): void {
    if (this.timer) clearTimeout(this.timer);
    if (q.length < SEARCH_MIN) {
      this.results = [];
      this.hit = -1;
      this.renderFound();
      return;
    }
    this.timer = setTimeout(() => {
      void this.search(q).then((r) => {
        // A slower, older answer must not replace a newer one.
        if (!this.isOpen || this.input?.value.trim() !== q) return;
        this.results = r.results;
        this.answered = q;
        // A pasted id that's listed stays the pick; otherwise the best match.
        const exact = r.results.slice(0, SEARCH_SHOWN).findIndex((c) => c.id === q);
        this.hit = exact >= 0 ? exact : r.results.length ? 0 : -1;
        this.renderFound();
      }, () => {});
    }, this.debounceMs);
  }

  private renderFound(): void {
    this.found.replaceChildren();
    this.results.slice(0, SEARCH_SHOWN).forEach((c, i) => {
      const row = el('button', `mm-row mm-hit${i === this.hit ? ' on' : ''}`);
      row.type = 'button';
      row.title = c.id;
      row.append(el('span', 'mm-label', c.label), ' ', el('span', 'mm-price', `${price(c.priceIn)} / ${price(c.priceOut)}`));
      row.onclick = () => {
        this.error = '';
        this.choose(c.id);
      };
      this.found.append(row);
    });
    const q = this.input?.value.trim() ?? '';
    if (q.length >= SEARCH_MIN && q === this.answered && !this.results.length) this.found.append(el('div', 'mm-none', 'NO MATCHES — ENTER SENDS THE ID'));
  }
}
