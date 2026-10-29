import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiceTray, type DiceTrayOpts } from '../src/ui/dice/tray';
import { closeBugReport, openBugReport } from '../src/ui/bug-report';
import { countFace, lastBid, minRaise, totalDice, type DiceState, type Face } from '../../shared/dice/rules';
import { setHerPronoun } from '../src/room/her-copy';

// These rooms' contact is a she (the page learns it from her portrait event).
setHerPronoun('she');

const CASS = { name: 'Cass', accent: '#46e3fc', settings: { bluff: 0.15, nerve: 0.45, suspicion: 0.75 } };
const flush = () => new Promise((r) => setTimeout(r, 0));
/** A key press from the page (bubbling up to window, where the room listens). */
const key = (k: string, extra: KeyboardEventInit = {}, target: EventTarget = document.activeElement ?? document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

let host: HTMLElement;
let tray: DiceTray | null = null;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  tray?.destroy();
  tray = null;
  host.remove();
  vi.useRealTimers();
});

function open(over: Partial<DiceTrayOpts> = {}) {
  const o = {
    her: CASS,
    you: 'Hicks',
    reducedMotion: true,
    seed: () => 1,
    onRound: vi.fn(),
    onExpression: vi.fn(),
    onSend: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  tray = new DiceTray(host, o);
  return o;
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const deal = () => key('Enter');

/** Plays your side with full knowledge of the dice: call a false bid, else the smallest true raise. */
function perfectMove(s: DiceState): void {
  const last = lastBid(s);
  const all = [...s.dice.you, ...s.dice.her];
  if (last && countFace(all, last.face) < last.q) {
    key('l');
    return;
  }
  const faces = ([2, 3, 4, 5, 6, 1] as Face[]).map((f) => ({ f, c: countFace(all, f), q: minRaise(last, f, totalDice(s)) })).filter((x) => x.q <= x.c);
  if (!faces.length) {
    key('l');
    return;
  }
  const best = faces.sort((a, b) => a.q - b.q)[0];
  setPick(best.q, best.f);
  key('Enter');
}
function setPick(q: number, f: Face) {
  $<HTMLButtonElement>(`.dice-face[data-face="${f}"]`)!.click();
  for (let i = 0; i < 12 && Number(text('.dice-qty')) < q; i++) key('ArrowUp');
  for (let i = 0; i < 12 && Number(text('.dice-qty')) > q; i++) key('ArrowDown');
}

describe('the stake', () => {
  it('chips and your own words; DEAL', () => {
    open();
    expect([...host.querySelectorAll('.dice-chip')].map((c) => c.textContent)).toEqual(['a drink', 'the next round', 'a truth', 'nothing']);
    expect($('.dice-chip.dice-on')!.textContent).toBe('a drink');
    const own = $<HTMLInputElement>('.dice-own')!;
    expect(own.maxLength).toBe(60);
    own.value = '  who walks\thome  ';
    own.dispatchEvent(new Event('input', { bubbles: true }));
    deal();
    expect(text('.dice-stake-label')).toBe('FOR · WHO WALKS HOME');
    expect($('.dice-table')).not.toBeNull();
  });

  it('HOW TO PLAY shows the rules in the tray; Enter or Esc goes back to the stake as you left it, never deals', () => {
    const o = open();
    const own = $<HTMLInputElement>('.dice-own')!;
    own.value = 'the jukebox';
    own.dispatchEvent(new Event('input', { bubbles: true }));
    $<HTMLButtonElement>('.dice-help')!.click();
    expect($('.dice-rules')).not.toBeNull();
    expect(text('.dice-rules')).toContain('1s are wild');
    expect(text('.dice-rules')).toContain('LIAR');
    expect($('.dice-own')).toBeNull();
    key('Enter');
    expect($('.dice-rules')).toBeNull();
    expect($<HTMLInputElement>('.dice-own')!.value).toBe('the jukebox');
    expect(tray!.state()).toBeNull();
    $<HTMLButtonElement>('.dice-help')!.click();
    expect(tray!.handleEscape()).toBe(true);
    expect($('.dice-rules')).toBeNull();
    expect($('.dice-own')).not.toBeNull();
    expect(o.onClose).not.toHaveBeenCalled();
  });
});

describe('the table', () => {
  it('opening: 1s cannot be bid, and the note says so', () => {
    open();
    deal();
    $<HTMLButtonElement>('.dice-face[data-face="1"]')!.click();
    expect($<HTMLButtonElement>('.dice-do-bid')!.disabled).toBe(true);
    expect(text('.dice-note')).toBe("can't open on 1s");
    expect($<HTMLButtonElement>('.dice-do-liar')!.disabled).toBe(true);
    expect(text('.dice-by')).toBe('YOUR OPENING BID · ROUND 1');
  });

  it('arrows adjust; a bid under the minimum disables BID and names the minimum', () => {
    open();
    deal();
    setPick(2, 4);
    key('Enter');
    // she answered at once (reduced motion); now raise on a lower face than hers
    const s = tray!.state()!;
    const last = lastBid(s)!;
    // Seed 1: she raises on a face above 2 (a tuning change to her play should fail here, not pass silently).
    expect(last.by).toBe('her');
    expect(last.face).toBeGreaterThan(2);
    $<HTMLButtonElement>('.dice-face[data-face="2"]')!.click();
    for (let i = 0; i < 12; i++) key('ArrowDown');
    expect($<HTMLButtonElement>('.dice-do-bid')!.disabled).toBe(true);
    expect(text('.dice-note')).toBe(`at least ${last.q + 1} on 2s`);
  });

  it('while the bug report is open, Enter is its key, not a bid (focus on one of its buttons)', () => {
    vi.useFakeTimers();
    open({ reducedMotion: false });
    deal();
    setPick(1, 4);
    openBugReport({ from: 'scene', screenshot: null, onClose: () => {} });
    document.querySelector<HTMLButtonElement>('.bug-cancel')!.focus();
    key('Enter');
    expect($('.dice-think')).toBeNull();
    closeBugReport();
    key('Enter');
    expect(text('.dice-think')).toBe('CASS IS THINKING…');
  });

  it('Enter bids, and she moves after the beat (not reduced motion)', () => {
    vi.useFakeTimers();
    open({ reducedMotion: false });
    deal();
    setPick(1, 4);
    key('Enter');
    expect(text('.dice-think')).toBe('CASS IS THINKING…');
    vi.advanceTimersByTime(1600);
    expect($('.dice-think')).toBeNull();
    expect($('.dice-reveal') !== null || lastBid(tray!.state()!)!.by === 'her').toBe(true);
  });

  it('L calls: the reveal shows the count, the loser and her dice; onRound once', () => {
    const o = open();
    deal();
    setPick(1, 4);
    key('Enter');
    // Seed 1: she raises rather than calling one 4 (a tuning change should fail here, not skip).
    expect($('.dice-reveal')).toBeNull();
    key('l');
    expect($('.dice-reveal')).not.toBeNull();
    expect(text('.dice-liar')).toBe('YOU: LIAR!');
    expect(text('.dice-by')).toMatch(/^\w+ \d+s? · there (was|were) \d+ · (you lose|Cass loses) a die$/);
    expect(host.querySelectorAll('.dice-her .dice-die')).toHaveLength(5);
    expect([...host.querySelectorAll('.dice-reveal .dice-lbl')].map((l) => l.textContent)).toEqual(['CASS', 'YOU']);
    expect(o.onRound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(o.onRound).mock.calls[0][0]).toBe(1);
    expect(vi.mocked(o.onRound).mock.calls[0][3]).toBe(1); // the game's seed, echoed with her line
  });
});

describe('a whole game', () => {
  it('scripted to YOU WIN; Enter sends once with the stake, result, rounds, lines and seed', () => {
    let won = false;
    for (let seed = 1; seed <= 30 && !won; seed++) {
      tray?.destroy();
      host.replaceChildren();
      const o = open({ seed: () => seed });
      deal();
      for (let guard = 0; guard < 200 && !$('.dice-result'); guard++) {
        if ($('.dice-reveal')) key('Enter');
        else perfectMove(tray!.state()!);
      }
      if (text('.dice-big') !== 'YOU WIN') continue;
      won = true;
      expect(text('.dice-result-line')).toMatch(/^\d – 0 · for a drink$/);
      expect(text('.dice-send')).toBe('[ENTER] BACK TO HER');
      key('Enter');
      key('Enter');
      $<HTMLButtonElement>('.dice-send')!.click();
      expect(o.onSend).toHaveBeenCalledTimes(1);
      const sent = vi.mocked(o.onSend).mock.calls[0][0];
      expect(sent).toMatchObject({ stake: 'a drink', result: 'won', seed });
      expect(sent.lines).toHaveLength(sent.rounds.length);
    }
    expect(won).toBe(true);
  });

  it('a truth: the result says who asks', () => {
    open({ seed: () => 3 });
    $<HTMLButtonElement>('.dice-chip:nth-child(3)')!.click();
    deal();
    for (let guard = 0; guard < 200 && !$('.dice-result'); guard++) {
      if ($('.dice-reveal')) key('Enter');
      else perfectMove(tray!.state()!);
    }
    expect(text('.dice-result-line')).toMatch(/for a truth · (ask her one|she asks you one)$/);
  });
});

describe('her lines', () => {
  it('a line for the latest round sets the bubble and her face; an older round is ignored', () => {
    const o = open();
    deal();
    for (let guard = 0; guard < 50 && tray!.state()!.rounds.length < 2; guard++) {
      if ($('.dice-reveal')) key('Enter');
      else perfectMove(tray!.state()!);
    }
    const latest = tray!.state()!.rounds.length;
    tray!.showLine(latest - 1, 1, 'old news', 'annoyed');
    // The right round of another game (one you left; its answer came late): not this one's (M1).
    tray!.showLine(latest, 2, 'other game', 'annoyed');
    expect($('.dice-say')!.classList.contains('dice-on')).toBe(false);
    expect(o.onExpression).not.toHaveBeenCalled();
    tray!.showLine(latest, 1, 'Collar again.', 'smile');
    expect(text('.dice-say')).toBe('Cass · Collar again.');
    expect(o.onExpression).toHaveBeenCalledWith('smile');
  });
});

describe('leaving and keys', () => {
  it('Esc twice leaves mid-game with no send; her face goes back', () => {
    const o = open();
    deal();
    expect(tray!.handleEscape()).toBe(true);
    expect(text('.dice-esc')).toBe('[ESC] or click away again to leave the table');
    expect(tray!.handleEscape()).toBe(true);
    expect(o.onClose).toHaveBeenCalledWith({ truthWon: false });
    expect(o.onSend).not.toHaveBeenCalled();
    expect(o.onExpression).toHaveBeenLastCalledWith(null);
  });

  it("keys don't reach the room while it's open (Review Focus 5)", () => {
    open();
    deal();
    const seen: string[] = [];
    const onKey = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
    for (const k of ['a', 'Enter', 'ArrowUp', 'ArrowLeft', 'Tab', 'x']) key(k, {}, document.body);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('keydown', onKey);
    expect(seen).toEqual([]);
    // Sanity: with no tray, the same presses do reach the room.
    tray!.destroy();
    tray = null;
    window.addEventListener('keydown', onKey);
    key('a', {}, document.body);
    window.removeEventListener('keydown', onKey);
    expect(seen).toEqual(['a']);
  });

  it('a sent result with no answer in 10 s offers SEND AGAIN, and Esc can leave (spec §9)', () => {
    vi.useFakeTimers();
    const o = open();
    deal();
    for (let guard = 0; guard < 200 && !$('.dice-result'); guard++) {
      if ($('.dice-reveal')) key('Enter');
      else perfectMove(tray!.state()!);
    }
    key('Enter');
    expect(o.onSend).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9_000);
    expect($('.dice-refusal')).toBeNull();
    vi.advanceTimersByTime(1_500);
    expect(text('.dice-refusal')).toBe('no answer — check the link and send again');
    expect(text('.dice-send')).toBe('[ENTER] SEND AGAIN');
    tray!.handleEscape();
    expect(o.onClose).toHaveBeenCalledTimes(1);
  });

  it('a refusal on the result screen offers SEND AGAIN', async () => {
    const o = open();
    deal();
    for (let guard = 0; guard < 200 && !$('.dice-result'); guard++) {
      if ($('.dice-reveal')) key('Enter');
      else perfectMove(tray!.state()!);
    }
    key('Enter');
    tray!.showRefusal('wait for her to finish');
    await flush();
    expect(text('.dice-refusal')).toBe('wait for her to finish');
    expect(text('.dice-send')).toBe('[ENTER] SEND AGAIN');
    key('Enter');
    expect(o.onSend).toHaveBeenCalledTimes(2);
  });
});

/** Plays a whole game by script (you with full knowledge of the dice) up to the given screen. */
function playUntil(sel: string) {
  for (let guard = 0; guard < 300 && !$(sel); guard++) {
    if ($('.dice-result')) break;
    if ($('.dice-reveal')) key('Enter');
    else perfectMove(tray!.state()!);
  }
}

describe('tray review fixes', () => {
  it('C3: a game that ended on the reveal cannot be escaped before the result is sent', () => {
    const o = open();
    deal();
    for (let guard = 0; guard < 300 && !(tray!.state()!.over && $('.dice-reveal')); guard++) {
      if ($('.dice-reveal')) key('Enter');
      else perfectMove(tray!.state()!);
    }
    expect(tray!.state()!.over).not.toBeNull();
    expect(text('.dice-next')).toBe('[ENTER] SEE IT OUT');
    tray!.handleEscape();
    tray!.handleEscape();
    expect(o.onClose).not.toHaveBeenCalled();
    key('Enter');
    expect($('.dice-result')).not.toBeNull();
  });

  it("I1: with the room's prompt focused, the tray still gets the keys; it takes focus to its stake field", () => {
    const room = document.createElement('div');
    room.id = 'input';
    const ta = document.createElement('textarea');
    room.append(ta);
    document.body.append(room);
    ta.focus();
    const roomEnter = vi.fn();
    window.addEventListener('keydown', roomEnter);
    open();
    expect(document.activeElement).toBe($('.dice-own'));
    key('Enter', {}, ta);
    window.removeEventListener('keydown', roomEnter);
    room.remove();
    expect($('.dice-table')).not.toBeNull();
    expect(roomEnter).not.toHaveBeenCalled();
  });

  it('I2: your dice tumble on the roll only, not on every change', () => {
    open({ reducedMotion: false });
    deal();
    expect($('.dice-tumble')).not.toBeNull();
    key('ArrowUp');
    expect($('.dice-tumble')).toBeNull();
  });

  it('I4: her face goes back when the tray is destroyed after a line', () => {
    const o = open();
    deal();
    playUntil('.dice-reveal');
    tray!.showLine(tray!.state()!.rounds.length, 1, 'Hm.', 'smile');
    tray!.destroy();
    tray = null;
    expect(o.onExpression).toHaveBeenLastCalledWith(null);
  });

  it('NEXT ROUND re-rolls; the loser opens (she moves at once when it is her)', () => {
    open();
    deal();
    playUntil('.dice-reveal');
    const lost = tray!.state()!.rounds[0].loser;
    key('Enter');
    const s = tray!.state()!;
    expect(s.round).toBe(2);
    if (lost === 'her') expect(s.bids[0]?.by ?? (s.rounds.length > 1 ? 'her' : null)).toBe('her');
    else expect([s.turn, s.bids.length]).toEqual(['you', 0]);
  });

  it('Esc on the stake screen leaves at once; on the result it is blocked until a refusal, then one press leaves', () => {
    const a = open();
    tray!.handleEscape();
    expect(a.onClose).toHaveBeenCalledTimes(1);
    tray!.destroy();
    const b = open();
    deal();
    playUntil('.dice-result');
    tray!.handleEscape();
    tray!.handleEscape();
    expect(b.onClose).not.toHaveBeenCalled();
    key('Enter');
    tray!.showRefusal('no link');
    tray!.handleEscape();
    expect(b.onClose).toHaveBeenCalledTimes(1);
  });

  it('any other key disarms Esc', () => {
    open();
    deal();
    tray!.handleEscape();
    expect($('.dice-esc')).not.toBeNull();
    key('x');
    expect($('.dice-esc')).toBeNull();
  });

  it('destroy mid-think leaves no move to fire', () => {
    vi.useFakeTimers();
    const o = open({ reducedMotion: false });
    deal();
    setPick(1, 4);
    key('Enter');
    expect($('.dice-think')).not.toBeNull();
    tray!.destroy();
    tray = null;
    vi.advanceTimersByTime(5000);
    expect(o.onRound).not.toHaveBeenCalled();
  });

  it('a held Enter does nothing; typing in the stake field reaches it; the backtick reaches the dev panel', () => {
    open();
    key('Enter', { repeat: true });
    expect($('.dice-stake')).not.toBeNull();
    const own = $<HTMLInputElement>('.dice-own')!;
    const typed = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    own.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    const tick = new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true });
    document.body.dispatchEvent(tick);
    expect(tick.defaultPrevented).toBe(false);
  });

  it('the result keeps the dice; a typed "A Truth" still says who asks', () => {
    open();
    const own = $<HTMLInputElement>('.dice-own')!;
    own.value = 'A Truth';
    own.dispatchEvent(new Event('input', { bubbles: true }));
    deal();
    playUntil('.dice-result');
    expect(host.querySelectorAll('.dice-result .dice-die').length).toBeGreaterThan(0);
    expect(text('.dice-result-line')).toMatch(/for A Truth · (ask her one|she asks you one)$/);
  });

  it('a face change snaps the quantity to that face’s minimum; your counting dice glow softly at the table', () => {
    open();
    deal();
    setPick(1, 4);
    key('Enter');
    const last = lastBid(tray!.state()!)!;
    expect(last.by).toBe('her');
    for (let i = 0; i < 6; i++) key('ArrowUp');
    $<HTMLButtonElement>('.dice-face[data-face="6"]')!.click();
    expect(Number(text('.dice-qty'))).toBe(minRaise(last, 6, totalDice(tray!.state()!)));
    const want = tray!.state()!.dice.you.filter((d) => d === last.face || (last.face !== 1 && d === 1)).length;
    expect(host.querySelectorAll('.dice-mine .dice-soft')).toHaveLength(want);
  });
});

