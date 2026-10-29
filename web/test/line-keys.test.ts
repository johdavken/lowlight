import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../shared/types';
import { LineKeys } from '../src/ui/line-keys';
import type { ControlAction } from '../src/ui/message-controls';

function msg(over: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage {
  return { role: 'agent', text: 'x', toolLines: [], ts: 0, status: 'ok', ...over };
}

let keys: LineKeys;
const acts: ControlAction[] = [];
const state = (over: { msg?: ChatMessage; busy?: boolean } = {}) => ({
  msg: over.msg ?? msg({ id: 'a1' }),
  busy: over.busy ?? false,
  act: (a: ControlAction) => acts.push(a),
  startEdit: vi.fn(),
});
const keyButtons = () => [...keys.el.querySelectorAll<HTMLButtonElement>('button.key')];
const fold = () => keys.el.querySelector<HTMLButtonElement>('button.fold')!;

beforeEach(() => {
  localStorage.clear();
  acts.length = 0;
  keys = new LineKeys();
  document.body.append(keys.el);
});
afterEach(() => keys.dispose());

describe('LineKeys', () => {
  it('her latest line: five keys then the fold arrow, as a labelled toolbar', () => {
    keys.set(state());
    expect(keys.el.hidden).toBe(false);
    expect(keys.el.getAttribute('role')).toBe('toolbar');
    expect(keys.el.getAttribute('aria-label')).toBe('Line options');
    expect(keyButtons().map((b) => b.textContent)).toEqual(['REGENERATE', 'KEEP GOING', 'EDIT', 'DELETE', 'BRANCH HERE']);
    expect(keys.el.lastElementChild).toBe(fold());
  });

  it('keys carry their shortcut in the title and run their control', () => {
    keys.set(state());
    expect(keys.el.querySelector<HTMLButtonElement>('[data-key="regenerate"]')!.title).toBe('REGENERATE (Alt+R)');
    expect(keys.el.querySelector<HTMLButtonElement>('[data-key="continue"]')!.title).toBe('KEEP GOING (Alt+C)');
    keys.el.querySelector<HTMLButtonElement>('[data-key="regenerate"]')!.click();
    expect(acts).toEqual([{ kind: 'regenerate', id: 'a1' }]);
  });

  it('busy or streaming: every key disabled, never the fold arrow', () => {
    keys.set(state({ busy: true }));
    expect(keyButtons().every((b) => b.disabled)).toBe(true);
    expect(fold().disabled).toBe(false);
    keys.set(state({ msg: msg({ id: 'a1', status: 'streaming' }) }));
    expect(keyButtons().every((b) => b.disabled)).toBe(true);
    keys.set(state());
    expect(keyButtons().every((b) => !b.disabled)).toBe(true);
  });

  it('nothing to act on: hidden', () => {
    keys.set(state());
    keys.set(null);
    expect(keys.el.hidden).toBe(true);
  });

  it('a new latest line swaps the keys (the player’s line has no KEEP GOING)', () => {
    keys.set(state());
    keys.set(state({ msg: msg({ id: 'u1', role: 'user' }) }));
    expect(keyButtons().map((b) => b.textContent)).toEqual(['REGENERATE', 'EDIT', 'DELETE', 'BRANCH HERE']);
  });

  it('a fold survives refreshes while she transmits (Review Focus 5)', () => {
    keys.set(state());
    fold().click();
    expect(keys.el.classList.contains('folded')).toBe(true);
    keys.set(state({ busy: true }));
    keys.set(state({ busy: true }));
    keys.set(state({ busy: false }));
    expect(keys.el.classList.contains('folded')).toBe(true);
    expect(keyButtons().every((b) => !b.disabled)).toBe(true);
  });
});
