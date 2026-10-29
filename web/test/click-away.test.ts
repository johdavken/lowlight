import { afterEach, describe, expect, it, vi } from 'vitest';
import { onClickAway } from '../src/ui/click-away';

const div = (cls: string) => {
  const d = document.createElement('div');
  d.className = cls;
  document.body.append(d);
  return d;
};
const down = (el: Element) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('onClickAway', () => {
  it('a pointerdown outside calls away; inside, or on the top bar, SYS or the MODEL menu, does not', () => {
    const panel = div('panel');
    const inner = document.createElement('span');
    panel.append(inner);
    const bar = div('hud-bar');
    const word = document.createElement('span');
    bar.append(word);
    const away = vi.fn();
    const off = onClickAway((n) => panel.contains(n), away);
    down(inner);
    down(word);
    down(div('sys-menu'));
    down(div('model-menu'));
    down(div('devpanel'));
    expect(away).not.toHaveBeenCalled();
    down(document.body);
    expect(away).toHaveBeenCalledTimes(1);
    off();
    down(document.body);
    expect(away).toHaveBeenCalledTimes(1);
  });
});
