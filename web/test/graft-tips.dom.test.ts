import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountTips, SETTLE_MS, TIP_ORDER, TIPS, TIPS_KEY, tipText, type Tips } from '../src/room/table/tips';
import { SLOTS } from '../../shared/programs';
import { ALARM_MAX, ALARM_SHIFT, POSITION_NAMES, PRESS_NERVE, PUSH_NERVE } from '../../shared/dice';
import { APPROACH_STATS, FAVOUR_HEAT, MAX_PEOPLE } from '../../shared/hand';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });

let game: HTMLElement;
let root: HTMLElement;
let tips: Tips | null = null;
const target = (cls: string, r = rect(700, 400, 72, 72)) => {
  const n = document.createElement('div');
  n.className = cls;
  n.getBoundingClientRect = () => r;
  root.append(n);
  return n;
};
/** A piece inside a card (its odds line, its position mark), with a size so it counts as on screen. */
const inner = (card: HTMLElement, cls: string, tag: 'span' | 'img' = 'span') => {
  const n = document.createElement(tag);
  n.className = cls;
  n.getBoundingClientRect = () => rect(710, 440, 120, 16);
  card.append(n);
  return n;
};
const mount = (reduced = false) => (tips = mountTips(game, { reduced: () => reduced }));
const shown = () => document.querySelector<HTMLElement>('.gt-tip');
const title = () => shown()?.querySelector('.gt-title')?.textContent ?? null;
const ok = () => shown()!.querySelector<HTMLElement>('.gt-ok')!.click();
const stored = () => JSON.parse(localStorage.getItem(TIPS_KEY) ?? '{"off":false,"seen":[]}') as { off: boolean; seen: string[] };

beforeEach(() => {
  vi.useFakeTimers();
  setWidth(1600);
  localStorage.clear();
  game = document.createElement('div');
  game.id = 'game';
  game.getBoundingClientRect = () => rect(0, 0, 1600, 900);
  Object.defineProperty(game, 'clientWidth', { value: 1600, configurable: true });
  root = document.createElement('div');
  game.append(root);
  document.body.append(game);
});
afterEach(() => {
  tips?.clear();
  tips = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Graft tips', () => {
  it('a tip shows once ever', () => {
    target('tb-take');
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(title()).toBe('TAKE');
    ok();
    expect(shown()).toBeNull();
    // A fresh mount (a reload, a rewind): already seen.
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()).toBeNull();
  });

  it('a tip reads as a dossier: the gist, then labels down the left; the HUD words in their colours', () => {
    target('tb-alarm');
    mount().offer(['alarm'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()!.querySelector('.gt-gist')?.textContent).toBe('Costs fill it.');
    expect([...shown()!.querySelectorAll('.gt-label')].map((n) => n.textContent)).toEqual([`AT ${ALARM_SHIFT}`, `FULL · ${ALARM_MAX}`]);
    expect([...shown()!.querySelectorAll('.gt-row-text')].map((n) => n.textContent)).toEqual(['Every card is one step worse.', 'GET OUT.']);
    ok();
    mount().offer(['heat'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect([...shown()!.querySelectorAll('.gt-gist .gt-lit')].map((n) => `${n.className}:${n.textContent}`)).toEqual(['gt-lit gt-alarm:ALARM', 'gt-lit gt-heat:HEAT']);
  });

  it('a tip with no rows is its gist alone', () => {
    target('tb-take');
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()!.querySelector('.gt-rows')).toBeNull();
    expect(shown()!.querySelector('.gt-gist')?.textContent).toBe('Good rolls fill it. When the job ends, it sets your pay.');
  });

  it('TWO VOICES points at the JOB column on the stage, outside the table, before the roll', () => {
    const col = document.createElement('section');
    col.className = 'jc';
    col.getBoundingClientRect = () => rect(30, 160, 230, 400);
    game.append(col);
    inner(target('tb-card'), 'tb-odds');
    mount().offer(['roll', 'job'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(title()).toBe('TWO VOICES');
    // Beside the column, not over the job's title above it.
    expect(shown()!.dataset.side).toBe('right');
    ok();
    expect(title()).toBe('THE ROLL');
  });

  it('TWO VOICES waits while the JOB column is hidden (a phone keeps the table prose)', () => {
    const col = document.createElement('section');
    col.className = 'jc';
    col.getBoundingClientRect = () => rect(0, 0, 0, 0);
    game.append(col);
    mount().offer(['job'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()).toBeNull();
    expect(stored().seen).not.toContain('job');
  });

  it('one at a time, in order', () => {
    target('tb-take');
    target('tb-alarm');
    inner(target('tb-card'), 'tb-odds');
    mount().offer(['take', 'roll', 'alarm'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(document.querySelectorAll('.gt-tip')).toHaveLength(1);
    expect(title()).toBe('THE ROLL');
    ok();
    expect(title()).toBe('TAKE');
    ok();
    expect(title()).toBe('ALARM');
    ok();
    expect(shown()).toBeNull();
  });

  it('the target is found when the tip shows, not when it was offered (a re-render keeps it)', () => {
    inner(target('tb-card'), 'tb-odds');
    const old = target('tb-take');
    const t = mount(true);
    t.offer(['roll', 'take'], root);
    expect(title()).toBe('THE ROLL');
    old.replaceWith(Object.assign(target('tb-take'), {}));
    ok();
    expect(title()).toBe('TAKE');
  });

  it('a hidden target (no size) is skipped and stays unseen', () => {
    target('tb-nerve', rect(0, 0, 0, 0));
    mount(true).offer(['nerve'], root);
    expect(shown()).toBeNull();
    expect(stored().seen).not.toContain('nerve');
  });

  it('waits for the deal', () => {
    target('tb-take');
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(title()).toBe('TAKE');
  });

  it('with reduced motion it shows at once', () => {
    target('tb-take');
    mount(true).offer(['take'], root);
    expect(title()).toBe('TAKE');
  });

  it('a missing target is skipped and stays unseen', () => {
    mount().offer(['nerve'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()).toBeNull();
    expect(stored().seen).not.toContain('nerve');
  });

  it('clear drops the queue, not the seen list', () => {
    inner(target('tb-card'), 'tb-odds');
    inner(root.querySelector<HTMLElement>('.tb-card')!, 'tb-side-word');
    const t = mount();
    t.offer(['roll', 'position'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    ok();
    expect(title()).toBe('WHERE YOU STAND');
    t.clear();
    expect(shown()).toBeNull();
    expect(stored().seen).toEqual(['roll']);
  });

  it('SKIP TIPS turns them off', () => {
    target('tb-take');
    target('tb-alarm');
    const t = mount();
    t.offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    shown()!.querySelector<HTMLElement>('.gt-skip')!.click();
    expect(shown()).toBeNull();
    expect(t.enabled()).toBe(false);
    expect(stored().off).toBe(true);
    t.offer(['alarm'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()).toBeNull();
  });

  it('setEnabled(false) stops offers; onChange hears it', () => {
    target('tb-take');
    const t = mount();
    const heard: boolean[] = [];
    t.onChange = (on) => heard.push(on);
    t.setEnabled(false);
    t.offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()).toBeNull();
    expect(heard).toEqual([false]);
  });

  it('reset brings them back', () => {
    target('tb-take');
    const t = mount();
    t.offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    ok();
    t.reset();
    expect(stored()).toEqual({ off: false, seen: [] });
    t.offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(title()).toBe('TAKE');
  });

  it('storage throwing still shows tips', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    target('tb-take');
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(title()).toBe('TAKE');
    expect(() => ok()).not.toThrow();
  });

  it('stays inside the stage', () => {
    target('tb-take', rect(4, 820, 72, 72));
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    const tip = shown()!;
    const left = parseFloat(tip.style.left);
    const top = parseFloat(tip.style.top);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left + 300).toBeLessThanOrEqual(1600);
    expect(top).toBeLessThanOrEqual(900);
  });

  it('never covers its target', () => {
    const r = rect(700, 400, 280, 120);
    target('tb-take', r);
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('gt-tip') ? rect(parseFloat(this.style.left) || 0, parseFloat(this.style.top) || 0, 300, 140) : real.call(this);
    });
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    const tip = shown()!;
    const l = parseFloat(tip.style.left);
    const t = parseFloat(tip.style.top);
    const overlaps = l < r.right && l + 300 > r.left && t < r.bottom && t + 140 > r.top;
    expect(overlaps).toBe(false);
  });

  it('a choice card\'s tips sit below it (clear of the prose above), the dials\' above them', () => {
    const card = target('tb-card', rect(600, 300, 280, 120));
    inner(card, 'tb-odds');
    target('tb-take', rect(400, 560, 72, 72));
    mount(true).offer(['roll', 'take'], root);
    expect(shown()!.dataset.side).toBe('below');
    expect(parseFloat(shown()!.style.top)).toBeGreaterThanOrEqual(420);
    ok();
    expect(shown()!.dataset.side).toBe('above');
  });

  it("at phone width it's a strip", () => {
    Object.defineProperty(game, 'clientWidth', { value: 420, configurable: true });
    target('tb-take');
    mount().offer(['take'], root);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(shown()!.classList.contains('strip')).toBe(true);
  });

  it('the PROGRAMS tip reads the slots; FIREWALL reads as a program (programs spec §2.6)', () => {
    expect(TIPS.program.title).toBe('PROGRAMS');
    expect(tipText('program')).toContain(`${SLOTS[1]}, ${SLOTS[2]}, ${SLOTS[3]} or ${SLOTS[4]}`);
    expect(tipText('program')).toContain('ALARM +1');
    expect(tipText('program')).toContain('lacquer');
    expect(tipText('armour')).toBe('FIREWALL cancels one cost, then burns out. Its slot stays full.');
    expect(TIP_ORDER.indexOf('program')).toBe(TIP_ORDER.indexOf('call') + 1);
  });

  it('the text reads the rules', () => {
    // RESIST's price by its dice (roll lifecycle spec §1.3), and NERVE naming it.
    expect(tipText('resist')).toContain('6 Costs nothing. 4–5 One NERVE. LOWER Two NERVE.');
    expect(tipText('nerve')).toContain('RESIST Up to 2');
    // What the reviewer caught: HARD's TAKE 1 starts at tier 2; a 0d roll keeps the lowest; a fence's TAKE +1 isn't on a GET OUT; a call in the dark is +1d.
    expect(tipText('approach')).toContain('on a job of tier 2 or more');
    expect(tipText('roll')).toContain('keep the lowest');
    expect(tipText('people')).toContain('unless you GET OUT');
    expect(tipText('call')).toContain('+1d if you’re already in the dark');
    expect(tipText('favour')).toContain(`${FAVOUR_HEAT}`);
    expect(tipText('nerve')).toContain(`${PUSH_NERVE}`);
    expect(tipText('press')).toContain(`${PRESS_NERVE} NERVE`);
    expect(tipText('people')).toContain(`${MAX_PEOPLE}`);
    for (const p of ['dark', 'open', 'wire'] as const) expect(tipText('position')).toContain(POSITION_NAMES[p]);
    expect(tipText('position')).toContain('A 4–5 makes you pick 1 cost');
    expect(tipText('alarm')).toContain('GET OUT');
    expect(tipText('alarm')).toContain(`${ALARM_MAX}`);
    for (const stats of Object.values(APPROACH_STATS)) for (const s of stats) expect(tipText('approach')).toContain(s.toUpperCase());
  });

  it('the callout sits over the table (24) but under the full screens (29) and the HUD (30)', () => {
    const css = readFileSync('web/src/room/table/table.css', 'utf8');
    const z = Number(/\.gt-tip \{[^}]*z-index: (\d+)/.exec(css)?.[1]);
    expect(z).toBeGreaterThan(24);
    expect(z).toBeLessThan(29);
  });
});
