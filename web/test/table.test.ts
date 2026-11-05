import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountTableShell, watchTables } from '../src/room/table/shell';
import { mountDeal, type TableCard } from '../src/room/table/deal';
import { mountHand } from '../src/room/table/hand';
import { DEAL_STAGGER_MS, FLIP_AT_MS, FLIP_CUE_URL } from '../src/room/table/el';
import { previewText } from '../src/room/table/preview';
import { artFace, crewFace } from '../src/room/table/faces';

const game = () => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  return g;
};
const $$ = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(sel)];
const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });

afterEach(() => {
  document.body.replaceChildren();
  setWidth(1600);
});

describe('the table shell', () => {
  it('opens and closes, dimming the room', () => {
    const g = game();
    const t = mountTableShell(g);
    expect(t.root.hidden).toBe(true);
    t.open();
    expect(t.root.hidden).toBe(false);
    expect(g.classList.contains('tb-dim')).toBe(true);
    t.close();
    expect(t.root.hidden).toBe(true);
    expect(g.classList.contains('tb-dim')).toBe(false);
  });

  it('a table closing over another keeps the room dim (SETUP over a debrief) until the last one closes', () => {
    const g = game();
    const debrief = mountTableShell(g);
    const setup = mountTableShell(g);
    debrief.open();
    setup.open();
    setup.close();
    expect(g.classList.contains('tb-dim')).toBe(true);
    debrief.close();
    expect(g.classList.contains('tb-dim')).toBe(false);
  });

  it('watchTables hears when the first table opens and the last one closes (the table music)', () => {
    const seen: boolean[] = [];
    const stop = watchTables((on) => seen.push(on));
    const a = mountTableShell(game());
    const b = mountTableShell(game());
    a.open();
    b.open();
    a.open();
    a.close();
    a.close();
    expect(seen).toEqual([true]);
    b.close();
    expect(seen).toEqual([true, false]);
    stop();
    a.open();
    a.close();
    expect(seen).toEqual([true, false]);
  });

  it('corners show TAKE, ALARM and NERVE; prose sets the text', () => {
    const t = mountTableShell(game());
    t.corners({ take: { filled: 2, size: 3 }, alarm: 1, nerve: { left: 4, max: 5 } });
    // The rail: a cell per step, lit as filled, the number above and the word below.
    expect($$('.tb-take .tb-stack i').map((i) => i.className)).toEqual(['f', 'f', '']);
    expect($$('.tb-alarm .tb-stack i').map((i) => i.className)).toEqual(['f', '', '', '']);
    expect($$('.tb-nerve .tb-stack i').filter((i) => i.className === 'f')).toHaveLength(4);
    expect(t.root.querySelector('.tb-nerve')!.getAttribute('aria-label')).toBe('NERVE 4/5');
    expect(t.root.querySelector('.tb-nerve .tb-num')!.textContent).toBe('4');
    t.corners({ alarm: 4, nerve: { left: 0, max: 5 } });
    expect(t.root.querySelector<HTMLElement>('.tb-take')!.hidden).toBe(true);
    expect(t.root.querySelector('.tb-alarm.out .tb-word')!.textContent).toBe('GET OUT');
    expect(t.root.querySelector('.tb-nerve.gone .tb-word')!.textContent).toBe('GONE');
    t.prose('The house deck sits by the dealer.');
    expect(t.root.querySelector('.tb-prose')!.textContent).toBe('The house deck sits by the dealer.');
    t.prose('You wait. *He looks away.*');
    expect(t.root.querySelector('.tb-prose em')!.textContent).toBe('He looks away.');
  });

  it('marks a phone below 768 px', () => {
    setWidth(375);
    const t = mountTableShell(game());
    t.open();
    expect(t.root.classList.contains('phone')).toBe(true);
  });
});

describe('the deal', () => {
  const cards: TableCard[] = [
    { id: 'a', face: 'SWAP', state: 'up' },
    { id: 'b', face: 'SIT IN', state: 'down' },
    { id: 'c', face: 'LOCKED', state: 'locked' },
  ];
  it('renders each card with its state; a click picks only an up card; dealing cues the beat', () => {
    const picked: string[] = [];
    const cue = vi.fn();
    const d = mountDeal(document.body, { onPick: (id) => picked.push(id), reduced: true, cue });
    d.deal(cards);
    expect($$('.tb-card').map((c) => [c.dataset.id, c.dataset.state])).toEqual([['a', 'up'], ['b', 'down'], ['c', 'locked']]);
    for (const c of $$('.tb-card')) c.click();
    expect(picked).toEqual(['a']);
    expect(cue).toHaveBeenCalledWith('beat');
  });
  it('flip turns a card face down with the lock cue; clear empties it', () => {
    const cue = vi.fn();
    const d = mountDeal(document.body, { onPick: () => {}, reduced: true, cue });
    d.deal(cards);
    d.flip('a');
    expect($$('.tb-card')[0].dataset.state).toBe('down');
    expect(cue).toHaveBeenLastCalledWith('lock');
    d.clear();
    expect($$('.tb-card')).toEqual([]);
  });
  it('an element face is used as is', () => {
    const face = document.createElement('b');
    face.textContent = 'DEZ';
    mountDeal(document.body, { onPick: () => {}, reduced: true }).deal([{ id: 'x', face, state: 'up' }]);
    expect(document.querySelector('.tb-card b')!.textContent).toBe('DEZ');
  });
});

describe('the hand', () => {
  const groups = () => [
    { group: 'PEOPLE' as const, slots: [{ id: 'dez', face: 'DEZ', state: 'up' as const }, { id: 'koji', face: 'KOJI', state: 'down' as const }, { id: 'p3', face: '', state: 'empty' as const }] },
    { group: 'POCKETS' as const, slots: [{ id: 'favour', face: 'KARASU +1d', state: 'up' as const }, { id: 'l1', face: 'LEAD OR TIP', state: 'locked' as const }] },
  ];
  it('PEOPLE then POCKETS; locked slots say SPEC 3', () => {
    mountHand(document.body, { onLift: () => {} }).show(groups());
    expect($$('.tb-group-label').map((n) => n.textContent)).toEqual(['PEOPLE', 'POCKETS']);
    const locked = $$('.tb-slot.locked');
    expect(locked).toHaveLength(1);
    expect(locked[0].textContent).toContain('SPEC 3');
  });
  it('lifts one card at a time; tapping it again puts it back; cues the move', () => {
    const lifts: (string | null)[] = [];
    const cue = vi.fn();
    const h = mountHand(document.body, { onLift: (id) => lifts.push(id), cue });
    h.show(groups());
    const slot = (id: string) => document.querySelector<HTMLElement>(`.tb-slot[data-id="${id}"]`)!;
    slot('dez').click();
    expect(h.lifted()).toBe('dez');
    expect(slot('dez').classList.contains('lifted')).toBe(true);
    slot('favour').click();
    expect(h.lifted()).toBe('favour');
    expect(slot('dez').classList.contains('lifted')).toBe(false);
    slot('favour').click();
    expect(h.lifted()).toBeNull();
    slot('koji').click();
    expect(h.lifted()).toBeNull();
    expect(lifts).toEqual(['dez', 'favour', null]);
    expect(cue).toHaveBeenCalledWith('move');
  });
  it('a lifted card that goes face down is dropped on the next show', () => {
    const h = mountHand(document.body, { onLift: () => {} });
    h.show(groups());
    document.querySelector<HTMLElement>('.tb-slot[data-id="dez"]')!.click();
    const g = groups();
    g[0].slots[0].state = 'down';
    h.show(g);
    expect(h.lifted()).toBeNull();
  });
  it('dealing in plays the flip cue as each face-up card turns over; face-down and empty slots stay quiet', () => {
    vi.useFakeTimers();
    try {
      const cue = vi.fn();
      const h = mountHand(document.body, { onLift: () => {}, cue });
      h.show(groups(), { dealIn: true });
      expect(cue).not.toHaveBeenCalled();
      // dez is dealt first, then koji (down), the empty slot, favour, the locked pocket: four slots drawn before favour.
      vi.advanceTimersByTime(FLIP_AT_MS);
      expect(cue.mock.calls).toEqual([['flip']]);
      vi.advanceTimersByTime(4 * DEAL_STAGGER_MS);
      expect(cue.mock.calls).toEqual([['flip'], ['flip'], ['flip']]);
      vi.advanceTimersByTime(2000);
      expect(cue).toHaveBeenCalledTimes(3);
      expect(FLIP_CUE_URL).toBe('/sound/table/flip.ogg');
    } finally {
      vi.useRealTimers();
    }
  });
  it('a show without dealing in plays no flip, and a new show stops the flips still to come', () => {
    vi.useFakeTimers();
    try {
      const cue = vi.fn();
      const h = mountHand(document.body, { onLift: () => {}, cue });
      h.show(groups(), { dealIn: true });
      h.show(groups());
      vi.advanceTimersByTime(2000);
      expect(cue).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('scrolls sideways at phone width', () => {
    setWidth(375);
    mountHand(document.body, { onLift: () => {} }).show(groups());
    expect(document.querySelector('.tb-hand')!.classList.contains('scroll-x')).toBe(true);
  });
});

describe('previewText', () => {
  it('the dice after, and the position change', () => {
    expect(previewText('reflex', { dice: 3, position: 'open' }, { dice: 4, position: 'dark' })).toBe('REFLEX ●●●● · IN THE OPEN → IN THE DARK');
    expect(previewText('COOL', { dice: 2, position: 'open' }, { dice: 3, position: 'open' })).toBe('COOL ●●● · IN THE OPEN');
    expect(previewText('COOL', { dice: 0, position: 'wire' }, { dice: 0, position: 'wire' })).toBe('COOL 0D · ON THE WIRE');
    expect(previewText('COOL', { dice: 2, position: 'open' }, undefined)).toBeNull();
    // Effect (effect and NERVE spec §3): shown when it moves.
    expect(previewText('tech', { dice: 3, position: 'open', effect: 'fair' }, { dice: 3, position: 'wire', effect: 'big' })).toBe('TECH ●●● · IN THE OPEN → ON THE WIRE · FAIR → BIG');
    expect(previewText('tech', { dice: 3, position: 'open', effect: 'big' }, { dice: 4, position: 'open', effect: 'big' })).toBe('TECH ●●●● · IN THE OPEN · BIG');
  });
});

describe('card faces', () => {
  it('a recruit: portrait panel (specialty, grade, face), name, state line and shown traits', () => {
    const f = crewFace({ name: 'Dez Vance', spec: 'runner', grade: 1, face: 'crew-07', traits: [{ label: 'Knows the Trains', good: true }, { label: 'Talks Too Much', good: false }] }, '1 FREE');
    expect(f.querySelector('.tbc-pic .tbc-spec')!.textContent).toBe('RUNNER');
    expect(f.querySelector('.tbc-pic .tbc-grade')!.textContent).toBe('HAND');
    expect(f.querySelector<HTMLImageElement>('.tbc-pic img')!.src).toContain('/api/extras/crew-07');
    expect(f.querySelector('.tbc-name')!.textContent).toBe('DEZ');
    expect(f.querySelector('.tbc-note')!.textContent).toBe('1 FREE');
    expect([...f.querySelectorAll('.tbc-tr')].map((t) => [t.textContent, t.classList.contains('bad')])).toEqual([['+ KNOWS THE TRAINS', false], ['− TALKS TOO MUCH', true]]);
    // No face: the crew panel's initial disc.
    expect(crewFace({ name: 'Moss Ade', spec: 'fence', grade: 0, face: null, traits: [] }).querySelector('.tbc-pic .cr-mono')!.textContent).toBe('M');
  });
  it('a picture card: its art, label, chip and lines', () => {
    const f = artFace('quiet', 'QUIET', ['REFLEX · TECH +1d'], '+1d');
    expect(f.querySelector<HTMLImageElement>('.tbc-pic img')!.getAttribute('src')).toBe('/cards/quiet.webp');
    expect(f.querySelector('.tbc-name')!.textContent).toBe('QUIET');
    expect(f.querySelector('.tbc-grade')!.textContent).toBe('+1d');
    expect(f.querySelector('.tbc-note')!.textContent).toBe('REFLEX · TECH +1d');
  });
});
