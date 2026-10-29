/**
 * LINK A MIND: the model step when no key is linked (or the player is changing it). The key is checked
 * by the server before it's saved; this panel only shows the answer. Text goes in through textContent.
 */
import type { LinkError, LinkInfo } from '../net/link';
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
  put: (apiKey: string) => Promise<LinkInfo | { error: LinkError }>;
  onLinked: (info: LinkInfo) => void;
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

  constructor(host: HTMLElement, private readonly o: LinkPanelOptions) {
    const L = COPY.link;
    this.el = el('div', 'link-panel');
    const get = el('div', 'lp-get', L.getKeyLead);
    const a = el('a', '', L.getKey);
    a.href = 'https://openrouter.ai/keys';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    get.append(a);
    this.input = el('input', 'lp-key');
    this.input.type = 'password';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', L.fieldLabel);
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
    this.el.append(el('div', 'lp-h', L.heading), el('div', 'lp-why', L.why), el('div', 'lp-lbl', L.fieldLabel), this.input, get, this.msg, row);
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
    void this.o.put(key).then((r) => {
      if (this.gone) return;
      this.pending = false;
      this.input.disabled = false;
      this.button.textContent = COPY.link.button;
      if ('error' in r) {
        this.say(COPY.link.errors[r.error], 'error');
        this.input.focus();
        return;
      }
      this.input.value = '';
      if (r.state === 'no-credit') this.say(COPY.link.noCredit, 'warn');
      else this.say(COPY.link.linked(r.credit), 'ok');
      setTimeout(() => {
        if (!this.gone) this.o.onLinked(r);
      }, this.o.beatMs ?? LINKED_BEAT_MS);
    });
  }
}
