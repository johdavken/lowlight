import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glitchSave, GLITCH_MS, HOLD_MS, LOCK_MS, playCheck, ROLL_MS, settleParked } from '../src/room/check-anim';
import { missionCuePlayer, MISSION_CUE_URL } from '../src/ui/mission-sound';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const card = () => {
  const c = document.createElement('div');
  c.className = 'qc-card';
  c.append(Object.assign(document.createElement('span'), { className: 'qc-line', textContent: 'Talk your way in.' }));
  document.body.append(c);
  return c;
};
const run = (o: Partial<Parameters<typeof playCheck>[1]> = {}) => {
  const cues: string[] = [];
  const c = card();
  const done = playCheck(c, { faces: [6, 3, 1], keep: 'high', kind: 'clean', red: false, reduced: false, cue: (n) => cues.push(n), ...o });
  return { c, cues, done };
};
const faces = (c: HTMLElement) => [...c.querySelectorAll('.qc-die')].map((d) => d.textContent);
const kept = (c: HTMLElement) => [...c.querySelectorAll('.qc-die.kept')].map((d) => d.textContent);

describe('playCheck (the table: dice)', () => {
  it('a clean roll: lock, tick, pass; the faces land, the 6 lights, CLEAN', async () => {
    const { c, cues, done } = run();
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['lock', 'tick', 'land-clean']);
    expect(faces(c)).toEqual(['6', '3', '1']);
    expect(kept(c)).toEqual(['6']);
    expect(c.classList.contains('is-pass')).toBe(true);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('CLEAN');
  });

  it('a crit lights both sixes: CRIT, with its own landing', async () => {
    const { c, cues, done } = run({ faces: [6, 6, 2], kind: 'crit' });
    await vi.runAllTimersAsync();
    await done;
    expect(cues.at(-1)).toBe('land-crit');
    expect(kept(c)).toEqual(['6', '6']);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('CRIT');
  });

  it('a 4–5 is a pass at a cost: is-cost, COST', async () => {
    const { c, cues, done } = run({ faces: [5, 2], kind: 'cost' });
    await vi.runAllTimersAsync();
    await done;
    expect(cues.at(-1)).toBe('land-cost');
    expect(c.classList.contains('is-cost')).toBe(true);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('COST');
  });

  it('a miss ends is-fail with MISS', async () => {
    const { c, cues, done } = run({ faces: [3, 2], kind: 'miss' });
    await vi.runAllTimersAsync();
    await done;
    expect(cues.at(-1)).toBe('land-miss');
    expect(c.classList.contains('is-fail')).toBe(true);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('MISS');
  });

  it('a 0d roll keeps the lower die: it is the one lit', async () => {
    const { c, done } = run({ faces: [5, 2], keep: 'low', kind: 'miss' });
    await vi.runAllTimersAsync();
    await done;
    expect(kept(c)).toEqual(['2']);
  });

  it('red: lock, tick, red, and the roll takes 1500 ms', async () => {
    const { cues, done } = run({ faces: [3], kind: 'miss', red: true });
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(450 + 1400);
    expect(cues).toEqual(['lock', 'tick']);
    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['lock', 'tick', 'red']);
  });

  it('a deck that dies shorts the card and cues dies', async () => {
    const { c, cues, done } = run({ faces: [2, 1], kind: 'miss', deckDied: true });
    await vi.runAllTimersAsync();
    await done;
    expect(cues.at(-1)).toBe('dies');
    expect(c.classList.contains('shorting')).toBe(true);
  });

  it('a click mid-roll lands it at once, and holds the result until another click', async () => {
    const { c, cues, done } = run();
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(300);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cues).toEqual(['lock', 'tick', 'land-clean']);
    expect(faces(c)).toEqual(['6', '3', '1']);
    expect(settled).toBe(false);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('the landed result stays up for HOLD_MS before the table moves on', async () => {
    const { done } = run();
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(LOCK_MS + ROLL_MS + HOLD_MS - 100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });

  it('reduced motion lands at once, then still holds the result', async () => {
    const { c, cues, done } = run({ reduced: true });
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(cues).toEqual(['lock', 'tick', 'land-clean']);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('CLEAN');
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(HOLD_MS);
    expect(settled).toBe(true);
  });
});

describe('playCheck on the job table: the pixel dice', () => {
  beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
  afterEach(() => vi.restoreAllMocks());
  const table = (o: Partial<Parameters<typeof playCheck>[1]> = {}, phone = false) => {
    const tb = document.createElement('div');
    tb.className = phone ? 'tb phone' : 'tb';
    const deal = document.createElement('div');
    deal.className = 'tb-deal';
    const cards = [0, 1, 2].map(() => {
      const c = document.createElement('div');
      c.className = 'tb-card';
      deal.append(c);
      return c;
    });
    tb.append(deal);
    document.body.append(tb);
    const cues: [string, number?][] = [];
    const done = playCheck(cards[1], { faces: [6, 3, 1], keep: 'high', kind: 'clean', red: false, reduced: false, cue: (n, x) => cues.push(x ? [n, x.level] : [n]), ...o });
    return { deal, card: cards[1], cues, done };
  };

  it('rolls beside the card, not on it: the faces, the lit die, the stamp after the dice', async () => {
    const { deal, card, cues, done } = table();
    await vi.runAllTimersAsync();
    await done;
    const roll = deal.querySelector(':scope > .tb-roll')!;
    expect(roll.querySelector('canvas')!.dataset.faces).toBe('6,3,1');
    expect(roll.querySelector('canvas')!.dataset.lit).toBe('0');
    expect(roll.querySelector('.qc-stamp')!.textContent).toBe('CLEAN');
    expect(roll.classList.contains('is-pass')).toBe(true);
    expect(card.querySelector('.qc-dice, .qc-stamp')).toBeNull();
    expect(card.classList.contains('is-pass')).toBe(true);
    // The tumble's clip, a tap per bounce (two and a settle, three dice), then the pass.
    expect(cues[0]).toEqual(['lock']);
    expect(cues[1]).toEqual(['tick']);
    expect(cues.filter((c) => c[0] === 'tap')).toHaveLength(9);
    expect(cues.at(-1)).toEqual(['land-clean']);
  });

  it('a crit lights both sixes', async () => {
    const { deal, done } = table({ faces: [6, 2, 6], kind: 'crit' });
    await vi.runAllTimersAsync();
    await done;
    expect(deal.querySelector('canvas')!.dataset.lit).toBe('0,2');
  });

  it('a click lands them with one tap', async () => {
    const { cues, done } = table();
    await vi.advanceTimersByTimeAsync(LOCK_MS + 100);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cues.filter((c) => c[0] === 'tap')).toEqual([['tap', 0.8]]);
    expect(cues.at(-1)).toEqual(['land-clean']);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await done;
  });

  it('a reroll replaces the dice, not adds to them', async () => {
    const first = table({ faces: [2, 1], kind: 'miss' });
    await vi.runAllTimersAsync();
    await first.done;
    const again = playCheck(first.card, { faces: [6], keep: 'high', kind: 'clean', red: false, reduced: true, cue: () => {} });
    await vi.runAllTimersAsync();
    await again;
    expect(first.deal.querySelectorAll('.tb-roll')).toHaveLength(1);
    expect(first.deal.querySelector('canvas')!.dataset.faces).toBe('6');
  });

  it('a red roll shakes the table as it lands', async () => {
    const { deal, done } = table({ faces: [3], kind: 'miss', red: true });
    await vi.runAllTimersAsync();
    await done;
    expect(deal.closest('.tb')!.classList.contains('tb-shake')).toBe(true);
  });

  it('a save glitches a landed miss to its new faces: the stamp scrambles to COST, the 5 lights, the cost lands', async () => {
    const { deal, card, done } = table({ faces: [3, 2, 1], kind: 'miss' });
    await vi.runAllTimersAsync();
    await done;
    const parked = document.createElement('div');
    parked.className = 'tb-parked';
    parked.append(card, deal.querySelector('.tb-roll')!);
    deal.prepend(parked);
    const cues: string[] = [];
    const saving = glitchSave(parked, { to: [5, 2, 1], keep: 'high', reduced: false, cue: (n) => cues.push(n) });
    expect(card.classList.contains('is-glitching')).toBe(true);
    await vi.advanceTimersByTimeAsync(GLITCH_MS / 2);
    expect(parked.querySelector('.qc-stamp')!.textContent).not.toBe('MISS');
    await vi.runAllTimersAsync();
    await saving;
    expect(cues).toEqual(['glitch', 'land-cost']);
    const roll = parked.querySelector('.tb-roll')!;
    expect(roll.querySelector('canvas')!.dataset.faces).toBe('5,2,1');
    expect(roll.querySelector('canvas')!.dataset.lit).toBe('0');
    expect(roll.querySelector('.qc-stamp')!.textContent).toBe('COST');
    for (const n of [roll, card]) expect([...n.classList].filter((c) => c.startsWith('is-'))).toEqual(['is-locked', 'is-cost'].filter((c) => n === card || c !== 'is-locked'));
  });

  it("on a phone a save glitches the card's own dice", async () => {
    const { card, done } = table({ faces: [2, 1], kind: 'miss' }, true);
    await vi.runAllTimersAsync();
    await done;
    const parked = document.createElement('div');
    parked.append(card);
    const saving = glitchSave(parked, { to: [5, 1], keep: 'high', reduced: true, cue: () => {} });
    await vi.runAllTimersAsync();
    await saving;
    expect(faces(card)).toEqual(['5', '1']);
    expect(kept(card)).toEqual(['5']);
    expect(card.querySelector('.qc-stamp')!.textContent).toBe('COST');
    expect(card.classList.contains('is-cost')).toBe(true);
  });

  it("settleParked brings a phone card's dice to the saved roll at once", async () => {
    const { card, done } = table({ faces: [2, 1], kind: 'miss' }, true);
    await vi.runAllTimersAsync();
    await done;
    const parked = document.createElement('div');
    parked.append(card);
    settleParked(parked, { faces: [5, 1], keep: 'high', kind: 'cost' });
    expect(faces(card)).toEqual(['5', '1']);
    expect(kept(card)).toEqual(['5']);
    expect(card.querySelector('.qc-stamp')!.textContent).toBe('COST');
    expect([...card.classList].filter((c) => /^is-(pass|cost|fail)$/.test(c))).toEqual(['is-cost']);
  });

  it('on a phone the table keeps the tray on the card', async () => {
    const { deal, card, done } = table({}, true);
    await vi.runAllTimersAsync();
    await done;
    expect(deal.querySelector('.tb-roll')).toBeNull();
    expect(card.querySelectorAll('.qc-die')).toHaveLength(3);
  });
});

describe('mission cues', () => {
  it('a tap plays the die knock at its share of the level and its rate, overlapping', () => {
    const audio = { cue: vi.fn() };
    missionCuePlayer(audio)('tap', { level: 0.5, rate: 0.92 });
    expect(audio.cue).toHaveBeenCalledWith('/sound/table/tap.ogg', expect.any(Number), { rate: 0.92, overlap: true });
  });

  it("missionCue('reroll') plays /sound/mission/reroll.ogg; the reused ones play the game's", () => {
    const audio = { cue: vi.fn() };
    const cue = missionCuePlayer(audio);
    cue('reroll');
    expect(audio.cue).toHaveBeenCalledWith('/sound/mission/reroll.ogg', expect.any(Number));
    // The dice landing, one sound per result (picked 2026-11-02).
    expect([MISSION_CUE_URL['land-crit'], MISSION_CUE_URL['land-clean'], MISSION_CUE_URL['land-cost'], MISSION_CUE_URL['land-miss']]).toEqual(['/sound/table/crit.ogg', '/sound/table/clean.ogg', '/sound/table/cost.ogg', '/sound/table/miss.ogg']);
    expect(MISSION_CUE_URL.lock).toBe('/sound/gig/select.ogg');
    expect(MISSION_CUE_URL.hover).toBe('/sound/ui/move.ogg');
    expect(MISSION_CUE_URL.clean).toBe('/sound/gig/clean.ogg');
    expect(MISSION_CUE_URL.blown).toBe('/sound/mission/blown.ogg');
    // Graft's table sounds (picked 2026-10-31): the dice tumble and a new beat's deal.
    expect(MISSION_CUE_URL.tick).toBe('/sound/table/roll.ogg');
    expect(MISSION_CUE_URL.beat).toBe('/sound/table/deal.ogg');
  });
});
