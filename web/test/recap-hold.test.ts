import { describe, expect, it, vi } from 'vitest';
import { createRecapHold } from '../src/room/recap-hold';

function setup() {
  const show = vi.fn();
  const greet = { onRecap: vi.fn(), onRecapSeen: vi.fn(), onIntroClosed: vi.fn() };
  return { show, greet, hold: createRecapHold({ show, greet }) };
}

describe('recap hold', () => {
  it('with the screen closed it leaves the recap to the room', () => {
    const { hold, greet } = setup();
    expect(hold.recap('Last time…', false)).toBe(false);
    expect(greet.onRecap).not.toHaveBeenCalled();
  });

  it('holds a recap behind the screen and shows it on close; the greeting follows the card', () => {
    const { hold, show, greet } = setup();
    expect(hold.recap('Last time…', true)).toBe(true);
    expect(greet.onRecap).toHaveBeenCalledWith(true);
    expect(show).not.toHaveBeenCalled();
    hold.introClosed();
    expect(show).toHaveBeenCalledWith('Last time…');
    expect(greet.onRecapSeen).not.toHaveBeenCalled();
    expect(greet.onIntroClosed).toHaveBeenCalledTimes(1);
  });

  it('no recap: closing lets the greeting go', () => {
    const { hold, show, greet } = setup();
    hold.introClosed();
    expect(show).not.toHaveBeenCalled();
    expect(greet.onRecapSeen).toHaveBeenCalledTimes(1);
    expect(greet.onIntroClosed).toHaveBeenCalledTimes(1);
  });

  it('a seen recap after a reconnect drops the held one', () => {
    const { hold, show, greet } = setup();
    hold.recap('Last time…', true);
    expect(hold.recap(null, true)).toBe(true);
    expect(greet.onRecap).toHaveBeenLastCalledWith(false);
    hold.introClosed();
    expect(show).not.toHaveBeenCalled();
  });
});
