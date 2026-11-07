/**
 * The model step: a band where the grid stood, with three tabs. FOR HER (her current model, a reset to
 * her default, the shipped picks, recent models), ALL MODELS (the whole catalog by vendor, sorted and
 * searched here) and KEYS (a row per backend, a key field opening inside it). The select screen routes
 * keys here while it's up. Text goes in through textContent.
 */
import type { Pronoun } from '../../../shared/pronoun';
import type { ModelChoice, ModelEvent } from '../../../shared/types';
import { PROVIDERS, type LinkError, type LinkInfo, type ModelBrowse, type Provider } from '../net/link';
import { COPY } from './copy';
import './model-band.css';

const LINKED_BEAT_MS = 700;
const PAGE_ROWS = 10;

export type BandTab = 'her' | 'all' | 'keys';
export type SortCol = 'name' | 'context' | 'price';
type ListRow = { kind: 'current' | 'reset' | 'pick' | 'recent'; id: string | null; label: string; price: string; why?: string; via?: boolean };

const price = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
/** "$in / $out" per million tokens; "—" when neither is known; FREE when both are nothing. */
export function priceText(c: ModelChoice): string {
  if (c.priceIn === 0 && c.priceOut === 0) return COPY.link.free;
  return c.priceIn === null && c.priceOut === null ? '—' : `${price(c.priceIn)} / ${price(c.priceOut)}`;
}

/** How much a model holds: 131K, 1M, 1.5M; "—" when the provider doesn't say. */
export function contextText(n: number | undefined): string {
  if (n === undefined) return '—';
  return n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : `${Math.round(n / 1000)}K`;
}

/** The maker in a model's id: `~openai/x` is OpenAI's, and Meta ships under two names. */
export function vendorOf(id: string): string {
  const v = id.split('/')[0]!.replace(/^~/, '');
  return v === 'meta-llama' ? 'meta' : v;
}

const VENDOR_NAMES: Record<string, string> = { 'z-ai': 'Z.AI', mistralai: 'MISTRAL', moonshotai: 'MOONSHOT', 'x-ai': 'XAI', 'bytedance-seed': 'BYTEDANCE', 'aion-labs': 'AION' };
export const vendorName = (v: string): string => VENDOR_NAMES[v] ?? v.toUpperCase();

const row = (kind: ListRow['kind'], c: ModelChoice): ListRow => ({ kind, id: c.id, label: c.label, price: priceText(c), ...(c.why ? { why: c.why } : {}), ...(c.via ? { via: true } : {}) });

/** FOR HER's rows in order: current, reset (when she's off her default), picks, recent; each model once. */
export function modelRows(d: { current: ModelChoice; def: ModelChoice; picks: ModelChoice[]; recent: ModelChoice[]; pronoun?: Pronoun }): ListRow[] {
  const rows: ListRow[] = [row('current', d.current)];
  if (d.current.id !== d.def.id) rows.push({ kind: 'reset', id: null, label: COPY.link.reset(d.pronoun ?? 'they', d.def.label), price: '' });
  // Her current one isn't repeated under picks or recent, nor a pick under recent.
  const shown = new Set([d.current.id]);
  const fresh = (c: ModelChoice) => !shown.has(c.id) && Boolean(shown.add(c.id));
  rows.push(...d.picks.filter(fresh).map((p) => row('pick', p)));
  rows.push(...d.recent.filter(fresh).map((r) => row('recent', r)));
  return rows;
}

/** ALL MODELS' rows: one vendor (or null for all), a search over id and name, in the chosen order. An unknown value sorts last either way. */
export function browseRows(all: ModelChoice[], o: { vendor: string | null; query: string; sort: SortCol; flip: boolean }): ModelChoice[] {
  const q = o.query.trim().toLowerCase();
  const out = all.filter((m) => (o.vendor === null || vendorOf(m.id) === o.vendor) && (!q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)));
  const sign = o.flip ? -1 : 1;
  const value = (m: ModelChoice): number | null => {
    if (o.sort === 'context') return m.context === undefined ? null : -m.context; // the most first
    return m.priceIn === null && m.priceOut === null ? null : (m.priceIn ?? 0) + (m.priceOut ?? 0);
  };
  if (o.sort === 'name') return out.sort((a, b) => sign * a.label.localeCompare(b.label));
  return out.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === y ? a.label.localeCompare(b.label) : x === null ? 1 : -1;
    return sign * (x - y) || a.label.localeCompare(b.label);
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(cls: string, text: string, onclick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.onclick = onclick;
  return b;
}

export interface ModelBandOptions {
  links: Record<Provider, LinkInfo>;
  /** Hers, for FOR HER and "reset to her default" (absent: they). */
  pronoun?: Pronoun;
  agentModels: ModelEvent;
  /** She has no key yet: KEYS only, the field open, and nothing to browse. */
  needsKey: boolean;
  /** The tab it opens on (default FOR HER). */
  tab?: BandTab;
  browse: () => Promise<ModelBrowse>;
  put: (apiKey: string, provider: Provider) => Promise<LinkInfo | { error: LinkError }>;
  /** A model id, or null for "back to her default". */
  onPick: (id: string | null) => void;
  onBack: () => void;
  onLinked: (info: LinkInfo, provider: Provider) => void;
  onUnlink: (provider: Provider) => void;
  /** The tab or the open key field changed: the title and hints follow. */
  onChange: () => void;
  /** How long "linked · $x" shows before moving on (tests: 0). */
  beatMs?: number;
}

export class ModelBand {
  readonly el: HTMLElement;
  private readonly tabs = new Map<BandTab, HTMLButtonElement>();
  private readonly summary: HTMLElement;
  private readonly body: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly search: HTMLElement;
  private readonly field: HTMLInputElement;
  private readonly current: ModelChoice;
  private readonly def: ModelChoice;
  private _tab: BandTab;
  private gone = false;

  private picks: ModelChoice[] = [];
  private recent: ModelChoice[] = [];
  /** The whole catalog: undefined while it loads, null when it can't be read. */
  private all: ModelChoice[] | null | undefined = undefined;

  private herRows: ListRow[] = [];
  private herIndex = 0;

  private shown: ModelChoice[] = [];
  private allIndex = 0;
  private vendors: (string | null)[] = [null];
  private vendorIndex = 0;
  /** ALL MODELS' arrows move the vendors, not the models. */
  private onVendors = false;
  /** There's a search on: a vendor picked during it narrows it. */
  private searching = false;
  private sort: SortCol = 'price';
  private flip = false;
  private listEl: HTMLElement | null = null;
  private vendorEl: HTMLElement | null = null;

  private keyIndex = 0;
  private keyOpen: Provider | null = null;
  private pending = false;
  private keyInput: HTMLInputElement | null = null;
  private keyButton: HTMLButtonElement | null = null;
  private keyMsg: HTMLElement | null = null;

  constructor(host: HTMLElement, private readonly o: ModelBandOptions) {
    const L = COPY.link;
    const e = o.agentModels;
    const choice = (id: string, label?: string): ModelChoice => e.choices?.find((c) => c.id === id) ?? { id, label: label ?? id.split('/').pop() ?? id, priceIn: null, priceOut: null };
    this.current = choice(e.model, e.label);
    this.def = choice(e.default ?? e.model);
    this._tab = o.needsKey ? 'keys' : (o.tab ?? 'her');
    if (o.needsKey) {
      this.keyOpen = 'openrouter';
      this.all = null;
    }

    this.el = el('div', 'model-band');
    const bar = el('div', 'mb-tabs');
    bar.setAttribute('role', 'tablist');
    const tabs: BandTab[] = ['her', 'all', 'keys'];
    for (const t of tabs) {
      const b = button('mb-tab', '', () => this.setTab(t));
      b.dataset.tab = t;
      b.setAttribute('role', 'tab');
      b.disabled = o.needsKey && t !== 'keys';
      this.tabs.set(t, b);
      bar.append(b);
    }
    this.summary = el('div', 'mb-summary');
    bar.append(el('span', 'mp-sp'), this.summary);
    this.body = el('div', 'mb-body');
    this.search = el('label', 'mp-search');
    this.field = el('input', '');
    this.field.setAttribute('aria-label', L.search);
    this.field.autocomplete = 'off';
    this.field.spellcheck = false;
    // A key typed here reaches key(); a phone's keyboard only says what the field now holds.
    this.field.addEventListener('input', () => this.setQuery(this.field.value));
    this.search.append(el('span', 'mp-ic', L.search), this.field);
    this.foot = el('div', 'mb-foot');
    this.foot.append(
      this.search,
      button('mb-back', L.back, () => this.back()),
    );
    this.el.append(bar, this.body, this.foot);
    // A mouse press leaves the keyboard where it was: Enter still picks the marked row, not the button just clicked.
    this.el.addEventListener('mousedown', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) ev.preventDefault();
    });
    host.append(this.el);
    this.renderSummary();
    this.render();

    if (o.needsKey) return;
    void o.browse().then(
      (r) => {
        if (this.gone) return;
        this.picks = r.picks;
        this.recent = r.recent;
        this.all = r.all;
        this.vendors = [null, ...this.vendorCounts().map(([v]) => v)];
        this.loaded();
      },
      () => {
        if (this.gone) return;
        this.all = null;
        this.loaded();
      },
    );
  }

  get tab(): BandTab {
    return this._tab;
  }

  /** The title over the step. */
  get title(): string {
    if (this.o.needsKey) return COPY.link.titleLink;
    return this._tab === 'keys' ? COPY.link.titleKeys : COPY.link.titleModel(this.o.pronoun ?? 'they');
  }

  get hint(): string {
    if (this.keyOpen) return COPY.link.hintLink;
    return this._tab === 'keys' ? COPY.link.hintKeys : COPY.link.hint;
  }

  key(e: KeyboardEvent): boolean {
    // A button reached with Tab answers Enter and Space itself.
    const held = document.activeElement instanceof HTMLButtonElement && this.el.contains(document.activeElement) ? document.activeElement : null;
    if (held && (e.key === 'Enter' || e.key === ' ')) return false;
    // The arrows take the keyboard back to the rows, so Enter means the row again.
    if (held && /^(Arrow|Page)/.test(e.key)) held.blur();
    // An open key field keeps its keys: Enter links, Esc closes it.
    if (this.keyOpen) {
      if (e.key === 'Enter') {
        this.submit();
        return true;
      }
      if (e.key === 'Escape') {
        this.back();
        return true;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return false;
      // Typing with the field unfocused (after a click elsewhere): back into the field, which takes the key.
      const typing = e.key.length === 1 && !e.altKey && (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() === 'v');
      if (typing && document.activeElement !== this.keyInput && !this.pending) this.keyInput?.focus();
      return false;
    }
    if (e.key === 'Escape') {
      this.back();
      return true;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // With words in the search they move the caret, to fix a typo.
      if (document.activeElement === this.field && this.field.value !== '') return false;
      this.stepTab(e.key === 'ArrowRight' ? 1 : -1);
      return true;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      this.move(e.key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      this.move(e.key === 'PageDown' ? PAGE_ROWS : -PAGE_ROWS);
      return true;
    }
    if (e.key === 'Tab') {
      if (this._tab !== 'all') return false;
      held?.blur();
      this.onVendors = !this.onVendors;
      this.markFocus();
      return true;
    }
    if (e.key === 'Enter') {
      this.enter();
      return true;
    }
    // In the field, editing is the field's: its `input` tells the list. Elsewhere a letter starts a search there.
    if (document.activeElement === this.field) return false;
    if (e.key === 'Backspace') {
      this.setQuery(this.field.value.slice(0, -1), true);
      return true;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.field.focus();
      this.setQuery(this.field.value + e.key, true);
      return true;
    }
    return false;
  }

  /** A listed model's label, or null when it isn't listed. */
  labelFor(id: string): string | null {
    return this.herRows.find((r) => r.id === id)?.label ?? this.all?.find((m) => m.id === id)?.label ?? null;
  }

  destroy(): void {
    this.gone = true;
    this.el.remove();
  }

  private vendorCounts(): [string, number][] {
    const n = new Map<string, number>();
    for (const m of this.all ?? []) n.set(vendorOf(m.id), (n.get(vendorOf(m.id)) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /** Esc and the on-screen BACK, one level at a time: an open key field, a search, then the step. */
  private back(): void {
    if (this.pending) return;
    if (this.keyOpen) this.escapeKey();
    else if (this.field.value !== '') this.setQuery('', true);
    else this.o.onBack();
  }

  /** The catalog came: the tab's count, and the list if it's showing. KEYS is left alone, a key may be half typed. */
  private loaded(): void {
    this.renderTabs();
    if (this._tab !== 'keys') this.render();
  }

  private setTab(t: BandTab): void {
    if (this.pending || this.tabs.get(t)!.disabled || t === this._tab) return;
    // A search belongs to ALL MODELS: left behind it would sit unseen.
    if (this._tab === 'all') {
      this.field.value = '';
      this.searching = false;
    }
    this._tab = t;
    if (t !== 'keys') this.closeKey();
    this.render();
    this.o.onChange();
  }

  private stepTab(by: number): void {
    const open = [...this.tabs].filter(([, b]) => !b.disabled).map(([t]) => t);
    const next = open[open.indexOf(this._tab) + by];
    if (next) this.setTab(next);
  }

  private setQuery(q: string, typed = false): void {
    if (typed) this.field.value = q;
    // A new search is over everything, whatever vendor was left picked.
    if (!this.searching && q !== '') this.vendorIndex = 0;
    this.searching = q !== '';
    if (this._tab !== 'all' && q !== '') this.setTab('all');
    this.allIndex = 0;
    if (this._tab === 'all') {
      this.renderVendors();
      this.fillList();
    }
  }

  private move(by: number): void {
    if (this._tab === 'her') {
      this.herIndex = this.markRow(this.herIndex, this.herIndex + by, this.herRows.length);
    } else if (this._tab === 'keys') {
      this.keyIndex = Math.max(0, Math.min(PROVIDERS.length - 1, this.keyIndex + by));
      this.render();
    } else if (this.onVendors) {
      this.vendorIndex = Math.max(0, Math.min(this.vendors.length - 1, this.vendorIndex + by));
      this.allIndex = 0;
      this.renderVendors();
      this.fillList();
    } else {
      this.allIndex = this.markRow(this.allIndex, this.allIndex + by, this.shown.length);
    }
  }

  /** Moves the mark between the rows on screen (a long list isn't redrawn for it); the row it landed on. */
  private markRow(from: number, to: number, length: number): number {
    const at = Math.max(0, Math.min(length - 1, to));
    const rows = this.body.querySelectorAll<HTMLElement>('.mp-row');
    rows[from]?.classList.remove('on');
    rows[at]?.classList.add('on');
    rows[at]?.scrollIntoView?.({ block: 'nearest' });
    return at;
  }

  private enter(): void {
    if (this._tab === 'her') {
      const r = this.herRows[this.herIndex];
      if (r) this.o.onPick(r.id);
    } else if (this._tab === 'keys') {
      this.openKey(PROVIDERS[this.keyIndex]!);
    } else if (this.onVendors) {
      this.onVendors = false;
      this.markFocus();
    } else {
      const m = this.shown[this.allIndex];
      if (m) this.o.onPick(m.id);
    }
  }

  private renderTabs(): void {
    const L = COPY.link;
    this.tabs.get('her')!.textContent = L.tabHer(this.o.pronoun ?? 'they');
    this.tabs.get('all')!.textContent = L.tabAll(this.all?.length ?? null);
    this.tabs.get('keys')!.textContent = L.tabKeys;
    for (const [t, b] of this.tabs) b.setAttribute('aria-selected', String(t === this._tab));
  }

  private render(): void {
    this.renderTabs();
    this.el.dataset.tab = this._tab;
    this.search.hidden = this._tab === 'keys';
    this.listEl = null;
    this.vendorEl = null;
    if (this._tab === 'her') this.renderHer();
    else if (this._tab === 'all') this.renderAll();
    else this.renderKeys();
  }

  private renderSummary(): void {
    const L = COPY.link;
    this.summary.replaceChildren();
    if (this.o.needsKey) {
      this.summary.textContent = L.tileTag;
      return;
    }
    for (const p of PROVIDERS) {
      const info = this.o.links[p];
      if (!info.linked) continue;
      const dot = el('span', 'mp-dot', '●');
      if (info.state !== 'ok') dot.dataset.state = info.state;
      this.summary.append(dot, ` ${L.providers[p]} `);
      if (info.state === 'no-credit') this.summary.append(el('span', 'mp-warn', L.noCreditShort), ' ');
      else if (info.credit !== null) this.summary.append(`$${info.credit.toFixed(2)} `);
    }
  }

  private renderHer(): void {
    const L = COPY.link;
    this.herRows = modelRows({ current: this.current, def: this.def, picks: this.picks, recent: this.recent, pronoun: this.o.pronoun });
    this.herIndex = Math.min(this.herIndex, this.herRows.length - 1);
    const left = el('div', 'mb-col');
    const right = el('div', 'mb-col');
    let group: string | null = null;
    this.herRows.forEach((r, i) => {
      const g = r.kind === 'reset' ? 'current' : r.kind === 'pick' ? 'picks' : r.kind;
      const col = r.kind === 'recent' ? right : left;
      if (g !== group) {
        group = g;
        col.append(el('div', 'mp-grp', L.groups[g as keyof typeof L.groups]));
      }
      const n = el('div', `mp-row mp-${r.kind}${i === this.herIndex ? ' on' : ''}`);
      n.append(el('span', 'mp-label', r.label), el('span', 'mp-price', r.price));
      if (r.why) n.append(el('span', 'mp-why', r.why));
      if (r.via) n.append(el('span', 'mp-via', L.via));
      n.onclick = () => this.o.onPick(r.id);
      col.append(n);
    });
    const cols = el('div', 'mb-cols');
    cols.append(left, right);
    this.body.replaceChildren(cols);
  }

  private renderAll(): void {
    const L = COPY.link;
    if (this.all === undefined || this.all === null) {
      this.body.replaceChildren(el('div', 'mp-empty', this.all === null ? L.catalogOffline : L.loading));
      return;
    }
    this.vendorEl = el('div', 'mb-vendors');
    const main = el('div', 'mb-main');
    const heads = el('div', 'mb-heads');
    const cols: [SortCol, string][] = [['name', L.heads.model], ['context', L.heads.memory], ['price', L.heads.price]];
    for (const [c, text] of cols) {
      const h = button(`mb-head${this.sort === c ? ' on' : ''}`, text, () => {
        this.flip = this.sort === c ? !this.flip : false;
        this.sort = c;
        this.allIndex = 0;
        this.render();
      });
      h.dataset.sort = c;
      heads.append(h);
    }
    this.listEl = el('div', 'mp-list');
    main.append(heads, this.listEl);
    const wrap = el('div', 'mb-browse');
    wrap.append(this.vendorEl, main);
    this.body.replaceChildren(wrap);
    this.renderVendors();
    this.fillList();
    this.markFocus();
  }

  private renderVendors(): void {
    if (!this.vendorEl) return;
    const counts = new Map(this.vendorCounts());
    const rows = this.vendors.map((v, i) => {
      const n = el('button', `mb-ven${i === this.vendorIndex ? ' on' : ''}`);
      n.type = 'button';
      n.dataset.vendor = v ?? '';
      n.append(el('span', '', v === null ? COPY.link.allVendors : vendorName(v)), el('small', '', String(v === null ? (this.all?.length ?? 0) : (counts.get(v) ?? 0))));
      n.onclick = () => {
        this.vendorIndex = i;
        this.allIndex = 0;
        this.renderVendors();
        this.fillList();
      };
      return n;
    });
    this.vendorEl.replaceChildren(...rows);
    this.vendorEl.querySelector('.mb-ven.on')?.scrollIntoView?.({ block: 'nearest' });
  }

  private fillList(): void {
    if (!this.listEl) return;
    const L = COPY.link;
    this.shown = browseRows(this.all ?? [], { vendor: this.vendors[this.vendorIndex] ?? null, query: this.field.value, sort: this.sort, flip: this.flip });
    this.allIndex = Math.max(0, Math.min(this.allIndex, this.shown.length - 1));
    const rows = this.shown.map((m, i) => {
      const n = el('div', `mp-row${m.id === this.current.id ? ' mp-current' : ''}${i === this.allIndex ? ' on' : ''}`);
      n.dataset.id = m.id;
      n.append(el('span', 'mp-label', m.label), el('span', 'mp-mem', contextText(m.context)), el('span', 'mp-price', priceText(m)));
      if (m.via) n.append(el('span', 'mp-via', L.via));
      n.onclick = () => this.o.onPick(m.id);
      return n;
    });
    this.listEl.replaceChildren(...rows);
    if (rows.length === 0) this.listEl.append(el('div', 'mp-empty', L.searchEmpty));
    // Enter picks the marked row, so it stays on screen.
    rows[this.allIndex]?.scrollIntoView?.({ block: 'nearest' });
  }

  private markFocus(): void {
    this.vendorEl?.classList.toggle('focus', this.onVendors);
    this.listEl?.classList.toggle('focus', !this.onVendors);
  }

  private side(p: Provider): { why: string; fieldLabel: string; getKey: string; href: string } {
    const L = COPY.link;
    return p === 'anthropic' ? L.anthropic : { why: L.why, fieldLabel: L.fieldLabel, getKey: L.getKey, href: 'https://openrouter.ai/keys' };
  }

  private renderKeys(): void {
    const L = COPY.link;
    this.keyInput = null;
    this.keyButton = null;
    this.keyMsg = null;
    const rows = PROVIDERS.map((p, i) => {
      const info = this.o.links[p];
      const n = el('div', `mp-link${i === this.keyIndex ? ' on' : ''}`);
      n.dataset.provider = p;
      if (!info.linked) n.classList.add('mp-off');
      const dot = el('span', 'mp-dot', '●');
      if (info.state !== 'ok') dot.dataset.state = info.state;
      n.append(dot, el('span', 'mp-line', info.linked ? L.linkLine(info.last4, info.credit, p) : L.providers[p]), el('span', 'mp-sp'));
      if (this.keyOpen !== p) {
        if (info.linked) {
          n.append(button('mp-change', L.changeKey, () => this.openKey(p)));
          const unlink = button('mp-unlink', L.unlink, () => {
            if (this.pending) return;
            if (unlink.dataset.armed) return this.o.onUnlink(p);
            unlink.dataset.armed = '1';
            unlink.textContent = L.unlinkConfirm;
          });
          n.append(unlink);
        } else n.append(button('mp-add', L.addLink(p), () => this.openKey(p)));
      }
      return this.keyOpen === p ? [n, this.keyForm(p)] : [n];
    });
    this.body.replaceChildren(...rows.flat());
    this.body.querySelector<HTMLInputElement>('.lp-key')?.focus();
  }

  private keyForm(p: Provider): HTMLElement {
    const L = COPY.link;
    const s = this.side(p);
    const form = el('div', 'lp-field');
    const input = el('input', 'lp-key');
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', s.fieldLabel);
    const link = button('lp-link', L.button, () => this.submit());
    const line = el('div', 'lp-row');
    line.append(input, link);
    const get = el('div', 'lp-get', L.getKeyLead);
    const a = el('a', '', s.getKey);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.href = s.href;
    get.append(a);
    const msg = el('div', 'lp-msg');
    form.append(el('div', 'lp-why', s.why), line, get, msg);
    this.keyInput = input;
    this.keyButton = link;
    this.keyMsg = msg;
    return form;
  }

  private openKey(p: Provider): void {
    if (this.pending) return;
    this.keyOpen = p;
    this.keyIndex = PROVIDERS.indexOf(p);
    this.render();
    this.o.onChange();
  }

  private closeKey(): void {
    this.keyOpen = null;
  }

  /** Esc in a key field: with no key at all there's nothing behind it, so the step backs out. */
  private escapeKey(): void {
    if (this.o.needsKey) return this.o.onBack();
    this.closeKey();
    this.render();
    this.o.onChange();
  }

  private say(text: string, kind: 'error' | 'warn' | 'ok'): void {
    if (!this.keyMsg) return;
    this.keyMsg.textContent = text;
    this.keyMsg.dataset.kind = kind;
  }

  private submit(): void {
    const input = this.keyInput;
    const provider = this.keyOpen;
    const key = input?.value.trim() ?? '';
    if (this.pending || !input || !provider || key === '') return;
    const L = COPY.link;
    this.pending = true;
    input.disabled = true;
    this.keyButton!.textContent = L.checking;
    this.say('', 'ok');
    void this.o.put(key, provider).then((r) => {
      if (this.gone) return;
      this.keyButton!.textContent = L.button;
      if ('error' in r) {
        this.pending = false;
        input.disabled = false;
        this.say((provider === 'anthropic' ? L.anthropic.errors : L.errors)[r.error], 'error');
        input.focus();
        return;
      }
      // Still pending through the beat: the band moves on after it, so nothing should start now.
      input.value = '';
      if (r.state === 'no-credit') this.say(L.noCredit, 'warn');
      else this.say(L.linked(r.credit), 'ok');
      setTimeout(() => {
        if (!this.gone) this.o.onLinked(r, provider);
      }, this.o.beatMs ?? LINKED_BEAT_MS);
    });
  }
}
