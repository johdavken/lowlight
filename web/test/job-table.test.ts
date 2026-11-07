import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountJobTable, onTable, tableAction, tipsFor } from '../src/room/table/job-table';
import { WAIT_CHARS } from '../src/room/table/decode';
import { tabWords } from '../src/room/table/tabs';
import { ALARM_MAX } from '../../shared/dice';
import type { QuestState } from '../../shared/types';

type Active = NonNullable<QuestState['active']>;
const pool = (stat: string, dice: number, position: 'dark' | 'open' | 'wire') => ({ stat, base: dice, dice, parts: [], position, noDeck: false });
const A: Active = {
  id: 'marked-cards',
  title: 'Marked Cards',
  beat: 'table',
  choices: [
    { id: 'swap', line: 'Swap the deck.', pool: pool('REFLEX', 3, 'open'), plays: { dez: { dice: 3, position: 'dark' }, favour: { dice: 4, position: 'open' } } },
    { id: 'sit', line: 'Sit in and wait.', pool: pool('COOL', 2, 'open'), plays: { dez: { dice: 3, position: 'open' }, favour: { dice: 3, position: 'open' } } },
    { id: 'leave', line: 'Leave it.' },
  ],
  alarm: 1,
  nerve: { left: 4, max: 5 },
  take: { filled: 1, size: 3 },
  heat: 2,
  pay: [200, 300],
  hand: {
    approach: 'quiet',
    people: [
      { id: 'dez', name: 'Dez Vance', spec: 'runner', grade: 1, face: null, traits: [{ label: 'Knows the Trains', good: true }], free: 1, risk: null, down: false, abilities: [] },
      { id: 'moss', name: 'Moss Ade', spec: 'fence', grade: 0, face: null, traits: [], free: 0, risk: null, down: false, abilities: [] },
    ],
    favour: 'ready',
    contacts: [],
  },
};
/** A dealt roll's costs (roll lifecycle spec §1.5), as the server sends them. */
const COSTS_VIEW: NonNullable<Active['costs']> = {
  pick: 1,
  dealt: [
    { cost: 'alarm', tag: 'ALARM +1', line: 'A log fills in your name.', by: 'written', picked: false },
    { cost: 'heat', tag: 'HEAT +1', line: 'Someone will remember your face.', by: 'written', picked: false },
    { cost: 'worse', tag: 'NEXT ROLL WORSE', line: "The way ahead isn't empty.", by: 'written', picked: false },
  ],
  resist: { dice: 2, ok: true },
  armour: { ok: true, left: 1 },
};
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const mount = () => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const onChoose = vi.fn();
  const t = mountJobTable(g, { onChoose, onTalk: vi.fn(), reduced: () => true });
  return { t, onChoose };
};
const choice = (id: string) => $(`.tb-deal .tb-card[data-choice="${id}"]`);
const slot = (id: string) => $(`.tb-hand .tb-slot[data-id="${id}"], .tb-load-tray .tb-slot[data-id="${id}"]`);
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('a job on the table', () => {
  it('deals the choices with their pools, the corners and the hand', () => {
    const { t } = mount();
    t.show(A, 'The house deck sits by the dealer.');
    expect($$('.tb-deal .tb-card').map((c) => c.dataset.choice)).toEqual(['swap', 'sit', 'leave']);
    expect(choice('swap').textContent).toContain('REFLEX ●●● · IN THE OPEN');
    expect($('.tb-prose').textContent).toBe('The house deck sits by the dealer.');
    // A grid card says what the deck does there (deck effects spec §3).
    const grid = { ...A, choices: A.choices.map((c) => (c.id === 'swap' ? { ...c, pool: { ...c.pool!, deck: { match: 'outclassed' as const, broke: true, hidden: false, chrome: false } } } : c)) };
    t.show(grid, 'The house deck sits by the dealer.');
    expect(choice('swap').textContent).toContain('REFLEX ●●● · IN THE OPEN · OUTCLASSED · BREAKER');
    expect($('.tb-nerve').getAttribute('aria-label')).toBe('NERVE 4/5');
    // No empty PEOPLE slots mid-job: nobody can be added now.
    expect($$('.g-people .tb-slot').map((s) => s.dataset.id)).toEqual(['dez', 'moss']);
    // Each checked choice carries its stat's picture and its position's word and colour; the prose sits under the title.
    expect(choice('swap').dataset.pos).toBe('open');
    expect(choice('swap').querySelector('.tb-side-word')!.textContent).toBe('OPEN');
    expect(choice('swap').querySelector('.tb-art')!.getAttribute('src')).toBe('/cards/stat-reflex.webp');
    expect(choice('swap').querySelector('.tbc-symbol')!.getAttribute('aria-label')).toBe('REFLEX');
    expect(choice('leave').dataset.pos).toBeUndefined();
    expect($('.tb-head').compareDocumentPosition($('.tb-prose')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect($('.tb-push img').getAttribute('src')).toBe('/table/push.webp');
    expect(slot('dez').textContent).toContain('1 FREE');
    expect(slot('dez').querySelector('.tbc-pic')).not.toBeNull();
    expect(slot('dez').textContent).toContain('+ KNOWS THE TRAINS');
    expect(slot('favour').querySelector('img')!.getAttribute('src')).toBe('/cards/favour.webp');
    // No contacts brought: two empty contact pockets, no SPEC 3 locks (contact cards spec §2).
    expect(slot('c1').dataset.state).toBe('empty');
    expect(slot('c2').dataset.state).toBe('empty');
    expect($('.tb-hand').textContent).not.toContain('SPEC 3');
    expect(slot('moss').dataset.state).toBe('locked');
    expect(slot('favour').dataset.state).toBe('up');
  });

  it('contact cards in POCKETS: once, then face down; a fence plays at the end', () => {
    const { t, onChoose } = mount();
    const hicks = { id: 'hicks', name: 'Hicks', accent: '#7fe9ff', portrait: '/p/hicks.png', spec: 'runner' as const };
    const cass = { id: 'cass', name: 'Cass Okafor', accent: '#ff4f8b', portrait: null, spec: 'fence' as const };
    const choices = A.choices.map((c) => (c.plays ? { ...c, plays: { ...c.plays, 'contact:hicks': { dice: 3, position: 'open' as const } } } : c));
    t.show({ ...A, choices, hand: { ...A.hand!, contacts: [{ ...hicks, used: false }, { ...cass, used: false }] } }, 'x');
    expect($$('.g-pockets .tb-slot').map((s) => s.dataset.id)).toEqual(['favour', 'contact:hicks', 'contact:cass']);
    expect(slot('contact:hicks').dataset.state).toBe('up');
    expect(slot('contact:hicks').textContent).toContain('HICKS · RUNNER');
    expect(slot('contact:hicks').textContent).toContain('ONCE');
    expect(slot('contact:hicks').querySelector('img')!.getAttribute('src')).toBe('/contacts/hicks.webp');
    expect(slot('contact:cass').dataset.state).toBe('locked');
    expect(slot('contact:cass').textContent).toContain('PLAYS AT THE END');
    slot('contact:hicks').click();
    choice('sit').click();
    expect(onChoose).toHaveBeenLastCalledWith('sit', { card: 'contact:hicks' });
    t.show({ ...A, hand: { ...A.hand!, contacts: [{ ...hicks, used: true }] } }, 'x');
    expect(slot('contact:hicks').dataset.state).toBe('down');
    expect(slot('contact:hicks').textContent).toContain('USED');
    expect(slot('c2').dataset.state).toBe('empty');
  });

  it('lifting Dez rewrites each choice with the preview; a choice sends the card', () => {
    const { t, onChoose } = mount();
    t.show(A);
    slot('dez').click();
    expect(choice('swap').textContent).toContain('REFLEX ●●● · IN THE OPEN → IN THE DARK');
    expect(choice('sit').textContent).toContain('COOL ●●● · IN THE OPEN');
    expect(choice('leave').textContent).toContain('NO CARD HERE');
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { card: 'dez' });
  });

  it('a choice with no play for the lifted card shows it, and sends no card', () => {
    const { t, onChoose } = mount();
    t.show(A);
    slot('dez').click();
    choice('leave').click();
    expect(onChoose).toHaveBeenLastCalledWith('leave', {});
  });

  it('PUSH toggles and goes with the card', () => {
    const { t, onChoose } = mount();
    t.show(A);
    $('.tb-push').click();
    expect($('.tb-push').classList.contains('on')).toBe(true);
    slot('favour').click();
    choice('sit').click();
    expect(onChoose).toHaveBeenLastCalledWith('sit', { push: 'dice', card: 'favour' });
  });

  it('STEADY / TAKE IT, the getaway and WALK / PRESS ON deal as cards', () => {
    const { t, onChoose } = mount();
    t.show({ ...A, choices: [{ id: '!steady', line: 'STEADY (2 NERVE)' }, { id: '!take', line: 'TAKE IT' }], rolled: { choice: 'swap', faces: [5], keep: 'high', kind: 'cost' } });
    expect($$('.tb-deal .tb-card').map((c) => c.dataset.choice)).toEqual(['!steady', '!take']);
    choice('!take').click();
    expect(onChoose).toHaveBeenLastCalledWith('!take', {});
    t.show({ ...A, getaway: true });
    expect($('.tb-head').textContent).toContain('GET OUT');
    t.show({ ...A, choices: [{ id: '!walk', line: 'WALK — 200 SOL · HEAT +1' }, { id: '!press', line: 'PRESS ON' }], push: { stage: 0, pot: 0, walk: { sol: 200, heat: 1 } } });
    expect($('.tb-head').textContent).toContain('PRESS ON?');
    // Picture panels (sheet 9), worded like the cost answers: the word, then what it keeps or costs.
    expect(choice('!walk').classList.contains('art-panel')).toBe(true);
    expect(choice('!walk').querySelector('.tb-panel-word')!.textContent).toBe('WALK');
    expect(choice('!walk').querySelector('.tb-panel-sub')!.textContent).toBe('200 SOL · HEAT +1');
    expect(choice('!press').querySelector('.tb-panel-word')!.textContent).toBe('PRESS ON');
    expect(choice('!press').querySelector('.tb-panel-sub')!.textContent).toBe('RISK IT · 1 NERVE');
  });

  it('a blown job waiting on cover puts the hand away: its BLOWN preview has the room, not under the cards (playtest)', () => {
    const { t } = mount();
    t.show(A);
    expect($('.tb-hand').hidden).toBe(false);
    const blown = { text: 'Two men are waiting.', debrief: { tier: 'blown', checks: [], sol: 0, heat: { district: 'karasu', delta: 2 }, rep: { district: 'karasu', before: 30, after: 18 } } } as NonNullable<Active['blown']>;
    t.show({ ...A, beat: 'blown', choices: [{ id: '!burner', line: 'USE BURNER (−6 INSTEAD OF −12)' }, { id: '!take', line: 'TAKE IT' }], blown });
    expect($('.tb-extra .db')).not.toBeNull();
    expect($('.tb-hand').hidden).toBe(true);
    // Back on a beat with checks (a rewind), the hand comes back.
    t.show(A);
    expect($('.tb-hand').hidden).toBe(false);
  });

  it('the debrief deals as a card; CLOSE closes the table', () => {
    const { t } = mount();
    t.show(A);
    const d = document.createElement('div');
    d.className = 'db db-clean';
    t.end('Marked Cards', 'You walk out.', d);
    expect($('.tb-deal .db')).not.toBeNull();
    expect(document.querySelector('.tb-seal')).toBeNull();
    const blown = document.createElement('div');
    blown.className = 'db db-blown';
    t.end('Marked Cards', 'It went bad.', blown);
    expect($('.tb-debrief .tb-seal').getAttribute('src')).toBe('/table/blown.webp');
    $('.tb-close').click();
    expect(t.isOpen()).toBe(false);
  });

  it('the clocks stay as the job ended: TAKE and ALARM from the debrief, NERVE as last shown (graft results 2026-11-04)', () => {
    const { t } = mount();
    t.show({ ...A, take: { filled: 1, size: 4 }, alarm: 1, nerve: { left: 3, max: 5 } });
    t.end('Marked Cards', 'You walk out.', document.createElement('div'), { take: { filled: 2, size: 4 }, alarm: 2 });
    expect($('.tb-take').getAttribute('aria-label')).toBe('TAKE 2/4');
    expect($('.tb-alarm').getAttribute('aria-label')).toBe(`ALARM 2/${ALARM_MAX}`);
    expect($('.tb-nerve').getAttribute('aria-label')).toBe('NERVE 3/5');
  });

  it('a held line lights its card; THAT\'S MY CHOICE sends it with the line', () => {
    const { t, onChoose } = mount();
    t.show(A);
    t.pick('swap', 'I swap it.');
    expect(choice('swap').textContent).toContain('“I swap it.”');
    $('.tb-confirm').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { said: 'I swap it.' });
  });
});

describe('onTable', () => {
  it('jobs; never a story quest', () => {
    expect(onTable(A)).toBe(true);
    expect(onTable({ id: 'paper-trail', title: 'Paper Trail', beat: 'a', choices: [] })).toBe(false);
    expect(onTable(null)).toBe(false);
  });
});

describe('review fixes', () => {
  it('a new job starts with PUSH off and nothing lifted', () => {
    const { t, onChoose } = mount();
    t.show(A);
    $('.tb-push').click();
    slot('dez').click();
    t.show({ ...A, id: 'other-job' });
    expect($('.tb-push').classList.contains('on')).toBe(false);
    choice('sit').click();
    expect(onChoose).toHaveBeenLastCalledWith('sit', {});
  });

  it("the deal doesn't sound the beat (the job moment already does)", () => {
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    const cue = vi.fn();
    const t = mountJobTable(g, { onChoose: vi.fn(), onTalk: vi.fn(), reduced: () => true, cue });
    t.show(A);
    expect(cue).not.toHaveBeenCalledWith('beat');
  });

  it('lifting a card keeps a rolled card\'s dice and stamp', () => {
    const { t } = mount();
    t.show(A);
    const card = choice('swap');
    card.append(Object.assign(document.createElement('div'), { className: 'qc-dice' }), Object.assign(document.createElement('span'), { className: 'qc-stamp' }));
    slot('dez').click();
    expect(choice('swap').querySelector('.qc-dice')).not.toBeNull();
    expect(choice('swap').querySelector('.qc-stamp')).not.toBeNull();
    expect(choice('swap').textContent).toContain('→ IN THE DARK');
  });
});

describe('tableAction', () => {
  const desk = { ...A, id: 'customs-line' };
  it('shows a job; ends on a debrief; closes for anything else unless the debrief is up', () => {
    expect(tableAction({ active: A, debrief: false, tableOpen: false, tableEnded: false })).toBe('show');
    expect(tableAction({ active: null, debrief: true, tableOpen: true, tableEnded: false })).toBe('end');
    // A desk job's wait: no active, the table was up.
    expect(tableAction({ active: null, debrief: false, tableOpen: true, tableEnded: false })).toBe('close');
    // A story quest at a beat after a job.
    expect(tableAction({ active: { ...desk, alarm: undefined }, debrief: false, tableOpen: true, tableEnded: false })).toBe('close');
    // The debrief stays until CLOSE.
    expect(tableAction({ active: null, debrief: false, tableOpen: true, tableEnded: true })).toBe('keep');
    expect(tableAction({ active: null, debrief: false, tableOpen: false, tableEnded: false })).toBe('keep');
  });
});

describe('what the quest panel showed, on the table', () => {
  it('HEAT and PAY in the strip, a pot when pressing on, the dice parts on a card', () => {
    const { t } = mount();
    t.show({ ...A, choices: [{ id: 'swap', line: 'Swap.', pool: { stat: 'TECH', base: 2, dice: 3, parts: [{ label: 'CASED', dice: 1 }], position: 'open', noDeck: false } }, { id: 'x', line: 'X.' }] });
    expect($('.tb-strip').textContent).toBe('HEAT 2PAY 200–300 SOL');
    expect(choice('swap').textContent).toContain('TECH ●● +CASED ● · IN THE OPEN');
    t.show({ ...A, choices: [{ id: '!walk', line: 'WALK' }, { id: '!press', line: 'PRESS ON' }], push: { stage: 1, pot: 100, walk: { sol: 500, heat: 0 } } });
    expect($('.tb-pot').textContent).toBe('POT +100 SOL');
  });
});

describe('face down', () => {
  it('a recruit down from a loss and a used favour show the card back', () => {
    const { t } = mount();
    t.show({ ...A, hand: { ...A.hand!, people: [{ ...A.hand!.people[0], down: true, free: 0, risk: 3 }], favour: 'used' } });
    expect(slot('dez').querySelector('img')!.getAttribute('src')).toBe('/cards/back.webp');
    expect(slot('favour').querySelector('img')!.getAttribute('src')).toBe('/cards/back.webp');
  });
});

describe('no crew brought', () => {
  it('the hand has no PEOPLE group at all, only the pockets', () => {
    const { t } = mount();
    t.show({ ...A, hand: { ...A.hand!, people: [] } });
    expect(document.querySelector('.g-people')).toBeNull();
    expect(document.querySelector('.g-pockets')).not.toBeNull();
  });
});

describe('Graft tips on the table', () => {
  const fakeTips = () => ({ offer: vi.fn(), clear: vi.fn(), enabled: () => true, setEnabled: vi.fn(), reset: vi.fn() });
  const mountWith = () => {
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    const tips = fakeTips();
    const onChoose = vi.fn();
    const t = mountJobTable(g, { onChoose, onTalk: vi.fn(), reduced: () => true, tips });
    return { t, tips, onChoose };
  };
  const offered = (tips: ReturnType<typeof fakeTips>) => tips.offer.mock.calls.at(-1)?.[0];

  it('a beat offers the table tips', () => {
    const { t, tips } = mountWith();
    t.show(A);
    // The JOB column against her line comes first (it stands on the stage, so tips.ts looks for it there).
    expect(offered(tips)).toEqual(['job', 'roll', 'position', 'take', 'alarm', 'nerve', 'call']);
    expect(tips.offer.mock.calls.at(-1)?.[1]).toBe(t.root);
    t.show({ ...A, beat: 'two', take: undefined, hand: { ...A.hand!, people: A.hand!.people.filter((p) => p.id === 'moss') } });
    expect(offered(tips)).toEqual(['job', 'roll', 'position', 'alarm', 'nerve']);
  });

  it('final review I1: a dealt roll with HEAT +1 among its costs offers HEAT first', () => {
    const { t, tips } = mountWith();
    t.show({ ...A, choices: [], rolled: { choice: 'swap', faces: [5], keep: 'high', kind: 'cost', cost: { alarm: 0, heat: 0 } }, costs: COSTS_VIEW });
    expect(offered(tips)[0]).toBe('heat');
  });

  it('a dealt roll offers costs, then RESIST and ARMOUR when they can be used (roll lifecycle spec §1.5)', () => {
    const { t, tips } = mountWith();
    t.show({ ...A, choices: [], rolled: { choice: 'swap', faces: [5], keep: 'high', kind: 'cost' }, costs: { ...COSTS_VIEW, dealt: COSTS_VIEW.dealt.filter((c) => c.cost !== 'heat') } });
    // The fixture's ALARM is up, so what it turns into comes first.
    expect(offered(tips)).toEqual(['heat', 'costs', 'resist', 'armour', 'alarm', 'nerve']);
  });

  it('a parked roll that lands heat offers HEAT first, pointing at the line under its stamp', () => {
    const { t, tips } = mountWith();
    t.show({ ...A, choices: [{ id: '!take', line: 'TAKE IT' }], rolled: { choice: 'swap', faces: [3], keep: 'high', kind: 'miss', cost: { alarm: 1, heat: 1 } } });
    expect(offered(tips)).toEqual(['heat', 'alarm', 'nerve']);
    expect(document.querySelector('.tb-parked .qc-says')?.textContent).toBe('FAILED · ALARM +1 · HEAT +1');
  });

  it('a getaway offers getaway', () => {
    const { t, tips } = mountWith();
    t.show({ ...A, getaway: true });
    expect(offered(tips)?.[0]).toBe('getaway');
  });

  it('WALK / PRESS ON offers press', () => {
    const { t, tips } = mountWith();
    t.show({ ...A, choices: [{ id: '!walk', line: 'WALK — 200 SOL · HEAT +1' }, { id: '!press', line: 'PRESS ON' }], push: { stage: 0, pot: 0, walk: { sol: 200, heat: 1 } } });
    expect(offered(tips)).toEqual(['press', 'nerve']);
  });

  it('the debrief offers debrief', () => {
    const { t, tips } = mountWith();
    t.show(A);
    const d = document.createElement('div');
    d.className = 'db';
    t.end('Marked Cards', 'You walk out.', d);
    expect(offered(tips)).toEqual(['debrief']);
  });

  it('a pick, PUSH and a new beat clear', () => {
    const { t, tips, onChoose } = mountWith();
    t.show(A);
    tips.clear.mockClear();
    $('.tb-push').click();
    expect(tips.clear).toHaveBeenCalledTimes(1);
    choice('sit').click();
    expect(tips.clear).toHaveBeenCalledTimes(2);
    expect(tips.clear.mock.invocationCallOrder[1]).toBeLessThan(onChoose.mock.invocationCallOrder[0]);
    t.show({ ...A, beat: 'next' });
    expect(tips.clear).toHaveBeenCalledTimes(3);
    expect(tips.clear.mock.invocationCallOrder[2]).toBeLessThan(tips.offer.mock.invocationCallOrder.at(-1)!);
  });

  it('close clears the tip', () => {
    const { t, tips } = mountWith();
    t.show(A);
    tips.clear.mockClear();
    t.close();
    expect(tips.clear).toHaveBeenCalled();
  });
});

describe("ability cards: index tabs under the recruit that turn their card over (crew abilities spec §2)", () => {
  const ab = (id: string, label: string, kind: 'die' | 'nerve' | 'take', timing: 'roll' | 'after' | 'end', o: Record<string, unknown> = {}) => ({ id, label, kind, timing, words: 'WORDS', nerve: (kind === 'die' ? 1 : 0) as 0 | 1, afford: true, used: false, playable: false, ...o });
  const withAbilities = (abilities: ReturnType<typeof ab>[], o: Partial<Active['hand'] extends infer H ? (H extends { people: (infer P)[] } ? P : never) : never> = {}): Active => ({
    ...A,
    choices: A.choices.map((c) => (c.id === 'sit' ? { ...c, plays: { ...c.plays, 'dez/cool-head': { dice: 2, position: 'dark' as const } } } : c)),
    hand: { ...A.hand!, people: [{ ...A.hand!.people[0], abilities, ...o }, A.hand!.people[1]] },
  });
  const three = [ab('cool-head', 'Cool Head', 'die', 'roll'), ab('log-wipe', 'Log Wipe', 'nerve', 'after'), ab('quick-sale', 'Quick Sale', 'take', 'end')];
  const glyph = (id: string) => $(`.tb-tab[data-id="${id}"]`);
  /** Taps a tab and lets both half turns finish. */
  const flipTo = (id: string) => {
    glyph(id).click();
    vi.advanceTimersByTime(1000);
  };
  /** The side of Dez's card turned toward you: a card's id, or BACK. */
  const up = () => {
    const inner = $('.tb-crew-stack[data-stack="dez"] .tb-flip-in');
    const side = inner.children[Number(inner.style.transform.match(/-?\d+/)![0]) / 180 % 2] as HTMLElement;
    return side.classList.contains('tb-cardback') ? 'BACK' : side.dataset.id;
  };
  afterEach(() => vi.useRealTimers());
  describe('a press beside a call (ability pass spec §1)', () => {
    const press = (): Active => {
      const a = withAbilities([], {});
      const mia = { ...a.hand!.people[1], abilities: [ab('look', 'Second Look', 'die', 'roll')] };
      return { ...a, hand: { ...a.hand!, people: [a.hand!.people[0], mia] }, choices: a.choices.map((c) => (c.id === 'sit' ? { ...c, plays: { ...c.plays, [`${mia.id}/look`]: { dice: 1, position: 'open' as const }, dez: { dice: 3, position: 'open' as const, presses: { [`${mia.id}/look`]: { dice: 2, position: 'dark' as const } } } } } : c)) };
    };
    const mid = (a: Active) => a.hand!.people[1].id;
    it('with a call lifted, another recruit\'s ability lifts beside it; the card shows both; both go with the pick', () => {
      vi.useFakeTimers();
      const { t, onChoose } = mount();
      const a = press();
      t.show(a);
      flipTo(`${mid(a)}/look`);
      slot('dez').click();
      slot(`${mid(a)}/look`).click();
      expect(slot('dez').classList.contains('lifted')).toBe(true);
      expect(slot(`${mid(a)}/look`).classList.contains('lifted')).toBe(true);
      choice('sit').click();
      expect(onChoose.mock.calls.at(-1)).toMatchObject(['sit', { card: 'dez', press: `${mid(a)}/look` }]);
    });
    it('a press tapped again goes back; the call stays', () => {
      vi.useFakeTimers();
      const { t, onChoose } = mount();
      const a = press();
      t.show(a);
      flipTo(`${mid(a)}/look`);
      slot('dez').click();
      slot(`${mid(a)}/look`).click();
      slot(`${mid(a)}/look`).click();
      expect(slot(`${mid(a)}/look`).classList.contains('lifted')).toBe(false);
      choice('sit').click();
      expect(onChoose.mock.calls.at(-1)![1]).toMatchObject({ card: 'dez' });
      expect(onChoose.mock.calls.at(-1)![1].press).toBeUndefined();
    });
    it('a press lifted first: tapping a call puts it beside the call', () => {
      vi.useFakeTimers();
      const { t, onChoose } = mount();
      const a = press();
      t.show(a);
      flipTo(`${mid(a)}/look`);
      slot(`${mid(a)}/look`).click();
      slot('dez').click();
      choice('sit').click();
      expect(onChoose.mock.calls.at(-1)![1]).toMatchObject({ card: 'dez', press: `${mid(a)}/look` });
    });
    it('the same recruit\'s ability replaces their call', () => {
      vi.useFakeTimers();
      const { t } = mount();
      t.show(withAbilities(three));
      slot('dez').click();
      flipTo('dez/cool-head');
      slot('dez/cool-head').click();
      expect($$('.tb-slot.lifted').map((s) => s.dataset.id)).toEqual(['dez/cool-head']);
    });
  });
  it('tabWords: each new kind in a few words', () => {
    expect((['setup-position', 'setup-die', 'greed-effect', 'greed-die', 'gamble-cost', 'gamble-miss', 'trade-alarm', 'trade-nerve', 'end-take', 'end-cool'] as const).map((k) => tabWords(k, 'x'))).toEqual(['SET UP', 'SET UP', 'GREED', 'GREED', 'GAMBLE', 'GAMBLE', 'ALARM −1', '+2 NERVE', '+1 TAKE', 'HEAT −2']);
  });
  it('one card per recruit, a tab per ability in its timing, saying what it does; a tab turns the card over to it and back', () => {
    vi.useFakeTimers();
    const { t } = mount();
    t.show(withAbilities(three));
    expect(up()).toBe('dez');
    expect($$('.tb-crew-stack[data-stack="dez"] .tb-tab').map((g) => [g.dataset.id, g.className.match(/t-\w+/)![0]])).toEqual([['dez/cool-head', 't-roll'], ['dez/log-wipe', 't-after'], ['dez/quick-sale', 't-end']]);
    expect($$('.tb-crew-stack[data-stack="dez"] .tb-tab').map((g) => g.textContent)).toEqual(['+1D', '+1 NERVE', '+1 TAKE']);
    expect(glyph('dez/cool-head').title).toBe('COOL HEAD');
    // Over to the card's back first, then on to the ability.
    glyph('dez/cool-head').click();
    expect(up()).toBe('BACK');
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez/cool-head');
    expect(glyph('dez/cool-head').classList.contains('on')).toBe(true);
    expect(slot('dez/cool-head').querySelector('.tbc-symbol.t-roll')!.getAttribute('aria-label')).toBe('ON A ROLL');
    // Printed like the crew's: the name, then its state, then what it does.
    expect(slot('dez/cool-head').querySelector('.tbc-print')).not.toBeNull();
    expect(slot('dez/cool-head').querySelector('.tbc-note + .tbc-note.words')).not.toBeNull();
    expect(slot('dez/cool-head').textContent).toContain('1 NERVE');
    flipTo('dez/quick-sale');
    expect(slot('dez/quick-sale').dataset.state).toBe('locked');
    expect(slot('dez/quick-sale').textContent).toContain('PLAYS AT THE END');
    flipTo('dez/quick-sale');
    expect(up()).toBe('dez');
  });
  it('lifting an ON A ROLL ability previews it and sends it with the choice; a re-render keeps it up', () => {
    vi.useFakeTimers();
    const { t, onChoose } = mount();
    t.show(withAbilities(three));
    flipTo('dez/cool-head');
    slot('dez/cool-head').click();
    expect(choice('sit').textContent).toContain('→ IN THE DARK');
    expect(up()).toBe('dez/cool-head');
    choice('sit').click();
    expect(onChoose).toHaveBeenLastCalledWith('sit', { card: 'dez/cool-head' });
  });
  it('turning the card over drops a lift from the side that was up', () => {
    vi.useFakeTimers();
    const { t } = mount();
    t.show(withAbilities(three));
    slot('dez').click();
    expect(slot('dez').classList.contains('lifted')).toBe(true);
    flipTo('dez/cool-head');
    expect($$('.tb-slot.lifted')).toEqual([]);
  });
  const parked = { choices: [{ id: '!steady', line: 'STEADY (2 NERVE)' }, { id: '!take', line: 'TAKE IT' }], rolled: { choice: 'swap', faces: [5], keep: 'high' as const, kind: 'cost' as const } };
  it('a playable AFTER A ROLL ability turns its card over by itself and pulses; a tap sends !after', () => {
    vi.useFakeTimers();
    const { t, onChoose } = mount();
    t.show({ ...withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after', { playable: true })]), ...parked });
    expect(glyph('dez/log-wipe').classList.contains('ready')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez/log-wipe');
    expect(slot('dez/log-wipe').dataset.state).toBe('up');
    expect(slot('dez/log-wipe').classList.contains('tb-after')).toBe(true);
    slot('dez/log-wipe').click();
    expect(onChoose).toHaveBeenLastCalledWith('!after', { card: 'dez/log-wipe' });
  });
  it('a card the table turned turns back once its ability is played; one turned by hand stays', () => {
    vi.useFakeTimers();
    const { t } = mount();
    t.show({ ...withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after', { playable: true })]), ...parked });
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez/log-wipe');
    // The roll lands: nothing's ready, and it turns back to the recruit.
    t.show(withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after')]));
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez');
    // Turned back by hand while it waits: the table doesn't turn it again for the same roll.
    t.show({ ...withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after', { playable: true })]), ...parked });
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez/log-wipe');
    flipTo('dez/log-wipe');
    expect(up()).toBe('dez');
    t.show({ ...withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after', { playable: true })]), ...parked });
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez');
    // Turned up by hand: it stays when the roll lands.
    flipTo('dez/log-wipe');
    t.show(withAbilities([ab('log-wipe', 'Log Wipe', 'nerve', 'after')]));
    vi.advanceTimersByTime(1000);
    expect(up()).toBe('dez/log-wipe');
  });
  it('a waiting roll keeps its card, dice and stamp at the front of the deal; it goes when the roll lands', () => {
    const { t } = mount();
    t.show(A);
    const card = choice('swap');
    card.classList.add('is-locked', 'is-fail');
    const tray = Object.assign(document.createElement('div'), { className: 'tb-roll is-fail' });
    const canvas = document.createElement('canvas');
    canvas.style.height = '90px';
    canvas.dataset.faces = '3';
    tray.append(canvas, Object.assign(document.createElement('span'), { className: 'qc-stamp', textContent: 'MISS' }));
    $('.tb-deal').append(tray);
    t.show({ ...A, ...parked, rolled: { ...parked.rolled, faces: [3], kind: 'miss' } });
    expect($$('.tb-deal > *').map((n) => n.className.split(' ')[0])).toEqual(['tb-parked', 'tb-card', 'tb-card']);
    expect($('.tb-parked .tb-card')).toBe(card);
    expect($('.tb-parked .tb-roll')).toBe(tray);
    expect($$('.tb-deal > .tb-card').map((c) => c.dataset.choice)).toEqual(['!steady', '!take']);
    // A re-render (a STEADY price, a lift) keeps it.
    t.show({ ...A, ...parked, rolled: { ...parked.rolled, faces: [3], kind: 'miss' } });
    expect($('.tb-parked .tb-roll')).toBe(tray);
    t.show({ ...A, beat: 'after' });
    expect(document.querySelector('.tb-parked')).toBeNull();
  });
  it('after a reload the waiting roll shows its dice and stamp, landed', () => {
    const { t } = mount();
    t.show({ ...A, ...parked, rolled: { ...parked.rolled, faces: [3, 1], kind: 'miss' } });
    expect($('.tb-parked .tb-roll-dice').dataset.faces).toBe('3,1');
    expect($('.tb-parked .qc-stamp').textContent).toBe('MISS');
    expect($('.tb-parked .tb-roll').classList.contains('is-fail')).toBe(true);
  });
  it("a save whose glitch didn't play still shows the cost; another roll's row goes", () => {
    const { t } = mount();
    t.show({ ...A, ...parked, rolled: { ...parked.rolled, faces: [3, 1], kind: 'miss' } });
    t.show({ ...A, ...parked, rolled: { ...parked.rolled, faces: [5, 1], kind: 'cost', saved: true } });
    expect($$('.tb-parked')).toHaveLength(1);
    expect($('.tb-parked .tb-roll-dice').dataset.faces).toBe('5,1');
    expect($('.tb-parked .qc-stamp').textContent).toBe('COST');
    expect($('.tb-parked .tb-roll').classList.contains('is-cost')).toBe(true);
    t.show({ ...A, ...parked, rolled: { choice: 'sit', faces: [2, 2], keep: 'high', kind: 'miss' } });
    expect($$('.tb-parked').map((r) => r.dataset.choice)).toEqual(['sit']);
    expect($('.tb-parked .tb-roll-dice').dataset.faces).toBe('2,2');
    expect($$('.tb-deal > *').map((n) => n.className.split(' ')[0])).toEqual(['tb-parked', 'tb-card', 'tb-card']);
  });
  it('an ability shows its NERVE (none it can\'t pay); a played ability dims its tab and turns the card back to the recruit', () => {
    vi.useFakeTimers();
    const { t } = mount();
    t.show(withAbilities([ab('cool-head', 'Cool Head', 'die', 'roll', { afford: false }), ab('log-wipe', 'Log Wipe', 'nerve', 'after')]));
    flipTo('dez/cool-head');
    expect(slot('dez/cool-head').textContent).toMatch(/1 NERVE · YOU HAVE \d/);
    expect(slot('dez/cool-head').dataset.state).toBe('locked');
    t.show(withAbilities([ab('cool-head', 'Cool Head', 'die', 'roll', { used: true }), ab('log-wipe', 'Log Wipe', 'nerve', 'after')]));
    expect(glyph('dez/cool-head').classList.contains('used')).toBe(true);
    expect(up()).toBe('dez');
  });
  it('a recruit down: their card shows its back and the tabs go dead', () => {
    const { t } = mount();
    t.show(withAbilities(three, { down: true, free: 0, risk: 3 }));
    expect(slot('dez').dataset.state).toBe('down');
    expect($$('.tb-crew-stack[data-stack="dez"] .tb-tab').every((g) => (g as HTMLButtonElement).disabled)).toBe(true);
  });
  it("an ability card shows its picture, and falls back to the timing's colour without one", () => {
    vi.useFakeTimers();
    const { t } = mount();
    t.show(withAbilities(three));
    flipTo('dez/log-wipe');
    const img = slot('dez/log-wipe').querySelector<HTMLImageElement>('img.tbc-art')!;
    expect(img.getAttribute('src')).toBe('/abilities/log-wipe.webp');
    img.dispatchEvent(new Event('error'));
    expect(slot('dez/log-wipe').querySelector('img.tbc-art')).toBeNull();
    expect(slot('dez/log-wipe').querySelector('.tbc-ability.t-after')).not.toBeNull();
  });
});

describe('effect on the table (effect and NERVE spec §3)', () => {
  const eff = (e: 'small' | 'fair' | 'big', position: 'dark' | 'open' | 'wire' = 'open') => ({ ...pool('REFLEX', 3, position), effect: e, effectParts: [] });
  const E: Active = {
    ...A,
    choices: [
      { id: 'swap', line: 'Swap the deck.', pool: eff('fair'), trade: { safe: null, bold: null }, pushEffect: null, plays: { dez: { dice: 3, position: 'dark', effect: 'fair' } } },
      { id: 'sit', line: 'Sit in and wait.', pool: eff('big', 'dark'), trade: { safe: 'ALREADY IN THE DARK', bold: 'ALREADY BIG' }, pushEffect: 'ALREADY BIG' },
      { id: 'leave', line: 'Leave it.' },
    ],
  };
  const safe = () => $('.tb-trade .tb-safe') as HTMLButtonElement;
  const bold = () => $('.tb-trade .tb-bold') as HTMLButtonElement;

  it("a card shows its effect; one that fills no TAKE shows none, and the trade isn't in the rail", () => {
    const { t } = mount();
    t.show(E);
    expect(choice('swap').querySelector('.tb-eff')!.textContent).toBe('FAIR');
    expect(choice('sit').querySelector('.tb-eff')!.className).toContain('big');
    expect(choice('swap').textContent).toContain('IN THE OPEN · FAIR');
    t.show(A);
    expect(choice('swap').querySelector('.tb-eff')).toBeNull();
    expect($('.tb-trade').hidden).toBe(true);
  });

  it('PUSH cycles off → +1D → +EFFECT → off and goes with the pick', () => {
    const { t, onChoose } = mount();
    t.show(E);
    const word = () => $$('.tb-push .tb-push-word')[1].textContent;
    $('.tb-push').click();
    expect([$('.tb-push').classList.contains('on'), word()]).toEqual([true, '+1D']);
    $('.tb-push').click();
    expect([$('.tb-push').classList.contains('on'), word()]).toEqual([true, '+EFFECT']);
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { push: 'effect' });
    expect($('.tb-push').classList.contains('on')).toBe(false);
    $('.tb-push').click();
    $('.tb-push').click();
    $('.tb-push').click();
    expect($('.tb-push').classList.contains('on')).toBe(false);
  });

  it('SAFE and BOLD: one or neither, sent with the pick, reset after it; the card previews the trade', () => {
    const { t, onChoose } = mount();
    t.show(E);
    bold().click();
    expect(bold().classList.contains('on')).toBe(true);
    expect(choice('swap').textContent).toContain('IN THE OPEN → ON THE WIRE · FAIR → BIG');
    expect(choice('swap').querySelector('.tb-eff')!.textContent).toBe('BIG');
    safe().click();
    expect([safe().classList.contains('on'), bold().classList.contains('on')]).toEqual([true, false]);
    safe().click();
    expect(safe().classList.contains('on')).toBe(false);
    bold().click();
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { trade: 'bold' });
    expect(bold().classList.contains('on')).toBe(false);
  });

  it("a card the trade can't go on says why and can't be picked", () => {
    const { t, onChoose } = mount();
    t.show(E);
    safe().click();
    expect(choice('sit').textContent).toContain('ALREADY IN THE DARK');
    expect(choice('sit').querySelector('.tb-face')!.classList.contains('none')).toBe(true);
    onChoose.mockClear();
    choice('sit').click();
    expect(onChoose).not.toHaveBeenCalled();
    // PUSH +EFFECT at BIG: the same.
    safe().click();
    $('.tb-push').click();
    $('.tb-push').click();
    expect(choice('sit').textContent).toContain('ALREADY BIG');
  });

  it('a lifted card that lifts into the dark refuses SAFE on that card', () => {
    const { t } = mount();
    t.show(E);
    safe().click();
    slot('dez').click();
    expect(choice('swap').textContent).toContain('ALREADY IN THE DARK');
  });

  it('final review I1: BOLD comes on when a lifted card lifts a WIRE card into the open', () => {
    const { t, onChoose } = mount();
    const wire: Active = { ...E, choices: [{ id: 'swap', line: 'Swap the deck.', pool: eff('fair', 'wire'), plays: { dez: { dice: 3, position: 'open', effect: 'fair' } } }, E.choices[2]] };
    t.show(wire);
    expect(bold().disabled).toBe(true);
    slot('dez').click();
    expect(bold().disabled).toBe(false);
    bold().click();
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { trade: 'bold', card: 'dez' });
  });

  it('final review M1: a lit trade no card here can take can still be put back', () => {
    const { t } = mount();
    t.show(E);
    safe().click();
    // The same job, a beat where every card is already in the dark.
    t.show({ ...E, beat: 'next', choices: [E.choices[1], E.choices[2]] });
    expect(choice('sit').textContent).toContain('ALREADY IN THE DARK');
    expect(safe().disabled).toBe(false);
    safe().click();
    expect(safe().classList.contains('on')).toBe(false);
    expect(safe().disabled).toBe(true);
    expect(choice('sit').textContent).not.toContain('ALREADY IN THE DARK');
    // Out of the rail (no card fills TAKE): the trade goes.
    bold().disabled || bold().click();
    t.show({ ...E, beat: 'out', choices: [E.choices[2]] });
    expect(bold().classList.contains('on')).toBe(false);
  });

  it("final review M2: PUSH +1D at 6 dice says so and isn't picked", () => {
    const { t, onChoose } = mount();
    t.show({ ...E, choices: [{ ...E.choices[0], pool: { ...eff('fair'), base: 6, dice: 6 } }, E.choices[2]] });
    $('.tb-push').click();
    expect(choice('swap').textContent).toContain('ALREADY ROLLING 6 DICE');
    onChoose.mockClear();
    choice('swap').click();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("SAFE and BOLD are disabled with the reason when no card can take them", () => {
    const { t } = mount();
    t.show({ ...E, choices: [E.choices[1], E.choices[2]] });
    expect(safe().disabled).toBe(true);
    expect(safe().title).toBe('ALREADY IN THE DARK');
    expect(bold().disabled).toBe(true);
  });

  it("with PUSH on, an ability PUSH leaves no NERVE for says so; an unaffordable AFTER A ROLL card says why", () => {
    const { t } = mount();
    const ab = (id: string, timing: 'roll' | 'after') => ({ id, label: id, kind: (timing === 'roll' ? 'die' : 'alarm') as 'die' | 'alarm', timing, words: 'W', nerve: 1 as const, afford: true, used: false, playable: false });
    const withAb: Active = { ...E, nerve: { left: 2, max: 5 }, hand: { ...A.hand!, people: [{ ...A.hand!.people[0], abilities: [ab('steady-hand', 'roll')] }, A.hand!.people[1]] } };
    t.show(withAb);
    $('.tb-push').click();
    expect($('.tb-tab[data-id="dez/steady-hand"]').classList.contains('off')).toBe(true);
    t.show({ ...withAb, nerve: { left: 0, max: 5 }, hand: { ...withAb.hand!, people: [{ ...withAb.hand!.people[0], abilities: [{ ...ab('log-wipe', 'after'), afford: false }] }, A.hand!.people[1]] } });
    vi.useFakeTimers();
    $('.tb-tab[data-id="dez/log-wipe"]').click();
    vi.advanceTimersByTime(1000);
    expect(slot('dez/log-wipe').textContent).toContain('1 NERVE · YOU HAVE 0');
    vi.useRealTimers();
  });

  it('tipsFor offers PROGRAMS where a slot would LOAD (programs spec §2.6)', () => {
    const catalog = [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position' as const, line: 'x' }];
    const pockets = { deck: { name: 'D', quality: 2, skin: 'green' }, slots: 2, dead: false, loaded: [], catalog };
    const fits = { ...A, choices: A.choices.map((c) => (c.id === 'swap' ? { ...c, programs: { 'skeleton-key': { position: 'dark' as const, alarm: 0 as const } } } : c)), hand: { ...A.hand!, pockets } };
    expect(tipsFor(fits)).toContain('program');
    expect(tipsFor({ ...fits, hand: { ...fits.hand, pockets: { ...pockets, slots: 0 } } })).not.toContain('program');
    expect(tipsFor(A)).not.toContain('program');
  });

  it('tipsFor offers EFFECT once a card is not FAIR', () => {
    expect(tipsFor({ ...E, choices: [E.choices[0], E.choices[2]] })).not.toContain('effect');
    expect(tipsFor({ ...E, choices: [{ ...E.choices[0], pool: eff('small') }] })).toContain('effect');
  });
});

describe("a dealt roll's cost cards (roll lifecycle spec §1.5, mockup cost-cards.html A)", () => {
  const dealt = (o: Partial<NonNullable<Active['costs']>> = {}): Active => ({ ...A, choices: [], rolled: { choice: 'swap', faces: [3, 1], keep: 'high', kind: 'miss', cost: { alarm: 0, heat: 0 } }, costs: { ...COSTS_VIEW, ...o } });
  const cost = (id: string) => $(`.tb-costs .tb-cost[data-cost="${id}"]`);
  it('while the GM writes, a written line waits', () => {
    const { t } = mount();
    t.show(dealt({ writing: true }));
    const line = cost('alarm').querySelector('.tb-cost-line')!;
    expect(line.classList.contains('wait')).toBe(true);
    expect(line.textContent).toHaveLength(WAIT_CHARS);
    expect(line.textContent).not.toContain('log');
  });
  it('a picked cost shows its line, the GM or not', () => {
    const { t } = mount();
    t.show(dealt({ writing: true, dealt: COSTS_VIEW.dealt.map((c, i) => ({ ...c, picked: i === 0 })) }));
    expect(cost('alarm').querySelector('.tb-cost-line')!.textContent).toBe('A log fills in your name.');
  });
  it('the wait ends with the line', () => {
    const { t } = mount();
    t.show(dealt({ writing: true }));
    t.show(dealt());
    expect(cost('alarm').querySelector('.tb-cost-line')!.classList.contains('wait')).toBe(false);
    expect(cost('alarm').querySelector('.tb-cost-line')!.textContent).toBe('A log fills in your name.');
  });

  it('deals the costs beside the waiting roll: tag, line, PICK head; no STEADY anywhere', () => {
    const { t } = mount();
    t.show(dealt());
    expect($$('.tb-costs .tb-cost').map((c) => c.dataset.cost)).toEqual(['alarm', 'heat', 'worse']);
    expect(cost('alarm').querySelector('.tb-cost-tag')!.textContent).toBe('ALARM +1');
    expect(cost('alarm').querySelector('.tb-cost-line')!.textContent).toBe('A log fills in your name.');
    expect($('.tb-costs .tb-costs-head').textContent).toBe('PICK 1 · 0 PICKED');
    expect($$('[data-choice="!steady"]')).toEqual([]);
  });

  it('a card picks; a picked card stands alone with TAKE IT, RESIST and FIREWALL branching off it, each sent with its cost', () => {
    const { t, onChoose } = mount();
    t.show(dealt());
    cost('heat').click();
    expect(onChoose).toHaveBeenLastCalledWith('!cost', { card: 'heat' });
    const picked = dealt({ dealt: COSTS_VIEW.dealt.map((c) => (c.cost === 'heat' ? { ...c, picked: true } : c)) });
    t.show(picked);
    expect($$('.tb-costs .tb-cost').map((c) => c.dataset.cost)).toEqual(['heat']);
    expect(cost('heat').classList.contains('picked')).toBe(true);
    const btn = (k: string) => $(`.tb-costs .tb-cost-panel.${k}`) as HTMLButtonElement;
    expect($$('.tb-costs .tb-cost-panel').map((b) => b.querySelector('.tb-cost-panel-word')!.textContent)).toEqual(['TAKE IT', 'RESIST', 'FIREWALL']);
    expect(btn('resist').textContent).toContain('EDGE ●●');
    expect(btn('armour').textContent).toContain('1 LEFT');
    btn('resist').click();
    expect(onChoose).toHaveBeenLastCalledWith('!resist', { card: 'heat' });
    t.show(picked);
    btn('take').click();
    expect(onChoose).toHaveBeenLastCalledWith('!take', { card: 'heat' });
    t.show(picked);
    btn('armour').click();
    expect(onChoose).toHaveBeenLastCalledWith('!armour', { card: 'heat' });
  });

  it("RESIST says why it can't be used, FIREWALL stays out; settled, the row is back and a card past the pick count does nothing", () => {
    const { t, onChoose } = mount();
    t.show(dealt({ resist: { dice: 2, ok: false, why: 'ONE SHOT' }, armour: { ok: false, left: 0 }, dealt: COSTS_VIEW.dealt.map((c) => (c.cost === 'alarm' ? { ...c, picked: true } : c)) }));
    const resist = $('.tb-costs .tb-cost-panel.resist') as HTMLButtonElement;
    expect(resist.disabled).toBe(true);
    expect(resist.title).toBe('ONE SHOT');
    expect($$('.tb-costs .tb-cost-panel.armour')).toEqual([]);
    t.show(dealt({ dealt: COSTS_VIEW.dealt.map((c) => (c.cost === 'alarm' ? { ...c, picked: true, settled: 'taken' as const } : c)) }));
    expect($$('.tb-costs .tb-cost').map((c) => c.dataset.cost)).toEqual(['alarm', 'heat', 'worse']);
    expect(cost('alarm').querySelector('.tb-cost-how')!.textContent).toBe('TAKEN');
    onChoose.mockClear();
    cost('heat').click();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('final review I2: Enter picks a focused cost card; focus moves to its first answer after the redraw', () => {
    const { t, onChoose } = mount();
    t.show(dealt());
    cost('heat').focus();
    cost('heat').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onChoose).toHaveBeenLastCalledWith('!cost', { card: 'heat' });
    t.show(dealt({ dealt: COSTS_VIEW.dealt.map((c) => (c.cost === 'heat' ? { ...c, picked: true } : c)) }));
    expect(document.activeElement?.classList.contains('take')).toBe(true);
  });

  it('final review I3: one click sends; the cost controls lock until the next show', () => {
    const { t, onChoose } = mount();
    t.show(dealt());
    cost('heat').click();
    cost('heat').click();
    cost('alarm').click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    t.show(dealt());
    cost('alarm').click();
    expect(onChoose).toHaveBeenCalledTimes(2);
  });

  it("a settled card dims and says how; the GM's line marks itself to fade in", () => {
    const { t } = mount();
    t.show(dealt({ dealt: [{ ...COSTS_VIEW.dealt[0], picked: true, settled: 'resisted', faces: [5, 2], nerve: 1 }, { ...COSTS_VIEW.dealt[1], by: 'gm', line: 'The kid on the scooter rides off fast.' }, COSTS_VIEW.dealt[2]] }));
    expect(cost('alarm').classList.contains('settled')).toBe(true);
    expect(cost('alarm').textContent).toContain('RESISTED · −1 NERVE');
    expect(cost('heat').querySelector('.tb-cost-line')!.classList.contains('gm')).toBe(true);
  });
});

describe("a route's own ALARM", () => {
  it('a choice that raises ALARM shows it on its card, checked or plain', () => {
    const { t } = mount();
    t.show({ ...A, choices: A.choices.map((c) => (c.id === 'swap' || c.id === 'leave' ? { ...c, alarm: 1 } : c)) });
    expect(choice('swap').querySelector('.tb-tag.route')!.textContent).toBe('ALARM +1');
    expect(choice('leave').querySelector('.tb-tag.route')!.textContent).toBe('ALARM +1');
    expect(choice('sit').querySelector('.tb-tag.route')).toBeNull();
  });
});

describe('DECK: the carried deck and its slots (programs spec §2.1)', () => {
  const CATALOG = [
    { id: 'solvent', name: 'SOLVENT', stat: 'tech', kind: 'position' as const, line: 'Strips the lacquer back a layer.' },
    { id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position' as const, line: 'Tells the lock you were always allowed.' },
    { id: 'voicebox', name: 'VOICEBOX', stat: 'cool', kind: 'effect' as const, line: 'Your voice, their clearance.' },
    { id: 'firewall', name: 'FIREWALL', stat: 'any', kind: 'firewall' as const, line: 'Takes one hit.' },
  ];
  const NOPE = { why: 'NOTHING TO DO HERE' };
  const previews = {
    swap: { solvent: NOPE, 'skeleton-key': { position: 'dark' as const, alarm: 0 as const }, voicebox: NOPE, firewall: NOPE },
    sit: { solvent: NOPE, 'skeleton-key': NOPE, voicebox: { position: 'open' as const, effect: 'big' as const, alarm: 1 as const }, firewall: NOPE },
  };
  const pockets = (o: Partial<NonNullable<NonNullable<Active['hand']>['pockets']>> = {}) => ({ deck: { name: 'Cortex Meridian', quality: 3, skin: 'meridian' }, slots: 2, dead: false, loaded: [], catalog: CATALOG, ...o });
  const withPockets = (p = pockets(), choices = A.choices.map((c) => (c.id === 'swap' || c.id === 'sit' ? { ...c, programs: previews[c.id] } : c))): Active => ({ ...A, choices, hand: { ...A.hand!, favour: null, pockets: p } });
  const ids = () => $$('.tb-hand .g-deck .tb-slot').map((s) => s.dataset.id);
  const label = () => $('.tb-hand .g-deck .tb-group-label').textContent;
  /** Past the tray's double-click guard, for a test that clicks at machine speed. */
  const afterGuard = () => { const now = performance.now() + 1000; vi.spyOn(performance, 'now').mockReturnValue(now); };
  const trayIds = () => $$('.tb-load-tray .tb-slot').map((s) => s.dataset.id);

  it('the deck in the label, then EMPTY slots when nothing fits', () => {
    const { t } = mount();
    t.show(withPockets(pockets(), A.choices.map((c) => ({ ...c, ...(c.pool ? { programs: { solvent: NOPE, 'skeleton-key': NOPE, voicebox: NOPE, firewall: NOPE } } : {}) }))));
    expect(ids()).toEqual(['slot:1', 'slot:2']);
    expect(slot('slot:1').textContent).toContain('EMPTY');
    expect(label()).toBe('DECK · CORTEX MERIDIAN · Q3');
  });

  it('LOAD on an empty slot when a program fits a check here', () => {
    const { t } = mount();
    t.show(withPockets());
    expect(slot('slot:1').textContent).toContain('LOAD');
    // Mid-job, slotting a cart costs 1 NERVE (programs spec §1.2a).
    expect(slot('slot:1').textContent).toContain('HOT SLOT · 1 NERVE');
    expect(slot('slot:1').dataset.state).toBe('up');
  });

  it('no NERVE left for a load: the slot says so and stays shut', () => {
    const { t } = mount();
    t.show({ ...withPockets(), nerve: { left: 0, max: 5 } });
    expect(slot('slot:1').textContent).toContain('NO NERVE');
    expect(slot('slot:1').dataset.state).toBe('locked');
    slot('slot:1').click();
    expect(ids()).toEqual(['slot:1', 'slot:2']);
  });

  it('a loaded program lit where it fits, dim where it does not, BURNED and DEAD face down', () => {
    const { t } = mount();
    t.show(withPockets(pockets({ loaded: [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position', burned: false }, { id: 'firewall', name: 'FIREWALL', stat: 'any', kind: 'firewall', burned: true }] })));
    expect(ids()).toEqual(['prog:skeleton-key', 'prog:firewall']);
    expect(slot('prog:skeleton-key').dataset.state).toBe('up');
    expect(slot('prog:firewall').dataset.state).toBe('down');
    expect(slot('prog:firewall').textContent).toContain('BURNED');
    t.show(withPockets(pockets({ dead: true, loaded: [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position', burned: false }] })));
    expect(slot('prog:skeleton-key').dataset.state).toBe('down');
    expect(slot('prog:skeleton-key').textContent).toContain('DEAD');
    expect(slot('slot:2').textContent).toContain('DEAD');
  });

  it('a loaded program that fits no check here is dim', () => {
    const { t } = mount();
    t.show(withPockets(pockets({ loaded: [{ id: 'solvent', name: 'SOLVENT', stat: 'tech', kind: 'position', burned: false }] })));
    expect(slot('prog:solvent').dataset.state).toBe('locked');
  });

  it('program cards show their sheet 10b art, FIREWALL included', () => {
    const { t } = mount();
    t.show(withPockets(pockets({ loaded: [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position', burned: false }, { id: 'firewall', name: 'FIREWALL', stat: 'any', kind: 'firewall', burned: false }] })));
    expect(slot('prog:skeleton-key').querySelector('img')!.getAttribute('src')).toBe('/programs/skeleton-key.webp');
    expect(slot('prog:firewall').querySelector('img')!.getAttribute('src')).toBe('/programs/firewall.webp');
  });

  it('no deck: DECK · NONE and no slots', () => {
    const { t } = mount();
    t.show(withPockets(pockets({ deck: null, slots: 0 })));
    expect(ids()).toEqual([]);
    expect(label()).toBe('DECK · NONE');
  });

  it('LOAD opens a tray of the fitting programs over the moment; a pick marks it; again undoes it', () => {
    const { t } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    // The hand's row stays put, the open slot lit.
    expect(trayIds()).toEqual(['prog-pick:skeleton-key', 'prog-pick:voicebox']);
    expect(ids()).toEqual(['slot:1', 'slot:2']);
    expect(slot('slot:1').classList.contains('on')).toBe(true);
    slot('prog-pick:skeleton-key').click();
    expect(ids()).toEqual(['prog:skeleton-key', 'slot:2']);
    expect($('.tb-load-tray').hidden).toBe(true);
    expect(slot('prog:skeleton-key').classList.contains('on')).toBe(true);
    slot('prog:skeleton-key').click();
    expect(ids()).toEqual(['slot:1', 'slot:2']);
  });

  it('a tap outside the cards closes the fan', () => {
    const { t } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    expect($('.tb-load-tray').hidden).toBe(false);
    document.body.click();
    expect($('.tb-load-tray').hidden).toBe(true);
  });

  it('a beat that leaves nothing to load closes the tray, and the job ending does too', () => {
    const { t } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    expect($('.tb-load-tray').hidden).toBe(false);
    t.show(withPockets(pockets(), A.choices.map((c) => ({ ...c, ...(c.pool ? { programs: { solvent: NOPE, 'skeleton-key': NOPE, voicebox: NOPE, firewall: NOPE } } : {}) }))));
    expect($('.tb-load-tray').hidden).toBe(true);
    t.show(withPockets());
    slot('slot:1').click();
    t.end('DONE', '', document.createElement('div'));
    expect($('.tb-load-tray').hidden).toBe(true);
  });

  it('the click after the tray closes does not roll: the moment has just come back under the pointer', () => {
    const { t, onChoose } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    slot('prog-pick:skeleton-key').click();
    choice('swap').click();
    expect(onChoose).not.toHaveBeenCalled();
    afterGuard();
    choice('swap').click();
    expect(onChoose).toHaveBeenCalled();
  });

  it('Esc closes the tray first', () => {
    const { t } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect($('.tb-load-tray').hidden).toBe(true);
  });

  it('a waiting roll with nothing to pay says CARRY ON, not that a cost lands', () => {
    const { t } = mount();
    t.show({ ...A, choices: [{ id: '!take', line: 'CARRY ON' }], rolled: { choice: 'swap', faces: [6], keep: 'high', kind: 'clean', cost: { alarm: 0, heat: 0 } } });
    expect(choice('!take').textContent).toContain('CARRY ON');
    expect(choice('!take').textContent).toContain('NOTHING TO PAY');
    expect(choice('!take').textContent).not.toContain('THE COST LANDS');
  });

  it('the pool line previews programs', () => {
    const { t } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    slot('prog-pick:skeleton-key').click();
    expect(choice('swap').querySelector('.tb-side-word')!.textContent).toBe('DARK');
    // The mid-job load's NERVE (§1.2a); on sit the lacquer's ALARM too.
    expect(choice('swap').querySelector('.tb-tag.lacquer')).toBeNull();
    expect(choice('swap').querySelector('.tb-tag.hot')!.textContent).toBe('LOAD · 1 NERVE');
    slot('slot:2').click();
    slot('prog-pick:voicebox').click();
    expect(choice('sit').querySelector('.tb-tag.lacquer')!.textContent).toBe('ALARM +1');
    expect(choice('sit').querySelector('.tb-tag.hot')!.textContent).toBe('LOAD · 1 NERVE');
    expect(choice('sit').querySelector('.tb-eff')!.textContent).toBe('BIG');
  });

  describe('the tier cut (tier effect spec §2)', () => {
    const CUT = { label: 'TIER 2 −1', lifted: false };
    const HAND = { label: 'DEZ · HAND', lifted: true };
    const DECK = { label: 'CORTEX MERIDIAN Q3', lifted: true };
    const small = { effect: 'small' as const, tier: CUT };
    const keyed = { position: 'dark' as const, alarm: 0 as const, effect: 'fair' as const, tier: DECK };
    const voiced = { position: 'open' as const, alarm: 0 as const, effect: 'big' as const, tier: DECK };
    const cut = (o: { plays?: Record<string, object>; programs?: Record<string, object> } = {}): Active => {
      const choices = A.choices.map((c) => (c.id === 'swap' ? { ...c, pool: { ...c.pool!, ...small }, plays: { dez: { dice: 3, position: 'open' as const, effect: 'fair' as const, tier: HAND } }, programs: { solvent: NOPE, 'skeleton-key': keyed, voicebox: voiced, firewall: NOPE }, ...o } : c)) as Active['choices'];
      return { ...withPockets(pockets(), choices), tier: 2 };
    };
    const tag = () => choice('swap').querySelector<HTMLElement>('.tb-tag.tier');
    const eff = () => choice('swap').querySelector('.tb-eff')!.textContent;

    it('a cut card shows TIER 2 −1', () => {
      const { t } = mount();
      t.show(cut());
      expect(tag()!.textContent).toBe('TIER 2 −1');
      expect(tag()!.classList.contains('lifted')).toBe(false);
      expect(eff()).toBe('SMALL');
    });
    it('a lifted card names the recruit', () => {
      const { t } = mount();
      t.show(cut());
      slot('dez').click();
      expect(tag()!.textContent).toBe('DEZ · HAND');
      expect(tag()!.classList.contains('lifted')).toBe(true);
      expect(eff()).toBe('FAIR');
    });
    it('a marked program lifts the shown effect one step', () => {
      const { t } = mount();
      t.show(cut());
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('CORTEX MERIDIAN Q3');
      expect(eff()).toBe('FAIR');
    });
    it('an effect program marked on a cut card shows BIG', () => {
      const { t } = mount();
      t.show(cut());
      slot('slot:1').click();
      slot('prog-pick:voicebox').click();
      expect(eff()).toBe('BIG');
    });
    it('a called recruit and a marked program do not count the lift twice', () => {
      const { t } = mount();
      t.show(cut());
      slot('dez').click();
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('DEZ · HAND');
      expect(eff()).toBe('FAIR');
    });
    it('a program on a deck below the tier leaves the tag', () => {
      const { t } = mount();
      t.show(cut({ programs: { solvent: NOPE, 'skeleton-key': { ...keyed, effect: 'small', tier: CUT }, voicebox: NOPE, firewall: NOPE } }));
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('TIER 2 −1');
      expect(eff()).toBe('SMALL');
    });
    // Below SMALL (TIER and heat 6): the server sums every step, then clamps once (review of the tier cut).
    const below = (o: Parameters<typeof cut>[0] = {}): Active => {
      const a = cut(o);
      return { ...a, choices: a.choices.map((c) => (c.id === 'swap' ? { ...c, pool: { ...c.pool!, effectRaw: -1 }, trade: { safe: 'ALREADY SMALL', bold: null }, pushEffect: null } : c)) };
    };
    it('a lifting program on a card below SMALL stays SMALL, as the server rolls it', () => {
      const { t } = mount();
      t.show(below());
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('CORTEX MERIDIAN Q3');
      expect(eff()).toBe('SMALL');
    });
    it('an effect program on a card below SMALL shows FAIR, not BIG', () => {
      const { t } = mount();
      t.show(below());
      slot('slot:1').click();
      slot('prog-pick:voicebox').click();
      expect(eff()).toBe('FAIR');
    });
    it('BOLD on a card below SMALL stays SMALL', () => {
      const { t } = mount();
      t.show(below());
      $('.tb-trade .tb-bold').click();
      expect(eff()).toBe('SMALL');
    });
    it('a position program dropped under a lifted card that reaches the dark neither lifts nor loads', () => {
      const { t } = mount();
      const a = cut({ plays: { dez: { dice: 3, position: 'dark', effect: 'small', tier: CUT } } });
      t.show(a);
      slot('dez').click();
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('TIER 2 −1');
      expect(eff()).toBe('SMALL');
      expect(choice('swap').querySelector('.tb-tag.hot')).toBeNull();
    });
    it('a position program dropped under a lift BOLD then undoes neither lifts nor moves the card', () => {
      const { t } = mount();
      const a = cut({ plays: { dez: { dice: 3, position: 'dark', effect: 'small', effectRaw: 0, tier: CUT, path: { placed: 'open', lift: true, worse: false } } } });
      t.show({ ...a, choices: a.choices.map((c) => (c.id === 'swap' ? { ...c, pool: { ...c.pool!, path: { placed: 'open' as const, lift: false, worse: false } }, trade: { safe: null, bold: null }, pushEffect: null } : c)) });
      slot('dez').click();
      $('.tb-trade .tb-bold').click();
      slot('slot:1').click();
      slot('prog-pick:skeleton-key').click();
      expect(tag()!.textContent).toBe('TIER 2 −1');
      expect(choice('swap').dataset.pos).toBe('open');
      expect(eff()).toBe('FAIR');
    });
    it('SAFE under NEXT ROLL WORSE reads as the server rolls it', () => {
      const { t } = mount();
      const a = cut();
      t.show({ ...a, choices: a.choices.map((c) => (c.id === 'swap' ? { ...c, pool: { ...c.pool!, position: 'wire' as const, effect: 'fair' as const, effectRaw: 1, path: { placed: 'wire' as const, lift: false, worse: true } }, trade: { safe: null, bold: null }, pushEffect: null } : c)) });
      $('.tb-trade .tb-safe').click();
      expect(choice('swap').dataset.pos).toBe('wire');
    });
    it('a program only a lifted card makes fit can be marked with that card up', () => {
      const { t, onChoose } = mount();
      const fits = { position: 'open' as const, effect: 'fair' as const, alarm: 1 as const, tier: HAND };
      t.show(below({ programs: { solvent: NOPE, 'skeleton-key': NOPE, voicebox: { why: 'ALREADY BIG' }, firewall: NOPE }, plays: { dez: { dice: 3, position: 'open', effect: 'small', effectRaw: 0, tier: HAND, previews: { solvent: NOPE, 'skeleton-key': NOPE, voicebox: fits, firewall: NOPE } } } }));
      slot('dez').click();
      slot('slot:1').click();
      slot('prog-pick:voicebox').click();
      expect(eff()).toBe('FAIR');
      afterGuard();
      choice('swap').click();
      expect(onChoose).toHaveBeenLastCalledWith('swap', expect.objectContaining({ programs: { load: ['voicebox'], run: [] } }));
    });
    describe('hover info', () => {
      const rest = (el: HTMLElement) => {
        el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        vi.advanceTimersByTime(700);
        return $('.tb-info').textContent;
      };
      afterEach(() => vi.useRealTimers());
      it('a card says what it would roll, with a lifted card and a marked program', () => {
        const { t } = mount();
        t.show(cut());
        vi.useFakeTimers();
        expect(rest(choice('swap'))).toContain('SMALL: a crit fills 2 TAKE');
        expect($('.tb-info').textContent).toContain('TIER 2 −1: a HAND recruit called on this roll lifts it');
        slot('dez').click();
        expect($('.tb-info').hidden).toBe(true);
        choice('sit').dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
        expect(rest(choice('swap'))).toContain('Tier cut lifted by DEZ · HAND.');
        expect($('.tb-info').textContent).toContain('FAIR: a crit fills 3 TAKE');
      });
      it('a recruit says what they would do here', () => {
        const { t } = mount();
        t.show(cut());
        vi.useFakeTimers();
        expect(rest(slot('dez'))).toContain('Here: REFLEX · 3D · OPEN · FAIR');
      });
      it('a program in the fan says what it does here', () => {
        const { t } = mount();
        t.show(cut());
        slot('slot:1').click();
        vi.useFakeTimers();
        expect(rest(slot('prog-pick:skeleton-key'))).toContain('Tells the lock you were always allowed.');
        expect($('.tb-info').textContent).toContain('Here: REFLEX · DARK · FAIR');
      });
    });
    it('a pool with no tier has no tag', () => {
      const { t } = mount();
      t.show(withPockets());
      expect(tag()).toBeNull();
    });
  });

  it('the roll sends programs: loads, then a loaded one toggled to run', () => {
    const { t, onChoose } = mount();
    t.show(withPockets());
    slot('slot:1').click();
    slot('prog-pick:skeleton-key').click();
    afterGuard();
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { programs: { load: ['skeleton-key'], run: [] } });
    t.show(withPockets(pockets({ loaded: [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position', burned: false }] })));
    slot('prog:skeleton-key').click();
    choice('swap').click();
    expect(onChoose).toHaveBeenLastCalledWith('swap', { programs: { load: [], run: ['skeleton-key'] } });
    // A program that does nothing on the card picked isn't sent.
    t.show(withPockets(pockets({ loaded: [{ id: 'skeleton-key', name: 'SKELETON KEY', stat: 'reflex', kind: 'position', burned: false }] })));
    slot('prog:skeleton-key').click();
    choice('sit').click();
    expect(onChoose).toHaveBeenLastCalledWith('sit', {});
  });

  it("the FIREWALL panel's two wordings", () => {
    const { t } = mount();
    const picked = { ...COSTS_VIEW, dealt: COSTS_VIEW.dealt.map((d, i) => (i === 0 ? { ...d, picked: true } : d)) };
    t.show({ ...withPockets(), costs: { ...picked, armour: { ok: true, left: 1, load: true } } });
    expect($('.tb-cost-panel.armour small').textContent).toBe('LOAD FIREWALL · 1 SLOT · 1 NERVE');
    t.show({ ...withPockets(), costs: { ...picked, armour: { ok: true, left: 1 } } });
    expect($('.tb-cost-panel.armour small').textContent).toBe('FIREWALL LOADED · 1 LEFT');
    t.show({ ...withPockets(), costs: { ...picked, armour: { ok: false, left: 0 } } });
    expect(document.querySelector('.tb-cost-panel.armour')).toBeNull();
  });
});
