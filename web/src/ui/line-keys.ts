/**
 * The line stack (spec 2026-10-16 subtitle chat box §5): the latest line's options in the box's
 * bottom-left corner, as glyphs or words (SYS → CHAT KEYS), folding under one arrow. The feed says
 * which line they act on; the actions come from message-controls.
 */
import type { ChatMessage } from '../../../shared/types';
import { foldArrow } from './chat-keys';
import { keyButton } from './key-glyphs';
import { latestActions, type ControlAction } from './message-controls';

/** The shortcut each key's title names (feed.ts controlKey handles them). */
const SHORTCUT: Partial<Record<string, string>> = { regenerate: 'Alt+R', continue: 'Alt+C' };

export interface LineKeysState {
  msg: ChatMessage;
  busy: boolean;
  act: (a: ControlAction) => void;
  startEdit: () => void;
}

export class LineKeys {
  readonly el = document.createElement('div');
  private readonly arrow: HTMLButtonElement;
  private key = '';

  constructor() {
    this.el.className = 'line-keys';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', 'Line options');
    this.el.hidden = true;
    this.arrow = foldArrow(this.el, 'line');
    this.el.append(this.arrow);
  }

  /** The line the keys act on (null: none, and the stack hides). Rebuilt only when the line, its keys or busy change. */
  set(s: LineKeysState | null): void {
    this.el.hidden = s === null;
    if (!s) {
      this.key = '';
      return;
    }
    const actions = latestActions(s.msg, s.act, s.startEdit);
    const disabled = s.busy || s.msg.status === 'streaming';
    const key = [s.msg.id, actions.map((a) => a.id).join(','), disabled].join('|');
    if (key === this.key) return;
    this.key = key;
    const buttons = actions.map((a) => {
      const shortcut = SHORTCUT[a.id];
      const b = keyButton(a.id, a.label, shortcut ? `${a.label} (${shortcut})` : a.label);
      b.disabled = disabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        a.run();
      });
      return b;
    });
    this.el.replaceChildren(...buttons, this.arrow);
  }

  dispose(): void {
    this.el.remove();
  }
}
