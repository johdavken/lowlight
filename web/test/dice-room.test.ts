import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diceRoom, type DiceRoomDeps } from '../src/ui/dice/room';
import type { ChatMessage } from '../../shared/types';
import { countFace, lastBid, minRaise, totalDice, type DiceState, type Face } from '../../shared/dice/rules';

/** Your side with full knowledge of the dice: call a false bid, else the smallest true raise. */
function perfectMove(s: DiceState): void {
  const last = lastBid(s);
  const all = [...s.dice.you, ...s.dice.her];
  if (last && countFace(all, last.face) < last.q) {
    key('l');
    return;
  }
  const options = ([2, 3, 4, 5, 6, 1] as Face[]).map((f) => ({ f, c: countFace(all, f), q: minRaise(last, f, totalDice(s)) })).filter((x) => x.q <= x.c);
  if (!options.length) {
    key('l');
    return;
  }
  const best = options.sort((a, b) => a.q - b.q)[0];
  document.querySelector<HTMLButtonElement>(`.dice-face[data-face="${best.f}"]`)!.click();
  for (let i = 0; i < 12 && Number(document.querySelector('.dice-qty')!.textContent) < best.q; i++) key('ArrowUp');
  for (let i = 0; i < 12 && Number(document.querySelector('.dice-qty')!.textContent) > best.q; i++) key('ArrowDown');
  key('Enter');
}

const key = (k: string, target: EventTarget = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
let deps: DiceRoomDeps & { sent: unknown[] };
let room: ReturnType<typeof diceRoom>;
beforeEach(() => {
  document.body.innerHTML = '';
  const sent: unknown[] = [];
  deps = {
    sent,
    her: () => ({ name: 'Cass', accent: '#46e3fc', settings: { bluff: 0.15, nerve: 0.45, suspicion: 0.75 } }),
    you: () => 'Hicks',
    reducedMotion: true,
    seed: () => 1,
    send: (e) => sent.push(e),
    stage: { setExpression: vi.fn() },
    herFace: () => 'smile',
    prefill: vi.fn(),
    feedExpanded: () => false,
  };
  room = diceRoom(deps);
});
afterEach(() => room.close());
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
/** Plays your side with full knowledge until the reveal. */
function toReveal() {
  key('Enter');
  // you bid when you open, else call LIAR
  for (let g = 0; g < 60 && !$('.dice-reveal'); g++) key(lastBid(room.state()!) ? 'l' : 'Enter');
}
const row = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: 'd1', role: 'user', text: '*Hicks plays.*', toolLines: [], ts: 1, status: 'ok', mode: 'dice', ...over });

describe('the dice in the room', () => {
  it('opening mounts the tray in its own layer, and a round asks for her line', () => {
    room.start();
    expect(room.open).toBe(true);
    expect($('.dice-host .dice-tray')).not.toBeNull();
    key('Enter');
    // her opening reply: bid, then she answers; call LIAR on whatever she says next
    key('Enter');
    key('l');
    expect($('.dice-reveal')).not.toBeNull();
    expect(deps.sent.find((e) => (e as { type: string }).type === 'dice_line')).toMatchObject({ type: 'dice_line', round: 1, stake: 'a drink', seed: 1 });
  });

  it("her line for the open tray sets the bubble and her face; one for an old round, or a closed tray, does nothing (Review Focus 1)", () => {
    room.start();
    toReveal();
    room.line({ round: 1, seed: 1, line: 'Collar again.', expression: 'laugh' });
    expect($('.dice-say')!.textContent).toBe('Cass · Collar again.');
    expect(deps.stage.setExpression).toHaveBeenLastCalledWith('right', 'laugh');
    room.line({ round: 0, seed: 1, line: 'old', expression: 'angry' });
    expect($('.dice-say')!.textContent).toBe('Cass · Collar again.');
    room.close();
    room.line({ round: 1, seed: 1, line: 'late', expression: 'angry' });
    expect(deps.stage.setExpression).not.toHaveBeenCalledWith('right', 'angry');
  });

  it('her dice row closes the tray once you sent: the resident comes back and her face is her reply\'s', () => {
    room.start();
    key('Enter');
    for (let g = 0; g < 300 && !$('.dice-result'); g++) key($('.dice-reveal') || !lastBid(room.state()!) ? 'Enter' : 'l');
    key('Enter');
    room.row(row());
    expect(room.open).toBe(false);
    expect($('.dice-host')).toBeNull();
    expect(deps.stage.setExpression).toHaveBeenLastCalledWith('right', 'smile');
  });

  it('a refusal on the result screen offers SEND AGAIN (Review Focus 2)', () => {
    room.start();
    key('Enter');
    for (let g = 0; g < 300 && !$('.dice-result'); g++) key($('.dice-reveal') || !lastBid(room.state()!) ? 'Enter' : 'l');
    key('Enter');
    expect(deps.sent.filter((e) => (e as { type: string }).type === 'dice')).toHaveLength(1);
    room.refusal('wait for her to finish');
    expect($('.dice-send')!.textContent).toBe('[ENTER] SEND AGAIN');
  });

  it('a truth you won prefills My question: when her row arrives', () => {
    let won = false;
    for (let seed = 1; seed <= 30 && !won; seed++) {
      room.close();
      document.body.innerHTML = '';
      deps.seed = () => seed;
      room = diceRoom(deps);
      room.start();
      document.querySelector<HTMLButtonElement>('.dice-chip:nth-child(3)')!.click();
      key('Enter');
      for (let g = 0; g < 300 && !$('.dice-result'); g++) {
        if ($('.dice-reveal')) key('Enter');
        else perfectMove(room.state()!);
      }
      if ($('.dice-big')!.textContent !== 'YOU WIN') continue;
      won = true;
      key('Enter');
      room.row(row());
      expect(deps.prefill).toHaveBeenCalledWith('My question: ');
    }
    expect(won).toBe(true);
  });

  it('the room changing closes it with nothing sent; the resident comes back every way out (Review Focus 4)', () => {
    room.start();
    key('Enter');
    room.roomChanged();
    expect(room.open).toBe(false);
    expect(deps.sent.filter((e) => (e as { type: string }).type === 'dice')).toEqual([]);
    room.start();
    key('Escape');
    key('Escape');
    expect(room.open).toBe(false);
  });

  it('Esc goes to the tray first; with the feed expanded it is the feed\'s', () => {
    room.start();
    key('Enter');
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    key('Escape');
    expect(seen).not.toHaveBeenCalled();
    expect($('.dice-esc')).not.toBeNull();
    deps.feedExpanded = () => true;
    key('Escape');
    window.removeEventListener('keydown', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(room.open).toBe(true);
  });

  it('a click away does what Esc does: leaves from the stake screen; mid-game it asks first', () => {
    const away = () => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    room.start();
    $('.dice-host')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(room.open).toBe(true);
    away();
    expect(room.open).toBe(false);
    room.start();
    key('Enter');
    away();
    expect(room.open).toBe(true);
    expect($('.dice-esc')).not.toBeNull();
    away();
    expect(room.open).toBe(false);
    expect(deps.sent.find((e) => (e as { type: string }).type === 'dice_line')).toBeUndefined();
  });

  it('with the feed expanded over it, the tray takes no keys (the feed is read, the game waits)', () => {
    room.start();
    deps.feedExpanded = () => true;
    key('Enter');
    expect(room.state()).toBeNull();
    deps.feedExpanded = () => false;
    key('Enter');
    expect(room.state()!.round).toBe(1);
  });

  it("her neutral round face is neutral, not her last reply's (M4)", () => {
    room.start();
    toReveal();
    room.line({ round: 1, seed: 1, line: 'Hm.', expression: null });
    expect(deps.stage.setExpression).toHaveBeenLastCalledWith('right', null);
  });

  it("another tab's dice row doesn't close a game you haven't sent (M2)", () => {
    room.start();
    key('Enter');
    room.row(row());
    expect(room.open).toBe(true);
  });

  it('state() is the game (the e2e hook)', () => {
    room.start();
    key('Enter');
    expect(room.state()!.round).toBe(1);
  });
});
