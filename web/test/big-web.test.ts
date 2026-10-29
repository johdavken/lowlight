import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountQuestCards } from '../src/room/quest-cards';
import { mountQuestList } from '../src/room/quest-list';
import { mountReadBoard } from '../src/room/read-board';
import type { QuestState } from '../../shared/types';

afterEach(() => {
  document.body.innerHTML = '';
});
const host = () => {
  const h = document.createElement('div');
  document.body.append(h);
  return h;
};
type Active = NonNullable<QuestState['active']>;
const base = (big: NonNullable<Active['big']>, o: Partial<Active> = {}): Active => ({
  id: 'north-gate',
  title: 'North Gate',
  beat: '!legwork',
  choices: [{ id: '!read-now', line: 'READ IT NOW' }],
  alarm: 0,
  edge: 2,
  heat: 1,
  pay: [1500, 3000],
  big,
  ...o,
});
const LEGWORK = base({
  section: 'legwork',
  go: '03:00',
  left: 130,
  clues: [{ id: 'strap', text: "A courier's strap snagged on the ferry railing." }],
  marks: [{ place: 'ferry-stairs', name: 'Ferry Stairs', line: 'the courier came through here' }],
});
const cards = (a: Active, o: { onRead?: (p: [string, string, string]) => void } = {}) => {
  const h = host();
  const onChoose = vi.fn();
  mountQuestCards(h, { onChoose, onTalk: vi.fn(), ...(o.onRead ? { onRead: o.onRead } : {}) }).show(a, 'Story.');
  return { h, onChoose };
};

describe('the big job panel', () => {
  it('the strip: LEGWORK · GO 03:00 · IN 2H 10M, then THE READ / THE APPROACH / OUT', () => {
    const { h } = cards(LEGWORK);
    expect(h.querySelector('.qc-section')!.textContent).toBe('LEGWORK');
    expect(h.querySelector('.qc-go')!.textContent).toBe('GO 03:00 · IN 2H 10M');
    for (const [section, word] of [['read', 'THE READ'], ['approach', 'THE APPROACH'], ['out', 'OUT']] as const) {
      document.body.innerHTML = '';
      const { h: h2 } = cards(base({ ...LEGWORK.big!, section, left: null }));
      expect(h2.querySelector('.qc-section')!.textContent).toBe(word);
      expect(h2.querySelector('.qc-go')).toBeNull();
    }
  });

  it('CLUES folds out with the clue texts', () => {
    const { h } = cards(LEGWORK);
    const clues = h.querySelector<HTMLDetailsElement>('details.qc-clues')!;
    expect(clues.querySelector('summary')!.textContent).toBe('CLUES · 1');
    expect([...clues.querySelectorAll('li')].map((li) => li.textContent)).toEqual(["A courier's strap snagged on the ferry railing."]);
  });

  it('legwork with no scene: the marked places listed and READ IT NOW', () => {
    const { h, onChoose } = cards(LEGWORK);
    expect([...h.querySelectorAll('.qc-marks li')].map((li) => li.textContent)).toEqual(['Ferry Stairs · the courier came through here']);
    h.querySelector<HTMLElement>('.qc-card[data-choice="!read-now"]')!.click();
    expect(onChoose).toHaveBeenCalledWith('!read-now', undefined);
  });

  it('the read: the panel shows the board, and READ IT sends the picks', () => {
    const onRead = vi.fn();
    const { h } = cards(base({ ...LEGWORK.big!, section: 'read', left: null, read: { parts: ['', ' gets through ', ' because ', '.'], bank: ['the courier', 'the dock', 'the river'] } }, { beat: '!read', choices: [] }), { onRead });
    expect(h.querySelector('.rb')).not.toBeNull();
    const chip = (w: string) => [...h.querySelectorAll<HTMLElement>('.rb-chip')].find((c) => c.textContent === w)!;
    const slot = (i: number) => h.querySelectorAll<HTMLElement>('.rb-slot')[i];
    slot(0).click();
    chip('the courier').click();
    slot(1).click();
    chip('the dock').click();
    slot(2).click();
    chip('the river').click();
    h.querySelector<HTMLButtonElement>('.rb-read')!.click();
    expect(onRead).toHaveBeenCalledWith(['the courier', 'the dock', 'the river']);
  });

  it('route cards read HACK · MEDIUM with the why line', () => {
    const brief = { id: 'g', title: 'North Gate', tier: 'easy' as const, kind: 'hack' as const, place: 'x', client: 'c', target: 't', take: 'k', text: 'x' };
    const { h } = cards(
      base(
        { ...LEGWORK.big!, section: 'approach', left: null, routes: { wire: { kind: 'hack', tier: 'easy', why: ['−1 YOU KNOW THE GATE', '−1 HICKS'], seed: 7, brief } } },
        { beat: 'gate', choices: [{ id: 'wire', line: 'Loop the cameras.' }, { id: 'walk', line: 'Walk in.' }] },
      ),
    );
    const wire = h.querySelector('.qc-card[data-choice="wire"]')!;
    expect(wire.querySelector('.qc-gig')!.textContent).toBe('HACK · EASY');
    expect(wire.querySelector('.qc-why')!.textContent).toBe('−1 YOU KNOW THE GATE · −1 HICKS');
    expect(h.querySelector('.qc-card[data-choice="walk"] .qc-gig')).toBeNull();
  });
});

describe('the read board', () => {
  const board = (onRead = vi.fn()) => {
    const h = host();
    mountReadBoard(h, { parts: ['', ' gets through ', ' because ', '.'], bank: ['a', 'b', 'c', 'd'], onRead });
    const chip = (w: string) => [...h.querySelectorAll<HTMLElement>('.rb-chip')].find((c) => c.textContent === w)!;
    const slot = (i: number) => h.querySelectorAll<HTMLElement>('.rb-slot')[i];
    return { h, chip, slot, onRead };
  };

  it('click a slot then a chip; READ IT only with three filled; onRead gets the picks', () => {
    const { h, chip, slot, onRead } = board();
    const read = h.querySelector<HTMLButtonElement>('.rb-read')!;
    expect(read.disabled).toBe(true);
    slot(0).click();
    chip('b').click();
    expect(slot(0).textContent).toBe('b');
    slot(1).click();
    chip('a').click();
    expect(read.disabled).toBe(true);
    slot(2).click();
    chip('d').click();
    expect(read.disabled).toBe(false);
    read.click();
    expect(onRead).toHaveBeenCalledWith(['b', 'a', 'd']);
  });

  it("a chip moves, it doesn't copy", () => {
    const { h, chip, slot } = board();
    slot(0).click();
    chip('a').click();
    slot(1).click();
    chip('a').click();
    expect(slot(0).textContent).toBe('___');
    expect(slot(1).textContent).toBe('a');
    expect(chip('a').classList.contains('used')).toBe(true);
    expect(h.querySelectorAll('.rb-chip.used')).toHaveLength(1);
  });

  it('keyboard: Tab between slots, arrows across chips, Enter places', () => {
    const { h, slot } = board();
    slot(0).focus();
    slot(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement?.classList.contains('rb-chip')).toBe(true);
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('b');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(slot(0).textContent).toBe('b');
    expect(h.querySelector('.rb-slot.on')).toBe(slot(1));
  });
});

describe('the QUEST list', () => {
  const state = (o: Partial<QuestState>): QuestState => ({ open: [], active: null, changed: null, waiting: null, elsewhere: [], ...o });
  it('the big job row: BIG JOB · TRUSTED · 1500–3000 SOL · +15 / −25 REP; an active one shows WALK AWAY', () => {
    const h = host();
    const onWalk = vi.fn();
    const list = mountQuestList(h, { onStart: vi.fn(), onWalk });
    list.show(state({ open: [{ id: 'north-gate', title: 'North Gate', pitch: null, timed: false, big: { tier: 3, range: [1500, 3000], stake: [15, 25] } }] }));
    expect(h.querySelector('.ql-big')!.textContent).toBe('BIG JOB · TRUSTED · 1500–3000 SOL · +15 / −25 REP');
    list.show(state({ active: LEGWORK }));
    expect(list.has()).toBe(true);
    const walk = h.querySelector<HTMLButtonElement>('.ql-walk')!;
    expect(walk.textContent).toBe('WALK AWAY');
    walk.click();
    expect(onWalk).toHaveBeenCalledWith('north-gate');
    list.show(state({ active: base({ ...LEGWORK.big!, section: 'approach', left: null }, { beat: 'gate' }) }));
    expect(h.querySelector('.ql-walk')).toBeNull();
  });
});
