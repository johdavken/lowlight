import { assignTab } from '../src/room/crew-assign';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrewAction, CrewRosterEntry, CrewView } from '../../shared/types';
import type { Recruit } from '../../shared/crew';
import { crewDotOn, openCrew, type CrewHandle } from '../src/room/crew-screen';
import { chromeKey } from '../src/room/identity';
import { nextScreen } from '../src/room/screen-cycle';
import { Hud } from '../src/ui/hud';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = (sel: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));

const recruit = (o: Partial<Recruit>): Recruit => ({ id: 'r-juno', name: 'Juno Sato', face: null, origin: 'karasu', spec: 'runner', grade: 1, traits: ['fast', 'loud'], hidden: null, pitch: '', wage: 40, ...o });
const entry = (o: Partial<CrewRosterEntry> & { recruit: Recruit }): CrewRosterEntry => ({
  state: 'ready',
  abilities: [],
  slotted: [],
  picks: [],
  slots: 1,
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
  canSpring: false,
  springWhy: null,
  vouchedBy: null,
  springPlace: null,
  ...o,
});

export function view(o: Partial<CrewView> = {}): CrewView {
  return {
    roster: [
      entry({ recruit: recruit({}) }),
      entry({ recruit: recruit({ id: 'r-saida', name: 'Saida Rahm', spec: 'fence', grade: 2 }), state: 'out', due: 1440 + 160, errand: 'hustle:strand@0' }),
      entry({ recruit: recruit({ id: 'r-bram', name: 'Bram Kowal', spec: 'muscle', grade: 0 }), state: 'hurt', hurtDays: 2 }),
      entry({ recruit: recruit({ id: 'r-pell', name: 'Pell', spec: 'ears', grade: 1 }), state: 'held' }),
      entry({ recruit: recruit({ id: 'r-dez', name: 'Dez', spec: 'runner' }), state: 'gone', gone: 'walked' }),
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
    abilities: {},
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
    expect($$('.cr-tab').map((t) => t.textContent)).toEqual(['ROSTER4/5', 'ERRANDS1 OUT', 'HIRE']);
    expect($('.cr-strip')!.textContent).toBe('SOL 1,240 · WAGES −185 TONIGHT · 06:00 IN 3h 20m');
    expect($('.scr-head')!.textContent).toContain('CREW');
  });

  it('tiles by state', async () => {
    await open();
    const tiles = $$('.cr-tiles > .cr-tile[data-id]');
    expect(tiles.map((t) => $('.cr-state', t)!.textContent)).toEqual(['READY', 'OUTBACK 02:40', 'HURT2 DAYS', 'HELD']);
    expect($('.cr-gone .cr-tile')!.textContent).toContain('WALKED');
    expect($$('.cr-tile.cr-slot').length).toBe(1);
  });

  it('on a job: the tile and the file say so, and nothing to do', async () => {
    await open(view({ roster: [entry({ recruit: recruit({}), state: 'job', job: 'Marked Cards' })] }));
    expect($('.cr-tiles > .cr-tile[data-id] .cr-state')!.textContent).toBe('ON A JOBMARKED CARDS');
    expect($('.cr-file')!.textContent).toContain('ON A JOB · MARKED CARDS');
    expect($$('.cr-acts button')).toEqual([]);
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
    expect(acts()).toEqual(['PAY BAIL · 600', 'SPRING THEM', 'LEAVE THEM']);
    $$('.cr-acts button')[2].click();
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
  it('Alt+K is crew; the cycle goes PEOPLE → TEXTS → QUEST → CREW → MAP', () => {
    expect(chromeKey(new KeyboardEvent('keydown', { altKey: true, code: 'KeyK', key: 'k' }), false)).toBe('crew');
    expect(nextScreen('texts', 1)).toBe('quest');
    expect(nextScreen('quest', 1)).toBe('crew');
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

describe('ERRANDS', () => {
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

  it('one row per errand, by district, each with a state line', async () => {
    const h = await open(view({ errands: [hustle, { ...hustle, id: 'collect:strand@0', kind: 'collect', label: 'Collect in {district}' }] }));
    h.show('assign');
    expect($$('.cr-grp').map((g) => g.textContent)).toEqual(['DISTRICTS']);
    expect($$('.cr-errand').map((r) => $('.cr-et-title', r)!.textContent)).toEqual(['Hustle in Strand', 'Collect in Strand']);
    expect($$('.cr-errand').map((r) => $('.cr-es', r)!.textContent)).toEqual(['SOL · 5H', 'SOL · 5H']);
    $$('.cr-errand')[1].click();
    expect($('.cr-brief h2')!.textContent).toBe('COLLECT IN STRAND');
    expect($$('.cr-errand')[1].classList.contains('on')).toBe(true);
    expect($$('.cr-errand')[0].classList.contains('on')).toBe(false);
  });

  describe('goods (crew goods spec §8)', () => {
    const lot = (o = {}) => ({ id: 's1', kind: 'pharma', label: 'Pharma', value: 340, nightsLeft: 2, stale: false, damaged: false, district: 'strand', ...o });
    const sale = (district: string, o = {}) => ({ ...hustle, id: `sell:s1:${district}@0`, kind: 'sell', label: 'Hustle in {district}', group: 'hustle' as const, lot: 's1', district, target: `s1:${district}`, name: district === 'strand' ? 'Strand' : 'Karasu', wanted: false, routes: { 'r-juno': { price: 340, hours: 7 } }, ...o });
    const pull = { ...hustle, id: 'pull-drive:strand:data@0', kind: 'pull-drive', label: 'Pull a drive in {district}', group: 'collect' as const, goods: 'data', target: 'strand:data', hours: 3 };
    const low = { ...hustle, id: 'lay-low:strand@0', kind: 'lay-low', label: 'Lay low in {district}', tag: 'HEAT' };
    const goods = (o = {}) => view({ errands: [pull, sale('strand'), sale('karasu', { wanted: true, routes: { 'r-juno': { price: 510, hours: 7 } } }), low], stash: [lot()], wanted: [{ district: 'strand', name: 'Strand', kind: 'pharma', label: 'Pharma' }, { district: 'karasu', name: 'Karasu', kind: 'data', label: 'Data' }], ...o });
    const pick = (h: { show(t: string): void }, title: string) => {
      h.show('assign');
      $$('.cr-errand').find((r) => $('.cr-et-title', r)!.textContent === title)!.click();
    };
    it('the wanted line names each Known district', async () => {
      (await open(goods())).show('assign');
      expect($('.cr-wanted')!.textContent).toBe('WANTED TONIGHT · STRAND PHARMA · KARASU DATA');
    });
    it('groups: COLLECT, STASH, LAY LOW, and a sale is no row of its own', async () => {
      (await open(goods())).show('assign');
      expect($$('.cr-grp').map((g) => g.textContent)).toEqual(['COLLECT', 'STASH', 'LAY LOW']);
      expect($$('.cr-errand').map((r) => $('.cr-et-title', r)!.textContent)).toEqual(['Pull a drive in Strand', 'Pharma', 'Lay low in Strand']);
    });
    it('a stash row: value and nights left; damaged, stale, and OUT while on a sale', async () => {
      (await open(goods())).show('assign');
      expect($$('.cr-es')[1].textContent).toBe('340 · 2 NIGHTS LEFT');
      (await open(goods({ stash: [lot({ damaged: true, stale: true, nightsLeft: 0 })] }))).show('assign');
      expect($$('.cr-es')[1].textContent).toBe('340 · DAMAGED · STALE');
      (await open(goods({ stash: [lot({ out: { recruit: 'r-juno', due: 1400 } })] }))).show('assign');
      expect($$('.cr-es')[1].textContent).toBe('OUT · JUNO');
    });
    it('a lot opens a district picker, marked where wanted, on the wanted district first', async () => {
      pick(await open(goods()), 'Pharma');
      expect($$('.cr-where button').map((b) => b.textContent)).toEqual(['STRAND', 'KARASU · WANTED']);
      expect($('.cr-where .on')!.textContent).toBe('KARASU · WANTED');
    });
    it('each card shows that recruit\'s price, and BACK IN their hours; another district changes it', async () => {
      pick(await open(goods()), 'Pharma');
      expect($('.cr-pick-price')!.textContent).toBe('510 SOL');
      expect($('.cr-cost')!.textContent).toContain('BACK IN ABOUT 7H');
      $$('.cr-where button')[0].click();
      expect($('.cr-pick-price')!.textContent).toBe('340 SOL');
    });
    it('a sale picks the best price, not the first hired', async () => {
      const two = entry({ recruit: recruit({ id: 'r-ash', name: 'Ash Vale', spec: 'ears' }) });
      const v = goods({ roster: [view().roster[0], two], errands: [sale('karasu', { wanted: true, odds: { 'r-juno': odds(64), 'r-ash': odds(50) }, routes: { 'r-juno': { price: 200, hours: 3 }, 'r-ash': { price: 510, hours: 7 } } })] });
      pick(await open(v), 'Pharma');
      expect($('.cr-send')!.textContent).toBe('SEND ASH');
    });
    it('after SEND the next lot opens on its own wanted district', async () => {
      const sel = { row: null, who: null, where: 'strand' };
      const v = goods({ stash: [lot({ id: 's2' })], errands: [sale('strand', { id: 'sell:s2:strand@0', lot: 's2' }), sale('karasu', { id: 'sell:s2:karasu@0', lot: 's2', wanted: true })] });
      document.body.replaceChildren(assignTab(v, { act: () => {}, sel }));
      $('.cr-send')!.click();
      expect(sel.where).toBeNull();
    });
    it('one night left, in the file too', async () => {
      pick(await open(goods({ stash: [lot({ nightsLeft: 1 })] })), 'Pharma');
      expect($('.cr-meta')!.textContent).toContain('1 NIGHT LEFT');
    });
    it('SEND sends that lot and district', async () => {
      const act = vi.fn();
      pick(await open(goods(), act), 'Pharma');
      $('.cr-send')!.click();
      expect(act).toHaveBeenLastCalledWith({ do: 'send', recruit: 'r-juno', errand: 'sell:s1:karasu@0' });
    });
    it('a lot out has RECALL, not SEND', async () => {
      const act = vi.fn();
      pick(await open(goods({ stash: [lot({ out: { recruit: 'r-juno' } })] }), act), 'Pharma');
      expect($('.cr-send')).toBeNull();
      $('.cr-recall')!.click();
      expect(act).toHaveBeenLastCalledWith({ do: 'recall', recruit: 'r-juno' });
    });
    it('Buy It Cheap says what it costs', async () => {
      const h = await open(view({ errands: [{ ...pull, cost: 140 }] }));
      pick(h, 'Pull a drive in Strand');
      expect($('.cr-cost')!.textContent).toContain('COSTS 140 SOL');
    });
  });

  it('a runner comes back in the errand\'s hours', async () => {
    const h = await open(view({ errands: [hustle], roster: [entry({ recruit: recruit({ spec: 'runner' }) })] }));
    h.show('assign');
    $$('.cr-errand')[0].click();
    expect($('.cr-cost')!.textContent).toContain('BACK IN ABOUT 5H');
  });

  it('back tonight and out now', async () => {
    const h = await open(view({ results: [{ at: 1500, band: 'clean', fate: null, line: 'Juno moved it.', effects: '+340 SOL', recruit: 'r-juno', name: 'Juno Sato' }] }));
    h.show('assign');
    expect($('.cr-back')!.textContent).toContain('Juno moved it.');
    expect($('.cr-out')!.textContent).toContain('BACK 02:40');
  });
});

describe('ERRANDS: a contract and art', () => {
  const piece = { ...hustle, id: 'groundwork:job@3:boat:runner@0', kind: 'groundwork', label: 'Groundwork for {job}', target: 'job@3:boat:runner', district: '', run: 'job@3', piece: 'boat', spec: 'runner' as const, name: 'The Job · boat', suits: ['runner', 'muscle', 'face'] as CrewView['errands'][number]['suits'], hours: 8, tag: 'PREP', art: '/api/quests/art/the-job.webp' };
  const contract = (pieces: NonNullable<CrewView['contracts']>[number]['pieces']): NonNullable<CrewView['contracts']> => [{ run: 'job@3', title: 'The Job', nightsLeft: 2, art: '/api/quests/art/the-job.webp', hours: 8, risk: 'med', pieces }];
  const boat = { id: 'boat', label: 'The boat', spec: 'runner' as const, line: 'Her skiff.', state: 'open' as const, errand: piece.id };
  const roof = { id: 'roof', label: 'The roof', spec: 'ears' as const, line: 'A room.', state: 'waits' as const };
  const goodwill = { id: 'goodwill', label: 'The goodwill', spec: 'face' as const, line: 'Her name.', state: 'waits' as const };
  const rows = () => $$('.cr-errand').map((r) => [$('.cr-et-title', r)!.textContent, $('.cr-es', r)!.textContent]);

  it('the contract comes first, with its nights, and every piece has a state line', async () => {
    const h = await open(view({ errands: [hustle, piece], contracts: contract([boat, { ...roof, state: 'out', recruit: 'r-saida', due: 1440 + 250 }, { ...goodwill, state: 'back' }]) }));
    h.show('assign');
    expect($$('.cr-grp').map((g) => g.textContent)).toEqual(['THE JOB · 2 NIGHTS LEFT', 'DISTRICTS']);
    expect($('.cr-grp')!.classList.contains('hot')).toBe(true);
    expect(rows()).toEqual([['The boat', 'RUNNER'], ['The roof', 'OUT · SAIDA · BACK 04:10'], ['The goodwill', 'BACK'], ['Hustle in Strand', 'SOL · 5H']]);
    expect($$('.cr-errand').map((r) => r.classList.contains('taken'))).toEqual([false, true, true, false]);
  });

  it("WAITS while tonight's is sent; with two sent, the third stays undone", async () => {
    const h = await open(view({ contracts: contract([{ ...boat, state: 'out', errand: undefined }, roof, goodwill]) }));
    h.show('assign');
    expect(rows()[1]).toEqual(['The roof', 'WAITS · ONE A NIGHT']);
    const both = await open(view({ contracts: contract([{ ...boat, state: 'back', errand: undefined }, { ...roof, state: 'out' }, goodwill]) }));
    both.show('assign');
    expect(rows()[2]).toEqual(['The goodwill', 'LEFT · TWO AT MOST']);
  });

  it("a piece's file: its own line, SUITS its specialty, THEIR TRADE on who matches", async () => {
    const h = await open(view({ errands: [piece], contracts: contract([boat, roof, goodwill]) }));
    h.show('assign');
    expect($('.cr-brief h2')!.textContent).toBe('THE BOAT');
    expect($('.cr-blurb')!.textContent).toBe('Her skiff.');
    expect($('.cr-meta')!.textContent).toContain('SUITS RUNNER');
    expect($('.cr-meta')!.textContent).not.toContain('MUSCLE');
    expect($('.cr-pick.on .cr-why')!.textContent).toBe('THEIR TRADE');
    expect($('.cr-send')!.textContent).toBe('SEND JUNO');
  });

  it("no match: no THEIR TRADE, and no FITS either: the piece suits one trade", async () => {
    const h = await open(view({ errands: [{ ...piece, spec: 'muscle' }], contracts: contract([{ ...boat, spec: 'muscle' }, roof, goodwill]) }));
    h.show('assign');
    expect($('.cr-pick.on .cr-why')).toBeNull();
  });

  it("a piece that can't go has no live SEND; one that's out can be recalled", async () => {
    const act = vi.fn();
    const h = await open(view({ contracts: contract([{ ...boat, state: 'out', recruit: 'r-saida', due: 1440 + 250 }, roof, goodwill]) }), act);
    h.show('assign');
    expect($('.cr-send')).toBeNull();
    expect($('.cr-brief')!.textContent).toContain('SAIDA IS ON IT');
    $<HTMLButtonElement>('.cr-recall')!.click();
    expect(act).toHaveBeenCalledWith({ do: 'recall', recruit: 'r-saida' });
    $$('.cr-errand')[1].click();
    expect($('.cr-blurb')!.textContent).toBe('A room.');
    expect($('.cr-brief')!.textContent).toContain('ONE PIECE A NIGHT');
    expect($$('.cr-file-foot button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('art on the row and the file; none shows the quiet placeholder', async () => {
    const h = await open(view({ errands: [piece, hustle], contracts: contract([boat, roof, goodwill]) }));
    h.show('assign');
    expect($('.cr-thumb')!.style.backgroundImage).toContain('/api/quests/art/the-job.webp');
    expect($('.cr-art')!.style.backgroundImage).toContain('/api/quests/art/the-job.webp');
    expect($$('.cr-thumb')[1].style.backgroundImage).toContain('/api/quests/art/the-job.webp');
    const last = $$('.cr-errand').at(-1)!;
    expect($('.cr-thumb', last)!.classList.contains('cr-noart')).toBe(true);
    last.click();
    expect($('.cr-art')!.classList.contains('cr-noart')).toBe(true);
  });

  it('a refresh keeps the picked row and recruit', async () => {
    const two = entry({ recruit: recruit({ id: 'r-two', name: 'Two Vale' }) });
    const v = view({ roster: [view().roster[0], two], errands: [hustle, { ...hustle, id: 'collect:strand@0', label: 'Collect in {district}', odds: { 'r-juno': odds(40), 'r-two': odds(60) } }] });
    const h = await open(v);
    h.show('assign');
    $$('.cr-errand')[1].click();
    $$('.cr-pick')[1].click();
    h.refresh();
    await flush();
    expect($('.cr-brief h2')!.textContent).toBe('COLLECT IN STRAND');
    expect($('.cr-send')!.textContent).toBe('SEND TWO');
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

describe('crew phase 2 on the screen (crew spec §5)', () => {
  const vouch = { recruit: recruit({ id: 'r-v', name: 'Ilya Voss', spec: 'fence', grade: 2, traits: [] }), cost: 0, loyalty: 70, from: { vouched: 'cass', name: 'Cass' } };
  const jobCard = { recruit: recruit({ id: 'r-j', name: 'Saida Rahm', spec: 'muscle', grade: 1, traits: [] }), cost: 0, loyalty: 50, from: { job: 'quest.hicks.weigh-station@0', title: 'Weigh Station' } };
  const hires: CrewView['hires'] = [
    { place: 'low-roller', name: 'The Low Roller', district: 'strand', cards: [card('r-t', 100)] },
    { place: 'low-roller', name: 'The Low Roller', district: 'strand', cards: [vouch], vouched: { contact: 'cass', name: 'Cass', accent: '#ff3366' } },
    { place: 'long-haul', name: 'The Long Haul', district: 'spine', cards: [jobCard] },
  ];

  it('a vouched card: its own tab in her colour, VOUCHED BY, FREE', async () => {
    const act = vi.fn();
    const h = await open(view({ hires }), act);
    h.show('hire');
    const tabs = $$('.cr-place');
    expect(tabs.map((t) => t.textContent)).toEqual(['THE LOW ROLLER', 'THE LOW ROLLER · CASS', 'THE LONG HAUL']);
    expect(tabs[1].classList.contains('vouched')).toBe(true);
    expect(tabs[1].style.getPropertyValue('--cr-vouch')).toBe('#ff3366');
    tabs[1].click();
    const c = $('.cr-card')!;
    expect($('.cr-vouch', c)!.textContent).toBe('VOUCHED BY CASS');
    expect($('.cr-money', c)!.textContent).toBe('FREEWAGE 40');
    $<HTMLButtonElement>('.cr-card .cr-btn')!.click();
    expect(act).toHaveBeenCalledWith({ do: 'hire', recruit: 'r-v' });
  });

  it("at a vouching contact's home with no hires, HIRE opens on her tab (deferred minor)", async () => {
    const h = await open(view({ here: 'the-tilt', hires: [hires[0], { ...hires[1], place: 'the-tilt', name: 'The Tilt' }] }));
    h.show('hire');
    expect($('.cr-place.on')!.textContent).toBe('THE TILT · CASS');
  });

  it('a job card says where it came from', async () => {
    const h = await open(view({ hires }));
    h.show('hire');
    $$('.cr-place')[2].click();
    expect($('.cr-card .cr-vouch')!.textContent).toBe('FROM THE JOB · WEIGH STATION');
  });

  it('a vouched recruit says who vouched', async () => {
    await open(view({ roster: [entry({ recruit: recruit({}), vouchedBy: 'Cass' })] }));
    expect($('.cr-vouched')!.textContent).toBe('Vouched for by Cass');
  });

  const held = (o: Partial<CrewRosterEntry> = {}) => view({ roster: [entry({ recruit: recruit({ id: 'r-pell', name: 'Pell', spec: 'ears', grade: 1 }), state: 'held', canSpring: true, ...o })] });
  it('held: PAY BAIL, SPRING THEM, LEAVE THEM; SPRING THEM sends spring', async () => {
    const act = vi.fn();
    await open(held(), act);
    expect($$('.cr-acts button').map((b) => b.textContent)).toEqual(['PAY BAIL · 600', 'SPRING THEM', 'LEAVE THEM']);
    $$('.cr-acts button')[1].click();
    expect(act).toHaveBeenLastCalledWith({ do: 'spring', recruit: 'r-pell' });
  });

  it("SPRING THEM disabled with the reason; once sprung, the status says who's waiting", async () => {
    await open(held({ canSpring: false, springWhy: 'one rescue a night', springPlace: 'The Long Haul' }));
    const b = $$('.cr-acts button')[1] as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe('one rescue a night');
    expect($('.cr-status')!.textContent).toBe('HELD BY SDG · THEIR PEOPLE AT THE LONG HAUL ARE WAITING');
  });
});

describe('ABILITIES (crew abilities spec §4)', () => {
  const book: CrewView['abilities'] = {
    spoof: { label: 'Spoof', timing: 'roll', job: 'WITS CHECKS ONE POSITION BETTER', text: 'Any badge reader.', from: 0 },
    'log-wipe': { label: 'Log Wipe', timing: 'after', job: 'ALARM −1 AFTER A ROLL', text: 'Knows which logs.', from: 1 },
    'clean-exit': { label: 'Clean Exit', timing: 'after', job: 'A MISS BECOMES A 4–5', text: 'Never a trace.', from: 3 },
  };
  const juno = (o: Partial<CrewRosterEntry> = {}) => view({ abilities: book, roster: [entry({ recruit: recruit({}), abilities: ['spoof', 'log-wipe'], slotted: ['spoof'], slots: 1, ...o })] });
  it('slots, the slotted card with its timing and words, UNSLOT sends unslot', async () => {
    const act = vi.fn();
    await open(juno(), act);
    expect($('.cr-ab-slots')!.textContent).toBe('SLOTS 1/1');
    const slotted = $('.cr-ab[data-id="spoof"]')!;
    expect(slotted.classList.contains('slotted')).toBe(true);
    expect(slotted.textContent).toContain('ON A ROLL');
    expect(slotted.textContent).toContain('WITS CHECKS ONE POSITION BETTER');
    $<HTMLButtonElement>('.cr-ab[data-id="spoof"] .cr-ab-btn')!.click();
    expect(act).toHaveBeenLastCalledWith({ do: 'unslot', recruit: 'r-juno', ability: 'spoof' });
  });
  it('a known card is dimmed with SLOT; with slots full SLOT asks which to swap out', async () => {
    const act = vi.fn();
    await open(juno(), act);
    const known = $('.cr-ab[data-id="log-wipe"]')!;
    expect(known.classList.contains('slotted')).toBe(false);
    expect(known.textContent).toContain('AFTER A ROLL');
    $<HTMLButtonElement>('.cr-ab[data-id="log-wipe"] .cr-ab-btn')!.click();
    expect(act).not.toHaveBeenCalled();
    expect($('.cr-ab[data-id="spoof"]')!.classList.contains('cr-swap')).toBe(true);
    $('.cr-ab[data-id="spoof"]')!.click();
    expect(act).toHaveBeenLastCalledWith({ do: 'slot', recruit: 'r-juno', ability: 'log-wipe', out: 'spoof' });
  });
  it('with a free slot, SLOT sends slot', async () => {
    const act = vi.fn();
    await open(juno({ slotted: [] }), act);
    expect($('.cr-ab-slots')!.textContent).toBe('SLOTS 0/1');
    $<HTMLButtonElement>('.cr-ab[data-id="spoof"] .cr-ab-btn')!.click();
    expect(act).toHaveBeenLastCalledWith({ do: 'slot', recruit: 'r-juno', ability: 'spoof' });
  });
  it('not ready: the buttons are disabled with the status line', async () => {
    await open(juno({ state: 'out', due: 1600 }));
    const b = $<HTMLButtonElement>('.cr-ab[data-id="spoof"] .cr-ab-btn')!;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/^OUT/);
  });
  it('an open pick comes first: two cards and KEEP', async () => {
    const act = vi.fn();
    await open(juno({ recruit: recruit({ grade: 2 }), picks: [{ grade: 2, offer: ['log-wipe', 'clean-exit'] }], abilities: ['spoof'] }), act);
    const choose = $('.cr-choose')!;
    expect(choose.textContent).toContain('JUNO · HAND → PRO');
    expect($$('.cr-choose .cr-ab').map((c) => c.dataset.id)).toEqual(['log-wipe', 'clean-exit']);
    ($$('.cr-choose .cr-keep')[1] as HTMLButtonElement).click();
    expect(act).toHaveBeenLastCalledWith({ do: 'learn', recruit: 'r-juno', ability: 'clean-exit', grade: 2 });
    expect($('.cr-tile[data-id="r-juno"]')!.classList.contains('pick')).toBe(true);
  });
  it('the CREW dot: an unseen result, or an open pick', () => {
    expect(crewDotOn({ crewLatest: null, crewPicks: false }, 0)).toBe(false);
    expect(crewDotOn({ crewLatest: 50, crewPicks: false }, 10)).toBe(true);
    expect(crewDotOn({ crewLatest: 50, crewPicks: false }, 50)).toBe(false);
    expect(crewDotOn({ crewLatest: null, crewPicks: true }, 0)).toBe(true);
  });
  it('a HIRE card shows the ability it comes with', async () => {
    const h = await open(view({ abilities: book, hires: [{ place: 'low-roller', name: 'The Low Roller', district: 'strand', cards: [{ recruit: recruit({ id: 'r-t', abilities: ['spoof'] }), cost: 100 }] }] }));
    h.show('hire');
    expect($('.cr-card')!.textContent).toContain('SPOOF');
    expect($('.cr-card')!.textContent).toContain('WITS CHECKS ONE POSITION BETTER');
  });
});
