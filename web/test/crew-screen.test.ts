import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrewAction, CrewRosterEntry, CrewView } from '../../shared/types';
import type { Recruit } from '../../shared/crew';
import { openCrew, type CrewHandle } from '../src/room/crew-screen';
import { chromeKey } from '../src/room/identity';
import { nextScreen } from '../src/room/screen-cycle';
import { Hud } from '../src/ui/hud';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));

const recruit = (o: Partial<Recruit>): Recruit => ({ id: 'r-juno', name: 'Juno Sato', face: null, origin: 'karasu', spec: 'runner', grade: 1, traits: ['fast', 'loud'], hidden: null, pitch: '', wage: 40, ...o });
const entry = (o: Partial<CrewRosterEntry> & { recruit: Recruit }): CrewRosterEntry => ({
  state: 'ready',
  runs: { clean: 2, messy: 1, blown: 0 },
  toNext: 3,
  loyalty: 60,
  revealed: ['fast'],
  log: [],
  goneUsed: false,
  busy: false,
  hired: { at: 0, place: 'low-roller' },
  traitsShown: [{ label: 'Knows the Trains', good: true, text: 'Gets there faster.' }],
  hiddenTraits: 1,
  word: 'STEADY',
  line: 'Shows up. Gets paid. Fair enough.',
  next: 'PRO',
  ...o,
});

export function view(o: Partial<CrewView> = {}): CrewView {
  return {
    roster: [
      entry({ recruit: recruit({}) }),
      entry({ recruit: recruit({ id: 'r-saida', name: 'Saida Rahm', spec: 'fence', grade: 2 }), state: 'out', due: 1440 + 160, errand: 'hustle:strand@0' }),
      entry({ recruit: recruit({ id: 'r-bram', name: 'Bram Kowal', spec: 'muscle', grade: 0 }), state: 'hurt', hurtDays: 2 }),
      entry({ recruit: recruit({ id: 'r-pell', name: 'Pell', spec: 'ears', grade: 1 }), state: 'held' }),
      entry({ recruit: recruit({ id: 'r-dez', name: 'Dez', spec: 'wire' }), state: 'gone', gone: 'walked' }),
    ],
    slots: 5,
    used: 4,
    sol: 1240,
    wages: 185,
    nextSix: 200,
    here: 'low-roller',
    hires: [],
    errands: [],
    results: [],
    traits: { fast: { label: 'Knows the Trains', good: true, text: 'Gets there faster.' }, loud: { label: 'Talks Too Much', good: false, text: "Can't keep it in." } },
    ...o,
  };
}

let handle: CrewHandle | null = null;
afterEach(() => {
  handle?.close(true);
  handle = null;
  document.body.replaceChildren();
});

async function open(v: CrewView = view(), act: (a: CrewAction) => void = vi.fn()) {
  handle?.close(true);
  handle = openCrew(document.body, { load: async () => v, act, playthrough: 'pt-1', reducedMotion: true });
  await flush();
  return handle;
}

describe('the CREW screen', () => {
  it('tabs and strip', async () => {
    await open();
    expect($$('.cr-tab').map((t) => t.textContent)).toEqual(['ROSTER4/5', 'ASSIGN1 OUT', 'HIRE']);
    expect($('.cr-strip')!.textContent).toBe('SOL 1,240 · WAGES −185/NIGHT · 06:00 IN 3h 20m');
    expect($('.scr-head')!.textContent).toContain('CREW');
  });

  it('tiles by state', async () => {
    await open();
    const tiles = $$('.cr-tiles > .cr-tile[data-id]');
    expect(tiles.map((t) => $('.cr-state', t)!.textContent)).toEqual(['READY', 'OUTBACK 02:40', 'HURT2 DAYS', 'HELD']);
    expect($('.cr-gone .cr-tile')!.textContent).toContain('WALKED');
    expect($$('.cr-tile.cr-slot').length).toBe(1);
  });

  it('profile: the ladder, a hidden trait, the loyalty word; no stat numbers', async () => {
    await open();
    expect($('.cr-name')!.textContent).toBe('JUNO SATO');
    expect($$('.cr-ladder span').map((s) => s.className)).toEqual(['f', 'on', '', '']);
    expect($$('.cr-trait').map((t) => t.dataset.kind)).toEqual(['good', 'hidden']);
    expect($('.cr-loyal-word')!.textContent).toBe('STEADY');
    expect($('.cr-loyal-line')!.textContent).toBe('Shows up. Gets paid. Fair enough.');
    expect($('.cr-file')!.textContent).not.toMatch(/BODY|REFLEX|WITS|COOL|TECH/);
  });

  it('actions by state send the matching action', async () => {
    const act = vi.fn();
    await open(view(), act);
    const acts = () => $$('.cr-acts button').map((b) => b.textContent);
    expect(acts()).toEqual(['ASSIGN', 'LET GO']);
    $$('.cr-tiles > .cr-tile[data-id]')[1].click();
    expect(acts()).toEqual(['RECALL', 'LET GO']);
    $$('.cr-acts button')[0].click();
    expect(act).toHaveBeenLastCalledWith({ do: 'recall', recruit: 'r-saida' });
    $$('.cr-tiles > .cr-tile[data-id]')[2].click();
    expect(acts()).toEqual(['PAY THE DOC · 100', 'LET GO']);
    $$('.cr-tiles > .cr-tile[data-id]')[3].click();
    expect(acts()).toEqual(['PAY BAIL · 600', 'LEAVE THEM']);
    $$('.cr-acts button')[1].click();
    expect(act).toHaveBeenLastCalledWith({ do: 'leave', recruit: 'r-pell' });
  });

  it('LET GO asks once more before it acts', async () => {
    const act = vi.fn();
    await open(view(), act);
    const letGo = () => $$('.cr-acts button').find((b) => b.textContent!.includes('LET GO'))!;
    letGo().click();
    expect(act).not.toHaveBeenCalled();
    expect(letGo().textContent).toBe('SURE? LET GO');
    letGo().click();
    expect(act).toHaveBeenCalledWith({ do: 'letgo', recruit: 'r-juno' });
  });

  it('ASSIGN on a ready recruit opens the ASSIGN tab', async () => {
    const h = await open();
    $$('.cr-acts button')[0].click();
    expect(h.tab).toBe('assign');
  });

  it('a face from extras, else the initial', async () => {
    await open(view({ roster: [entry({ recruit: recruit({ face: 'crew-runner-01' }) }), entry({ recruit: recruit({ id: 'r-x', name: 'Xu Li' }) })] }));
    expect($<HTMLImageElement>('.cr-tile img')!.getAttribute('src')).toBe('/api/extras/crew-runner-01');
    expect($$('.cr-tiles > .cr-tile[data-id]')[1].querySelector('.cr-mono')!.textContent).toBe('X');
  });
});

describe('CREW in the room chrome', () => {
  it('Alt+K is crew; the cycle goes PEOPLE → CREW → MAP', () => {
    expect(chromeKey(new KeyboardEvent('keydown', { altKey: true, code: 'KeyK', key: 'k' }), false)).toBe('crew');
    expect(nextScreen('people', 1)).toBe('crew');
    expect(nextScreen('crew', 1)).toBe('map');
  });

  it('the hud word, its dot and its open light', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const hud = new Hud(host);
    const onClick = vi.fn();
    hud.setCrew(onClick);
    const word = $('.hud-crew', host)!;
    word.click();
    expect(onClick).toHaveBeenCalled();
    hud.setCrewDot(true);
    expect(word.classList.contains('crew-new')).toBe(true);
    hud.setCrewDot(false);
    expect(word.classList.contains('crew-new')).toBe(false);
    hud.setOpen('crew');
    expect(word.classList.contains('open')).toBe(true);
    hud.dispose();
  });
});

const odds = (clean: number) => ({ clean, messy: 100 - clean - 10, blown: 10, hurt: 6, held: 3, gone: 1, fits: clean > 50, why: [] });
const hustle = {
  id: 'hustle:strand@0',
  kind: 'hustle',
  target: 'strand',
  district: 'strand',
  day: 0,
  label: 'Hustle in {district}',
  name: 'Strand',
  tag: 'SOL',
  suits: ['fence', 'face'] as CrewView['errands'][number]['suits'],
  hours: 5,
  risk: 'med' as const,
  blurb: 'Move hot goods.',
  bands: { clean: '{name} moved it.', messy: '{name} sold half.', blown: '{name} got caught.' },
  taken: false,
  odds: { 'r-juno': odds(64) },
};

describe('ASSIGN', () => {
  it('the brief: odds from the view, the split, SEND', async () => {
    const act = vi.fn();
    const h = await open(view({ errands: [hustle, { ...hustle, id: 'scout:back-door@0', kind: 'scout', label: 'Scout {job}', target: 'back-door', taken: true, odds: {} }] }), act);
    h.show('assign');
    expect($$('.cr-errand').map((e) => e.classList.contains('taken'))).toEqual([false, true]);
    $$('.cr-errand')[0].click();
    expect($('.cr-brief h2')!.textContent).toBe('HUSTLE IN STRAND');
    expect($('.cr-brief .cr-meta')!.textContent).toContain('SUITS FENCE · FACE');
    const card = $$('.cr-pick')[0];
    expect(card.textContent).toContain('64%');
    expect(card.textContent).toContain('FITS');
    card.click();
    expect($('.o-clean')!.textContent).toBe('CLEAN 64');
    expect($('.cr-split')!.textContent).toBe('HURT 6 · HELD 3 · GONE 1');
    const send = $<HTMLButtonElement>('.cr-send')!;
    expect(send.textContent).toBe('SEND JUNO');
    send.click();
    expect(act).toHaveBeenCalledWith({ do: 'send', recruit: 'r-juno', errand: 'hustle:strand@0' });
  });

  it('busy cards are disabled with the reason; a taken errand has no SEND', async () => {
    const h = await open(view({ errands: [hustle, { ...hustle, id: 'x:strand@0', taken: true }] }));
    h.show('assign');
    $$('.cr-errand')[0].click();
    const saida = $$('.cr-pick').find((c) => c.textContent!.includes('SAIDA'))!;
    expect((saida as HTMLButtonElement).disabled).toBe(true);
    expect(saida.textContent).toContain('OUT · BACK 02:40');
    $$('.cr-errand')[1].click();
    expect($('.cr-send')).toBeNull();
    expect($('.cr-brief')!.textContent).toContain('TAKEN TONIGHT');
  });

  it("an errand's label names its job by title", async () => {
    const h = await open(view({ errands: [{ ...hustle, id: 'case:back-door@0', kind: 'case', label: 'Case {job}', target: 'back-door', name: 'Back Door' }] }));
    h.show('assign');
    expect($('.cr-et')!.textContent).toBe('Case Back Door');
  });

  it('back tonight and out now', async () => {
    const h = await open(view({ results: [{ at: 1500, band: 'clean', fate: null, line: 'Juno moved it.', effects: '+340 SOL', recruit: 'r-juno', name: 'Juno Sato' }] }));
    h.show('assign');
    expect($('.cr-back')!.textContent).toContain('Juno moved it.');
    expect($('.cr-out')!.textContent).toContain('BACK 02:40');
  });
});

const card = (id: string, cost: number, o: Partial<Recruit> = {}) => ({ recruit: recruit({ id, name: 'Tomas Reyes', spec: 'runner', grade: 0, traits: ['fast'], hidden: null, pitch: 'Drove a cab four years.', wage: 25, ...o }), cost });

describe('HIRE', () => {
  const hires: CrewView['hires'] = [
    { place: 'low-roller', name: 'The Low Roller', district: 'strand', cards: [card('r-t', 100), card('r-v', 250, { grade: 1, traits: ['fast', 'loud'], hidden: 'loud', name: 'Ilya Voss' }), { locked: { grade: 2, tier: 3, spec: 'face' } }] },
    { place: 'pump-house-nine', name: 'Pump House Nine', district: 'drownworks', cards: [card('r-p', 100)] },
  ];
  it('here: HIRE sends the action; a hidden trait is a ?; the teaser shows its tier', async () => {
    const act = vi.fn();
    const h = await open(view({ hires }), act);
    h.show('hire');
    expect($$('.cr-place').map((p) => p.textContent)).toEqual(['THE LOW ROLLER', 'PUMP HOUSE NINE']);
    const cards = $$('.cr-card');
    expect(cards[1].textContent).toContain('? ONE MORE TRAIT, SHOWN AFTER THREE RUNS');
    expect(cards[2].textContent).toContain('STRAND REP · TRUSTED');
    $<HTMLButtonElement>('.cr-card .cr-btn')!.click();
    expect(act).toHaveBeenCalledWith({ do: 'hire', recruit: 'r-t' });
  });

  it('elsewhere GO THERE; short of sol, disabled with the cost; no slot, disabled', async () => {
    const h = await open(view({ hires, sol: 120 }));
    h.show('hire');
    const btns = () => $$('.cr-card .cr-btn') as HTMLButtonElement[];
    expect(btns()[1].disabled).toBe(true);
    expect(btns()[1].textContent).toBe('COSTS 250 SOL');
    $$('.cr-place')[1].click();
    expect(btns()[0].textContent).toBe('GO THERE');
    expect(btns()[0].disabled).toBe(true);
    const full = await open(view({ hires, used: 5, slots: 5 }));
    full.show('hire');
    expect((($$('.cr-card .cr-btn') as HTMLButtonElement[])[0]).textContent).toBe('NO FREE SLOT');
  });
});

describe('refusals', () => {
  it('a refusal from the server shows on the screen', async () => {
    const h = await open();
    h.refusal('no free slot');
    expect($('.cr-refusal')!.textContent).toBe('no free slot');
  });
});
