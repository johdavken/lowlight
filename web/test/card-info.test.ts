import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abilityInfo, choiceInfo, DWELL_MS, favourInfo, HOLD_MS, mountCardInfo, plainInfo, programInfo, recruitInfo, slotInfo, type Info } from '../src/room/table/card-info';
import type { Pool } from '../../shared/dice';

const pool = (o: Partial<Pool> = {}): Pool => ({ stat: 'COOL', base: 3, dice: 4, parts: [{ label: 'SMOOTH', dice: 1, kind: 'setup' }], position: 'open', noDeck: false, effect: 'fair', effectParts: [], ...o });
const state = (o: Partial<Parameters<typeof choiceInfo>[0]['state']> = {}) => ({ dice: 4, position: 'open' as const, effect: 'fair' as const, tier: undefined, lacquer: 0, nerve: 0, ran: [] as string[], extra: [] as string[], why: null, ...o });

describe('a choice card in words', () => {
  it('says the dice, the position and what each result fills', () => {
    const i = choiceInfo({ pool: pool(), state: state() });
    expect(i.title).toBe('COOL · 4 DICE');
    expect(i.lines).toEqual([
      'COOL 3 +SMOOTH. Keep the highest.',
      'IN THE OPEN: a 4–5 makes you pick 1 cost, a miss 2.',
      'FAIR: a crit fills 3 TAKE, a 6 fills 2, a 4–5 fills 1.',
    ]);
  });
  it('reads what the card would roll, not the bare pool', () => {
    const i = choiceInfo({ pool: pool(), state: state({ dice: 5, position: 'dark', effect: 'big', extra: ['PUSH'] }) });
    expect(i.title).toBe('COOL · 5 DICE');
    expect(i.lines[0]).toBe('COOL 3 +SMOOTH +PUSH. Keep the highest.');
    expect(i.lines[1]).toBe('IN THE DARK: a 4–5 costs nothing, a miss makes you pick 1.');
    expect(i.lines[2]).toBe('BIG: a crit fills 4 TAKE, a 6 fills 3, a 4–5 fills 2.');
  });
  it('no dice: two, keep the lower', () => expect(choiceInfo({ pool: pool({ dice: 0, base: 1, parts: [{ label: 'NO DECK', dice: -1 }] }), state: state({ dice: 0 }) }).lines[0]).toBe('COOL 1 −NO DECK. No dice: roll two, keep the lower.'));
  it('names the cut and what lifts it', () => {
    const i = choiceInfo({ pool: pool(), tierOf: 2, state: state({ effect: 'small', tier: { label: 'TIER 2 −1', lifted: false } }) });
    expect(i.lines).toContain('TIER 2 −1: a HAND recruit called on this roll lifts it, or a Q2+ deck running a program or on a grid roll.');
  });
  it('names what lifted it', () => {
    expect(choiceInfo({ pool: pool(), state: state({ tier: { label: 'REN · HAND', lifted: true } }) }).lines).toContain('Tier cut lifted by REN · HAND.');
  });
  it('lists the other steps, the deck, programs, the route and a refusal', () => {
    const i = choiceInfo({ pool: pool({ effectParts: [{ label: 'HEAT 6', step: -1 }, { label: 'TIER 2 −1', step: -1 }], deck: { match: 'outclassed', broke: false, hidden: false, chrome: false } }), route: 1, red: true, state: state({ ran: ['SOLVENT'], lacquer: 1, nerve: 1, why: 'ALREADY SMALL' }) });
    expect(i.lines).toEqual(expect.arrayContaining(['Effect moved by HEAT 6 −1.', 'Deck: OUTCLASSED.', 'Runs SOLVENT.', 'The lacquer notices: ALARM +1.', 'Loading costs 1 NERVE.', 'This route: ALARM +1, whatever the dice.', 'One shot: no PUSH, no programs.', "Can't go: ALREADY SMALL."]));
  });
  it('a roll that fills no TAKE has no effect line', () => {
    expect(choiceInfo({ pool: pool({ effect: undefined }), state: state({ effect: undefined }) }).lines.some((l) => l.includes('fills'))).toBe(false);
  });
});

describe('a plain choice', () => {
  it('a crack says what it is', () => expect(plainInfo({ crack: { length: 6, tries: 4, take: 2 } }, true)).toEqual({ title: 'CRACK', lines: ['A terminal: 6-letter words, 4 tries. A win fills 2 TAKE, a lockout raises ALARM.'] }));
  it('a crack under the tier cut says what it really fills', () => expect(plainInfo({ crack: { length: 6, tries: 4, take: 1 } }, true)!.lines[0]).toContain('A win fills 1 TAKE'));
  it('a crack that fills no TAKE says only the lockout', () => expect(plainInfo({ crack: { length: 6, tries: 4 } }, false)!.lines).toEqual(['A terminal: 6-letter words, 4 tries. A lockout raises ALARM.']));
  it('a route with ALARM says so', () => expect(plainInfo({ alarm: 1 }, true)!.lines).toEqual(['This route: ALARM +1, whatever the dice.']));
  it('an ordinary line has no panel', () => expect(plainInfo({}, true)).toBeNull());
});

describe('a recruit', () => {
  const dez = { name: 'Dez Vance', spec: 'runner' as const, grade: 1 as const, traits: [{ label: 'KNOWS THE TRAINS', good: true }] };
  it('says what they do, whether they match the tier, and the plays here', () => {
    const i = recruitInfo(dez, { tier: 2, free: 1, risk: null, down: false, plays: ['TECH · 4D · DARK · FAIR'] });
    expect(i.title).toBe('DEZ VANCE · RUNNER · HAND');
    expect(i.lines).toEqual(['On TECH: a step out of danger (+1d if you’re already in the dark). Elsewhere +1d.', 'Lifts the tier cut on the roll you call them on.', '+ KNOWS THE TRAINS', '1 free call.', 'Here: TECH · 4D · DARK · FAIR']);
  });
  it('below the tier says what it needs', () => expect(recruitInfo(dez, { tier: 3 }).lines).toContain('Below tier 3: only PRO or better lifts the cut.'));
  it('tier 1 says nothing of the cut', () => expect(recruitInfo(dez, { tier: 1 }).lines.join()).not.toContain('cut'));
  it('a fence plays at the end', () => expect(recruitInfo({ ...dez, spec: 'fence' }, {}).lines[0]).toBe('Plays at the end: TAKE +1, unless the job blew or went to GET OUT. Fences don’t stack.'));
  it('a fence says nothing of the cut: nobody calls them', () => expect(recruitInfo({ ...dez, spec: 'fence' }, { tier: 2 }).lines.join()).not.toContain('cut'));
  it('the again risk and a recruit who is down', () => {
    expect(recruitInfo(dez, { free: 0, risk: 3 }).lines).toContain('Called again: on a miss, a 1 in 3 risk to them.');
    expect(recruitInfo(dez, { down: true }).lines).toContain('Down: out of this job.');
  });
});

describe('a program and a slot', () => {
  const p = { name: 'SOLVENT', stat: 'tech', kind: 'position' as const, line: 'Strips the lacquer back a layer.' };
  it('says what it does and how it stands against the tier', () => {
    expect(programInfo(p, { tier: 2, quality: 2 })).toEqual({ title: 'SOLVENT', lines: ['Strips the lacquer back a layer.', 'On TECH: a step out of danger.', 'Lifts the tier cut on any roll it runs on.'] });
    expect(programInfo(p, { tier: 2, quality: 1 }).lines).toContain('Below the job’s tier: each run costs ALARM +1, and it lifts no cut.');
  });
  it('SCRUB says what it does', () => expect(programInfo({ ...p, stat: 'any', kind: 'quiet' }, {}).lines).toContain('Any roll: takes 1 off the heat you leave with.'));
  it('lists where it would run here', () => expect(programInfo(p, { plays: ['TECH · DARK · FAIR'] }).lines).toContain('Here: TECH · DARK · FAIR'));
  it('a dead deck or a burned program says so, and lists no plays', () => {
    expect(programInfo(p, { dead: true, plays: ['TECH · DARK · FAIR'] }).lines).toEqual(['Strips the lacquer back a layer.', 'The deck is dead: nothing runs.']);
    expect(programInfo({ ...p, kind: 'firewall' }, { burned: true }).lines).toContain('Burned: used up on this job.');
    expect(slotInfo({ setup: false, dead: true }).lines).toEqual(['The deck is dead: nothing loads.']);
  });
  it('a played ability and a used favour say so', () => {
    expect(abilityInfo({ label: 'Steady', words: 'Doesn’t shake.', nerve: 1, used: true }).lines).toEqual(['Doesn’t shake.', 'Played.']);
    expect(favourInfo(undefined, true).lines).toEqual(['Used.']);
  });
  it('a slot says what loading costs', () => {
    expect(slotInfo({ setup: true })).toEqual({ title: 'LOAD', lines: ['Load a program here, free.'] });
    expect(slotInfo({ setup: false }).lines).toEqual(['Load a program mid-job: 1 NERVE.']);
  });
});

describe('the panel', () => {
  let root: HTMLElement;
  let card: HTMLButtonElement;
  const INFO: Info = { title: 'COOL · 4 DICE', lines: ['One.', 'Two.'] };
  const fire = (t: EventTarget, type: string, o: Record<string, unknown> = {}) => {
    const { pointerType, ...init } = o;
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(e, 'pointerType', { value: pointerType ?? 'mouse' });
    t.dispatchEvent(e);
    return e;
  };
  const panel = () => root.querySelector<HTMLElement>('.tb-info')!;
  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement('div');
    card = document.createElement('button');
    card.dataset.id = 'talk';
    root.append(card);
    document.body.append(root);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows after the dwell, not before', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS - 1);
    expect(panel().hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(panel().hidden).toBe(false);
    expect(panel().textContent).toContain('COOL · 4 DICE');
    expect(panel().textContent).toContain('Two.');
  });
  it('a click before the dwell cancels it', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS - 100);
    fire(card, 'pointerdown');
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
  });
  it('a click closes it, and it stays closed on that card', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    fire(card, 'pointerdown');
    expect(panel().hidden).toBe(true);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
  });
  it('a click that redraws the card under a still pointer brings nothing up', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover', { clientX: 50, clientY: 50 });
    fire(card, 'pointerdown', { clientX: 50, clientY: 50 });
    const redrawn = document.createElement('button');
    redrawn.dataset.id = 'talk';
    card.replaceWith(redrawn);
    fire(redrawn, 'pointerover', { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
    // A small move on the same card stays quiet too: it was clicked.
    fire(redrawn, 'pointermove', { clientX: 70, clientY: 50 });
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
  });
  it('a new card dealt under a still pointer waits for the pointer to move', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover', { clientX: 50, clientY: 50 });
    fire(card, 'pointerdown', { clientX: 50, clientY: 50 });
    const next = document.createElement('button');
    next.dataset.id = 'grab';
    card.replaceWith(next);
    fire(next, 'pointerover', { clientX: 50, clientY: 50 });
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
    fire(next, 'pointermove', { clientX: 70, clientY: 50 });
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(false);
  });
  it('after a click, leaving and coming back works', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover', { clientX: 50, clientY: 50 });
    fire(card, 'pointerdown', { clientX: 50, clientY: 50 });
    fire(card, 'pointerout', { relatedTarget: root, clientX: 90, clientY: 90 });
    fire(card, 'pointerover', { clientX: 60, clientY: 60 });
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(false);
  });
  it('touch: the browser’s long-press menu opens the panel instead', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOLD_MS - 50);
    const e = fire(card, 'contextmenu');
    expect(e.defaultPrevented).toBe(true);
    expect(panel().hidden).toBe(false);
  });
  it('a scrolled table places the panel where the card is', () => {
    mountCardInfo(root, () => INFO);
    root.scrollTop = 100;
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().style.top).toBe('100px');
  });
  it('moving off closes it', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    fire(card, 'pointerout', { relatedTarget: root });
    expect(panel().hidden).toBe(true);
  });
  it('moving across a card keeps it open', () => {
    mountCardInfo(root, () => INFO);
    const child = document.createElement('span');
    card.append(child);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    fire(card, 'pointerout', { relatedTarget: child });
    fire(child, 'pointerover');
    expect(panel().hidden).toBe(false);
  });
  it('reads the card at the moment it opens', () => {
    let n = 0;
    mountCardInfo(root, () => ({ title: `T${++n}`, lines: [] }));
    fire(card, 'pointerover');
    expect(n).toBe(0);
    vi.advanceTimersByTime(DWELL_MS);
    expect(n).toBe(1);
  });
  it('an empty slot has no panel', () => {
    mountCardInfo(root, () => INFO);
    card.dataset.state = 'empty';
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(true);
  });
  it('no info, no panel', () => {
    mountCardInfo(root, () => null);
    fire(card, 'pointerover');
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(true);
  });
  it('hide closes it and stops a pending dwell', () => {
    const c = mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    c.hide();
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(true);
  });
  it('a card gone before the dwell shows nothing', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover');
    card.remove();
    vi.advanceTimersByTime(DWELL_MS);
    expect(panel().hidden).toBe(true);
  });
  it('touch: a long press opens it, lifting closes it, and the click after is swallowed', () => {
    const onClick = vi.fn();
    card.addEventListener('click', onClick);
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOLD_MS);
    expect(panel().hidden).toBe(false);
    fire(card, 'pointerup', { pointerType: 'touch' });
    expect(panel().hidden).toBe(true);
    fire(card, 'click');
    expect(onClick).not.toHaveBeenCalled();
    fire(card, 'click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('touch: a long press the browser sends no click for leaves the next tap alone', () => {
    const onClick = vi.fn();
    card.addEventListener('click', onClick);
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(HOLD_MS);
    fire(card, 'pointerup', { pointerType: 'touch' });
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    fire(card, 'pointerup', { pointerType: 'touch' });
    fire(card, 'click');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('touch: a tap still clicks and shows nothing', () => {
    const onClick = vi.fn();
    card.addEventListener('click', onClick);
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(100);
    fire(card, 'pointerup', { pointerType: 'touch' });
    fire(card, 'click');
    vi.advanceTimersByTime(1000);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(panel().hidden).toBe(true);
  });
  it('touch: a drag cancels the long press', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    fire(card, 'pointermove', { pointerType: 'touch', clientX: 40, clientY: 10 });
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
  });
  it('a touch pointerover alone starts nothing', () => {
    mountCardInfo(root, () => INFO);
    fire(card, 'pointerover', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    expect(panel().hidden).toBe(true);
  });
});
