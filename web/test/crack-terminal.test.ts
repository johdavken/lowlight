import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openTerminal } from '../src/ui/crack/terminal';
import { SKINS, skinOf } from '../src/ui/crack/skins';
import type { TerminalSkin } from '../../shared/crack';
import { likeness, makeTerminal, parseWords, type TerminalSetup } from '../../shared/crack';

const WORDS = parseWords(fs.readFileSync(path.join(__dirname, '../../world/gear/words.md'), 'utf8')).byLength[6];
const SETUP: TerminalSetup = { seed: 'quest.hicks.back-door@3|desk|grab', length: 6, words: WORDS, extraBracket: false, strikeOne: false, ghost: false, hint: null, tries: 4 };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function open(setup: TerminalSetup = SETUP, extra: { alarm?: number } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const onDone = vi.fn();
  const cues: string[] = [];
  const t = openTerminal(host, { setup, title: 'Back Door', cue: (c) => cues.push(c), onDone, reduced: false, ...extra });
  return { host, onDone, cues, t, term: makeTerminal(setup) };
}
const wordEl = (host: HTMLElement, w: string) => host.querySelector<HTMLElement>(`.ct-word[data-word="${w}"]`)!;
const tries = (host: HTMLElement) => host.querySelectorAll('.ct-tries i.on').length;

describe('the terminal window', () => {
  it('renders the 32 dump lines, the tries blocks and an empty log', () => {
    const { host, cues } = open();
    expect(host.querySelectorAll('.ct-dump .ct-row')).toHaveLength(32);
    expect(host.querySelector('.ct-row')!.textContent!.length).toBeGreaterThanOrEqual(12);
    expect(tries(host)).toBe(4);
    expect(host.querySelectorAll('.ct-log > *')).toHaveLength(0);
    expect(cues).toEqual(['open']);
  });

  it('a wrong word logs LIKENESS k/L and drops a try block', () => {
    const { host, term, cues } = open();
    const wrong = term.words.find((w) => w.word !== term.password)!.word;
    wordEl(host, wrong).click();
    expect(host.querySelector('.ct-log')!.textContent).toContain(`LIKENESS ${likeness(wrong, term.password)}/6`);
    expect(tries(host)).toBe(3);
    expect(wordEl(host, wrong).classList.contains('struck')).toBe(true);
    // The key at once, the likeness just after.
    expect(cues.at(-1)).toBe('guess');
    vi.advanceTimersByTime(120);
    expect(cues.slice(-2)).toEqual(['guess', 'wrong']);
  });

  it('a bracket strikes a dud', () => {
    const { host, term, cues } = open();
    host.querySelector<HTMLElement>('.ct-bracket[data-i="0"]')!.click();
    vi.advanceTimersByTime(120);
    expect(cues.slice(1)).toEqual(['guess', 'dud']);
    expect(wordEl(host, term.dudOrder[0]).classList.contains('struck')).toBe(true);
    expect(host.querySelector('.ct-log')!.textContent).toContain('DUD REMOVED');
    expect(host.querySelector('.ct-bracket[data-i="0"]')!.classList.contains('used')).toBe(true);
  });

  it('the right word: ACCESS GRANTED, then onDone with the moves', async () => {
    const { host, term, onDone, cues } = open();
    wordEl(host, term.password).click();
    expect(host.querySelector('.ct-log')!.textContent).toContain('ACCESS GRANTED');
    vi.advanceTimersByTime(120);
    expect(cues.slice(1)).toEqual(['guess', 'granted']);
    await vi.runAllTimersAsync();
    expect(onDone).toHaveBeenCalledWith({ moves: [{ word: term.password }] });
    expect(host.querySelector('.ct-window')).toBeNull();
  });

  it('a lockout calls onDone', async () => {
    const { host, term, onDone, cues } = open();
    const wrong = term.words.map((w) => w.word).filter((w) => w !== term.password).slice(0, 4);
    for (const w of wrong) wordEl(host, w).click();
    expect(host.querySelector('.ct-log')!.textContent).toContain('LOCKED OUT');
    vi.advanceTimersByTime(120);
    expect(cues.at(-1)).toBe('locked');
    await vi.runAllTimersAsync();
    expect(onDone).toHaveBeenCalledWith({ moves: wrong.map((word) => ({ word })) });
  });

  it('Esc and LEAVE hand back the moves so far (a walk-away)', () => {
    const { host, term, onDone } = open();
    const wrong = term.words.find((w) => w.word !== term.password)!.word;
    wordEl(host, wrong).click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDone).toHaveBeenCalledWith({ moves: [{ word: wrong }] });
    const again = open();
    again.host.querySelector<HTMLButtonElement>('.ct-leave')!.click();
    expect(again.onDone).toHaveBeenCalledWith({ moves: [] });
    expect(again.cues).toEqual(['open', 'leave']);
  });

  it('the third wrong word warns of the last try; the lockout itself sounds once', () => {
    const { host, term, cues } = open();
    const wrong = term.words.map((w) => w.word).filter((w) => w !== term.password).slice(0, 4);
    const after: string[][] = [];
    for (const w of wrong) {
      const n = cues.length;
      wordEl(host, w).click();
      vi.advanceTimersByTime(120);
      after.push(cues.slice(n));
    }
    expect(after).toEqual([['guess', 'wrong'], ['guess', 'wrong'], ['guess', 'last'], ['guess', 'locked']]);
  });

  it('the cursor ticks on arrows and hover, but not over a struck word or once it is over', () => {
    const { host, term, cues } = open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(cues.at(-1)).toBe('hover');
    const wrong = term.words.find((w) => w.word !== term.password)!.word;
    wordEl(host, wrong).click();
    const n = cues.length;
    wordEl(host, wrong).dispatchEvent(new MouseEvent('mouseenter'));
    expect(cues.length).toBe(n);
    wordEl(host, term.password).dispatchEvent(new MouseEvent('mouseenter'));
    expect(cues.at(-1)).toBe('hover');
    wordEl(host, term.password).click();
    const m = cues.length;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cues.length).toBe(m);
  });

  it('arrows move between words and brackets, and Enter picks', () => {
    const { host, onDone } = open();
    const picks = [...host.querySelectorAll<HTMLElement>('.ct-word, .ct-bracket')];
    expect(document.activeElement).toBe(picks[0]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(document.activeElement).toBe(picks[1]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(document.activeElement).toBe(picks[0]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.querySelectorAll('.ct-log > *').length).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('the ghost letter and the hint line show', () => {
    const setup = { ...SETUP, ghost: true, hint: 'Ember: not the one with the Q' };
    const { host, term } = open(setup);
    expect(host.querySelector('.ct-ghost')!.textContent).toBe(`LETTER ${term.ghost!.index + 1}: ${term.ghost!.letter}`);
    expect(host.querySelector('.ct-hint')!.textContent).toBe('Ember: not the one with the Q');
  });
});

describe('skins', () => {
  const ALL = Object.keys(SKINS) as TerminalSkin[];
  const win = (host: HTMLElement) => host.querySelector<HTMLElement>('.ct-window')!;

  it('opens with its skin class; no skin or an unknown one is green', () => {
    expect(win(open({ ...SETUP, skin: 'amber' }).host).classList.contains('ct-skin-amber')).toBe(true);
    expect(win(open(SETUP).host).classList.contains('ct-skin-green')).toBe(true);
    expect(win(open({ ...SETUP, skin: 'nope' as never }).host).classList.contains('ct-skin-green')).toBe(true);
    expect(skinOf({})).toBe('green');
    expect(ALL.sort()).toEqual(['amber', 'dock', 'green', 'holo', 'ice', 'meridian', 'meridian-deaf', 'pocket', 'sentinel', 'slab']);
  });

  it('green keeps today\'s words', () => {
    const g = SKINS.green;
    expect([g.tries, g.likeness(2, 6), g.dud, g.reset, g.nothing, g.leave]).toEqual(['TRIES', 'LIKENESS 2/6', 'DUD REMOVED', 'TRIES RESET', 'NOTHING', 'LEAVE']);
  });

  it('the same moves log the same facts in every skin, in its words, with the same cues', () => {
    const term = makeTerminal(SETUP);
    const wrong = term.words.find((w) => w.word !== term.password)!.word;
    const k = likeness(wrong, term.password);
    for (const skin of ALL) {
      const { host, cues } = open({ ...SETUP, skin });
      wordEl(host, wrong).click();
      vi.advanceTimersByTime(120);
      expect(host.querySelector('.ct-log')!.textContent, skin).toContain(SKINS[skin].likeness(k, 6));
      expect(host.querySelector('.ct-leave')!.textContent, skin).toBe(SKINS[skin].leave);
      expect(host.querySelector('.ct-tries-k')!.textContent, skin).toBe(SKINS[skin].tries);
      expect(cues, skin).toEqual(['open', 'guess', 'wrong']);
      document.body.innerHTML = '';
    }
  });

  it('each skin draws its pieces', () => {
    const sel = { plate: '.ct-plate', keys: '.ct-keys', name: '.ct-deck-name', signal: '.ct-signal', stencil: '.ct-stencil', manifest: '.ct-manifest', column: '.ct-dump.ct-one-col', alarm: '.ct-alarm', linked: '.ct-linked', corners: '.ct-corner' } as const;
    for (const skin of ALL) {
      const { host } = open({ ...SETUP, skin, deck: 'Stall build' });
      for (const [piece, q] of Object.entries(sel)) expect(Boolean(host.querySelector(q)), `${skin} ${piece}`).toBe(SKINS[skin].pieces.includes(piece as never));
      document.body.innerHTML = '';
    }
    expect(open({ ...SETUP, skin: 'slab', deck: 'Stall build' }).host.querySelector('.ct-deck-name')!.textContent).toBe('STALL BUILD');
    expect(open({ ...SETUP, skin: 'meridian-deaf' }).host.querySelector('.ct-signal')!.textContent).toContain('NO UPLINK · LOCAL ONLY');
  });

  it('ice: the alarm segments and the deck it linked', () => {
    const none = open({ ...SETUP, skin: 'ice', deck: null }, { alarm: 1 });
    expect(none.host.querySelector('.ct-linked')!.textContent).toBe('LINKED · NO DECK');
    expect(none.host.querySelectorAll('.ct-alarm i')).toHaveLength(3);
    expect(none.host.querySelectorAll('.ct-alarm i.on')).toHaveLength(1);
    expect(open({ ...SETUP, skin: 'ice', deck: 'Chrome deck' }).host.querySelector('.ct-linked')!.textContent).toBe('LINKED · CHROME DECK');
  });

  it('a lockout lights the next alarm segment, never past 3', () => {
    for (const [at, lit] of [[0, 1], [2, 3], [3, 3]] as const) {
      const { host, term } = open({ ...SETUP, skin: 'ice' }, { alarm: at });
      for (const w of term.words.map((x) => x.word).filter((x) => x !== term.password).slice(0, 4)) wordEl(host, w).click();
      expect(host.querySelectorAll('.ct-alarm i'), `at ${at}`).toHaveLength(3);
      expect(host.querySelectorAll('.ct-alarm i.on'), `at ${at}`).toHaveLength(lit);
      document.body.innerHTML = '';
    }
  });

  it('the ghost letter and the hint show in amber and pocket', () => {
    for (const skin of ['amber', 'pocket'] as const) {
      const { host } = open({ ...SETUP, skin, ghost: true, hint: 'Ember: not the one with the Q' });
      expect(host.querySelector('.ct-ghost'), skin).not.toBeNull();
      expect(host.querySelector('.ct-hint')!.textContent, skin).toBe('Ember: not the one with the Q');
      document.body.innerHTML = '';
    }
  });

  it('pocket: one column of 32, the same picks in the same order, the focused pick scrolls into view', () => {
    const order = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.ct-word, .ct-bracket')].map((n) => n.dataset.word ?? `b${n.dataset.i}`);
    const green = order(open(SETUP).host);
    document.body.innerHTML = '';
    // Only the dump scrolls: scrollIntoView would scroll the stage behind the phone too.
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { host } = open({ ...SETUP, skin: 'pocket' });
    expect(host.querySelectorAll('.ct-dump .ct-col')).toHaveLength(1);
    expect(host.querySelectorAll('.ct-dump .ct-row')).toHaveLength(32);
    expect(order(host)).toEqual(green);
    const dump = host.querySelector<HTMLElement>('.ct-dump')!;
    const picks = [...host.querySelectorAll<HTMLElement>('.ct-word, .ct-bracket')];
    Object.defineProperty(dump, 'clientHeight', { value: 200 });
    Object.defineProperty(picks[1], 'offsetTop', { value: 500 });
    Object.defineProperty(picks[1], 'offsetHeight', { value: 20 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(document.activeElement).toBe(picks[1]);
    expect(dump.scrollTop).toBe(500 + 20 - 200);
    expect(scroll).not.toHaveBeenCalled();
  });
});
