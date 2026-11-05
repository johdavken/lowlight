/**
 * LINK A MIND: the model step when no key is linked (or the player is changing it). The key is checked
 * by the server before it's saved; this panel only shows the answer. Text goes in through textContent.
 */
import { PROVIDERS, type LinkError, type LinkInfo, type Provider } from '../net/link';
import { COPY } from './copy';
import './link.css';

const LINKED_BEAT_MS = 700;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export interface LinkPanelOptions {
  put: (apiKey: string, provider: Provider) => Promise<LinkInfo | { error: LinkError }>;
  onLinked: (info: LinkInfo, provider: Provider) => void;
  /** The side it opens on (default OpenRouter). */
  provider?: Provider;
  onBack: () => void;
  /** Changing an existing key (Esc goes back to the model list). */
  changing: boolean;
  /** How long "linked · $x" shows before the model list (tests: 0). */
  beatMs?: number;
}

export class LinkPanel {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly msg: HTMLElement;
  private pending = false;
  private gone = false;
  private provider: Provider;
  private readonly tabs = new Map<Provider, HTMLButtonElement>();
  private readonly why: HTMLElement;
  private readonly lbl: HTMLElement;
  private readonly getLink: HTMLAnchorElement;

  constructor(host: HTMLElement, private readonly o: LinkPanelOptions) {
    const L = COPY.link;
    this.provider = o.provider ?? 'openrouter';
    this.el = el('div', 'link-panel');
    const tabs = el('div', 'lp-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const p of PROVIDERS) {
      const t = el('button', 'lp-tab', L.providers[p]);
      t.type = 'button';
      t.dataset.provider = p;
      t.setAttribute('role', 'tab');
      t.onclick = () => this.switchTo(p);
      this.tabs.set(p, t);
      tabs.append(t);
    }
    const get = el('div', 'lp-get', L.getKeyLead);
    const a = el('a', '');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    get.append(a);
    this.getLink = a;
    this.why = el('div', 'lp-why');
    this.lbl = el('div', 'lp-lbl');
    this.input = el('input', 'lp-key');
    this.input.type = 'password';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;

    this.button = el('button', 'lp-link', L.button);
    this.button.type = 'button';
    this.button.onclick = () => this.submit();
    const back = el('button', 'lp-back', L.back);
    back.type = 'button';
    back.onclick = () => {
      if (!this.pending) this.o.onBack();
    };
    this.msg = el('div', 'lp-msg');
    const row = el('div', 'lp-row');
    row.append(this.button, back);
    this.el.append(el('div', 'lp-h', L.heading), tabs, this.why, this.lbl, this.input, get, this.msg, row);
    this.switchTo(this.provider);
    host.append(this.el);
    this.input.focus();
  }

  /** Enter links, Esc backs out; everything else is the field's. */
  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') {
      this.submit();
      return true;
    }
    if (e.key === 'Escape') {
      if (!this.pending) this.o.onBack();
      return true;
    }
    // Typing with the field unfocused (after a click elsewhere): back into the field, which takes the key.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== this.input && !this.pending) this.input.focus();
    return false;
  }

  destroy(): void {
    this.gone = true;
    this.el.remove();
  }

  /** Which key this is for: the words, the field's label and where to get one follow. */
  private switchTo(p: Provider): void {
    if (this.pending) return;
    this.provider = p;
    const L = COPY.link;
    const side = p === 'anthropic' ? L.anthropic : { why: L.why, fieldLabel: L.fieldLabel, getKey: L.getKey, href: 'https://openrouter.ai/keys' };
    for (const [q, t] of this.tabs) t.setAttribute('aria-selected', String(q === p));
    this.why.textContent = side.why;
    this.lbl.textContent = side.fieldLabel;
    this.input.setAttribute('aria-label', side.fieldLabel);
    this.getLink.textContent = side.getKey;
    this.getLink.href = side.href;
    this.say('', 'ok');
    this.input.focus();
  }

  private say(text: string, kind: 'error' | 'warn' | 'ok'): void {
    this.msg.textContent = text;
    this.msg.dataset.kind = kind;
  }

  private submit(): void {
    const key = this.input.value.trim();
    if (this.pending || key === '') return;
    this.pending = true;
    this.input.disabled = true;
    this.button.textContent = COPY.link.checking;
    this.say('', 'ok');
    const provider = this.provider;
    void this.o.put(key, provider).then((r) => {
      if (this.gone) return;
      this.pending = false;
      this.input.disabled = false;
      this.button.textContent = COPY.link.button;
      if ('error' in r) {
        this.say((provider === 'anthropic' ? COPY.link.anthropic.errors : COPY.link.errors)[r.error], 'error');
        this.input.focus();
        return;
      }
      this.input.value = '';
      if (r.state === 'no-credit') this.say(COPY.link.noCredit, 'warn');
      else this.say(COPY.link.linked(r.credit), 'ok');
      setTimeout(() => {
        if (!this.gone) this.o.onLinked(r, provider);
      }, this.o.beatMs ?? LINKED_BEAT_MS);
    });
  }
}
