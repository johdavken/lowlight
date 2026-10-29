import type { ServerEvent } from '../../../shared/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Decides when the recap card greets the player: only with the recap in the initial sync after a
 * (re)connect, and only if he hasn't seen it. A recap she writes while he's still in the room
 * waits for his next dial-in.
 */
export function createRecapGate(): { onConnect(): void; onEvent(e: Extract<ServerEvent, { type: 'recap' }>): string | null } {
  let syncing = false;
  return {
    onConnect() {
      syncing = true;
    },
    onEvent(e) {
      const first = syncing;
      syncing = false;
      return first && !e.seen && e.text ? e.text : null;
    },
  };
}

const MODIFIERS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift', 'CapsLock', 'OS']);

/**
 * "// PREVIOUSLY…" over the scene when the player dials in to a recap he hasn't seen. The first key or
 * click dismisses it — that key is swallowed (capture phase), so it never types into the prompt.
 * Lone modifiers and Ctrl/Meta shortcuts pass through without dismissing it.
 */
export class RecapCard {
  private shown = false;
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.shown) return;
    // A lone modifier (the Alt of Alt+Tab) or a browser shortcut (Ctrl+R) isn't the player reading it.
    if (MODIFIERS.has(e.key) || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.dismiss();
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly onSeen: () => void,
  ) {
    root.classList.add('recap-root');
    root.hidden = true;
    root.addEventListener('click', () => this.dismiss()); // the card or the dim backdrop
    window.addEventListener('keydown', this.onKey, true);
  }

  get visible(): boolean {
    return this.shown;
  }

  show(text: string): void {
    const card = el('div', 'recap-card');
    card.append(el('div', 'recap-title', '// PREVIOUSLY'), el('div', 'recap-text', text), el('div', 'recap-hint', 'PRESS ANY KEY'));
    this.root.replaceChildren(card);
    this.root.hidden = false;
    this.shown = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }

  private dismiss(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onSeen();
  }
}
