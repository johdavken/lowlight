/**
 * The model step when a key is linked: the link line (CHANGE KEY, UNLINK), her current model (and a
 * reset to her default), the shipped picks, recent models and a search over the whole catalog. The
 * select screen routes keys here while it's up. Text goes in through textContent.
 */
import type { Pronoun } from '../../../shared/pronoun';
import type { ModelChoice, ModelEvent } from '../../../shared/types';
import type { LinkInfo, ModelLists } from '../net/link';
import { COPY } from './copy';

const SEARCH_MIN = 2;
const DEBOUNCE_MS = 150;

export type Row = { kind: 'current' | 'reset' | 'pick' | 'recent' | 'result'; id: string | null; label: string; price: string; why?: string };

const price = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
/** "$in / $out" per million tokens; "—" when neither is known. */
export function priceText(c: ModelChoice): string {
  return c.priceIn === null && c.priceOut === null ? '—' : `${price(c.priceIn)} / ${price(c.priceOut)}`;
}

const row = (kind: Row['kind'], c: ModelChoice): Row => ({ kind, id: c.id, label: c.label, price: priceText(c), ...(c.why ? { why: c.why } : {}) });

/** The rows in order: current, reset (when she's off her default), picks, recent, results; current, picks and recent list each model once. */
export function modelRows(d: { current: ModelChoice; def: ModelChoice; picks: ModelChoice[]; recent: ModelChoice[]; results: ModelChoice[]; pronoun?: Pronoun }): Row[] {
  const rows: Row[] = [row('current', d.current)];
  if (d.current.id !== d.def.id) rows.push({ kind: 'reset', id: null, label: COPY.link.reset(d.pronoun ?? 'they', d.def.label), price: '' });
  // Each model once: her current one isn't repeated under picks or recent, nor a pick under recent.
  const shown = new Set([d.current.id]);
  const fresh = (c: ModelChoice) => !shown.has(c.id) && Boolean(shown.add(c.id));
  rows.push(...d.picks.filter(fresh).map((p) => row('pick', p)));
  rows.push(...d.recent.filter(fresh).map((r) => row('recent', r)));
  rows.push(...d.results.map((r) => row('result', r)));
  return rows;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export interface ModelPanelOptions {
  link: LinkInfo;
  /** Hers, for "reset to her default" (absent: they). */
  pronoun?: Pronoun;
  agentModels: ModelEvent;
  search: (q: string) => Promise<ModelLists>;
  /** A model id, or null for "back to her default". */
  onPick: (id: string | null) => void;
  onBack: () => void;
  onChangeKey: () => void;
  onUnlink: () => void;
  debounceMs?: number;
}

const GROUP: Record<Row['kind'], keyof typeof COPY.link.groups> = { current: 'current', reset: 'current', pick: 'picks', recent: 'recent', result: 'results' };

export class ModelPanel {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly field: HTMLInputElement;
  private lists: ModelLists = { picks: [], recent: [], results: [] };
  private rows: Row[] = [];
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gone = false;
  private readonly current: ModelChoice;
  private readonly def: ModelChoice;

  constructor(host: HTMLElement, private readonly o: ModelPanelOptions) {
    const L = COPY.link;
    const e = o.agentModels;
    const choice = (id: string, label?: string): ModelChoice => e.choices?.find((c) => c.id === id) ?? { id, label: label ?? id.split('/').pop() ?? id, priceIn: null, priceOut: null };
    this.current = choice(e.model, e.label);
    this.def = choice(e.default ?? e.model);

    this.el = el('div', 'model-panel');
    const head = el('div', 'mp-link');
    const dot = el('span', 'mp-dot', '●');
    if (o.link.state !== 'ok') dot.dataset.state = o.link.state;
    const change = el('button', 'mp-change', L.changeKey);
    change.type = 'button';
    change.onclick = () => o.onChangeKey();
    const unlink = el('button', 'mp-unlink', L.unlink);
    unlink.type = 'button';
    let armed = false;
    unlink.onclick = () => {
      if (armed) return o.onUnlink();
      armed = true;
      unlink.textContent = L.unlinkConfirm;
    };
    head.append(dot, el('span', 'mp-line', L.linkLine(o.link.last4, o.link.credit)), el('span', 'mp-sp'), change, unlink);
    this.list = el('div', 'mp-list');
    const search = el('label', 'mp-search');
    this.field = el('input', '');
    this.field.readOnly = true; // typed through key(): the select screen owns the keyboard
    this.field.setAttribute('aria-label', L.search);
    search.append(el('span', 'mp-ic', L.search), this.field);
    this.el.append(head, this.list, search);
    if (o.link.state === 'no-credit') this.el.insertBefore(el('div', 'mp-warn', L.noCredit), this.list);
    host.append(this.el);
    this.render();
    void o.search('').then((r) => {
      if (this.gone) return;
      this.lists = { ...r, results: this.lists.results };
      this.render();
    }, () => {});
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.o.onBack();
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = this.index + (e.key === 'ArrowDown' ? 1 : -1);
      this.index = Math.max(0, Math.min(this.rows.length - 1, next));
      this.render();
      return true;
    }
    if (e.key === 'Enter') {
      const r = this.rows[this.index];
      if (r) this.o.onPick(r.id);
      return true;
    }
    if (e.key === 'Backspace') {
      this.setQuery(this.field.value.slice(0, -1));
      return true;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.setQuery(this.field.value + e.key);
      return true;
    }
    return false;
  }

  /** A listed model's label (search results included), or null when it isn't listed. */
  labelFor(id: string): string | null {
    return this.rows.find((r) => r.id === id)?.label ?? null;
  }

  destroy(): void {
    this.gone = true;
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }

  private setQuery(q: string): void {
    this.field.value = q;
    if (this.timer) clearTimeout(this.timer);
    if (q.trim().length < SEARCH_MIN) {
      this.lists = { ...this.lists, results: [] };
      this.render();
      return;
    }
    this.timer = setTimeout(() => {
      void this.o.search(q.trim()).then((r) => {
        // A slower, older answer must not replace a newer one.
        if (this.gone || this.field.value.trim() !== q.trim()) return;
        this.lists = { ...this.lists, results: r.results };
        this.render();
      }, () => {});
    }, this.o.debounceMs ?? DEBOUNCE_MS);
  }

  private render(): void {
    this.rows = modelRows({ current: this.current, def: this.def, ...this.lists, pronoun: this.o.pronoun });
    this.index = Math.min(this.index, this.rows.length - 1);
    this.list.replaceChildren();
    let group: string | null = null;
    this.rows.forEach((r, i) => {
      const g = GROUP[r.kind];
      if (g !== group) {
        group = g;
        this.list.append(el('div', 'mp-grp', COPY.link.groups[g]));
      }
      const n = el('div', `mp-row mp-${r.kind}${i === this.index ? ' on' : ''}`);
      n.append(el('span', 'mp-label', r.label), el('span', 'mp-price', r.price));
      if (r.why) n.append(el('span', 'mp-why', r.why));
      n.onclick = () => this.o.onPick(r.id);
      this.list.append(n);
    });
    if (this.field.value.trim().length >= SEARCH_MIN && this.lists.results.length === 0) this.list.append(el('div', 'mp-empty', COPY.link.searchEmpty));
    this.list.querySelector('.mp-row.on')?.scrollIntoView?.({ block: 'nearest' });
  }
}
