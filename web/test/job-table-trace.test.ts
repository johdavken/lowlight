import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountJobTable } from '../src/room/table/job-table';
import type { QuestState } from '../../shared/types';

type Active = NonNullable<QuestState['active']>;
const pool = (stat: string, dice: number, position: 'dark' | 'open' | 'wire') => ({ stat, base: dice, dice, parts: [], position, noDeck: false, effect: 'fair' as const });
const koji = { id: 'koji', name: 'Koji Marsh', spec: 'muscle' as const, grade: 1 as const, face: null, traits: [], free: 1, risk: null, down: false, abilities: [] };
const beat = (id: string, title: string, post?: { id: string; suits?: 'muscle' | 'face'; by?: string }) => ({ id, title, ...(post ? { post } : {}) });
const ROUTE = { ways: [{ via: 'charm', beats: [beat('lobby', 'THE LOBBY'), beat('desk', 'THE DESK', { id: 'desk', suits: 'face' }), beat('out', 'THE WAY OUT')] }, { via: 'stairs', beats: [beat('lobby', 'THE LOBBY'), beat('stairwell', 'THE STAIRWELL', { id: 'door', suits: 'muscle' }), beat('out', 'THE WAY OUT')] }], played: [] as string[] };
const A: Active = {
  id: 'night-clerk',
  title: 'Night Clerk',
  beat: 'lobby',
  tier: 2,
  route: ROUTE,
  choices: [
    { id: 'charm', line: 'Go to the glass.', leads: 'THE DESK', pool: pool('COOL', 3, 'open'), plays: { koji: { dice: 4, position: 'open', effect: 'fair' } } },
    { id: 'stairs', line: 'Take the stair.', leads: 'THE STAIRWELL', pool: pool('REFLEX', 2, 'dark'), plays: { koji: { dice: 3, position: 'dark', effect: 'fair' } } },
  ],
  alarm: 1,
  nerve: { left: 4, max: 5 },
  take: { filled: 1, size: 4 },
  heat: 0,
  pay: [360, 440],
  hand: { approach: 'quiet', people: [koji, { ...koji, id: 'mia', name: 'Mia Okoro', spec: 'face' as const }], favour: null, contacts: [] },
};
const OUT: Active = { ...A, beat: 'out', route: { ...ROUTE, played: ['lobby', 'stairwell'] }, choices: [{ id: 'run', line: 'Run.', pool: pool('REFLEX', 2, 'open'), on: { miss: 'part', harm: { who: 'koji', harm: 'hurt' } } }, { id: 'loud', line: 'Go through them.', pool: pool('BODY', 1, 'wire'), on: { miss: 'none' }, blows: true }] };
const cost = (id: 'alarm' | 'worse' | 'take', picked = false) => ({ cost: id, tag: id.toUpperCase(), line: `${id} line`, by: 'written' as const, picked });
const COSTS: Active = { ...OUT, choices: [], costs: { pick: 1, dealt: [cost('alarm'), cost('worse')], resist: { dice: 2, ok: true }, armour: { ok: false, left: 0 } } };
const ANSWER: Active = { ...COSTS, costs: { ...COSTS.costs!, dealt: [cost('alarm', true), cost('worse')] } };

const one = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const mount = () => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const onChoose = vi.fn();
  const onUp = vi.fn();
  const t = mountJobTable(g, { onChoose, onTalk: vi.fn(), reduced: () => true, onUp });
  return { t, onChoose, onUp };
};
const card = (id: string) => one(`.tb-deal .tb-card[data-choice="${id}"]`);
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the job table in the trace (mockup graft-trace.html)', () => {
  it('a rolled card shows its odds and what a 6, a 4–5 and a miss do', () => {
    const { t } = mount();
    t.show(A);
    expect(card('charm').querySelector('.tb-oddsbar')!.getAttribute('aria-label')).toBe('A 6: 42 in 100. A 4–5: 45. A miss: 13.');
    expect(all('.tb-card[data-choice="charm"] .tb-res-row').map((r) => r.textContent)).toEqual(['6+2 TAKE. No cost.', '4–5+1 TAKE. Pick 1 cost.', '1–3No TAKE. Pick 2 costs.']);
    expect(card('stairs').querySelector('.tb-oddsbar')!.getAttribute('aria-label')).toBe('A 6: 31 in 100. A 4–5: 44. A miss: 25.');
    expect(card('charm').querySelector('.tb-statname')!.textContent).toBe('COOL');
    expect(card('charm').querySelector('.tb-pos')!.textContent).toBe('IN THE OPEN');
    expect(card('charm').querySelector('.tb-key')!.textContent).toBe('ROLL COOL');
  });

  it('a lifted recruit changes the odds on the cards they play', () => {
    const { t } = mount();
    t.show(A);
    one('.tb-hand .tb-slot[data-id="koji"]').click();
    expect(card('charm').querySelector('.tb-oddsbar')!.getAttribute('aria-label')).toBe('A 6: 52 in 100. A 4–5: 42. A miss: 6.');
  });

  it("a miss says what it loses: the take, or half with the holder's hit, or the job", () => {
    const { t } = mount();
    t.show(OUT);
    expect(card('run').querySelector('.tb-res-row.r1')!.textContent).toBe('1–3YOU KEEP HALF THE TAKE. Pick 2 costs. KOJI TAKES THE HIT.');
    expect(card('loud').querySelector('.tb-res-row.r1')!.textContent).toBe('1–3YOU LOSE THE TAKE. Pick 2 costs.');
  });

  it("a fork's card names the post on its way and who of yours suits it", () => {
    const { t } = mount();
    t.show(A);
    expect(card('charm').querySelector('.tb-leads')!.textContent).toBe('LEADS TO THE DESK');
    expect(card('charm').querySelector('.tb-leads-post')!.textContent).toBe('A POST THERE: THE DESK · SUITS MIA');
    expect(card('stairs').querySelector('.tb-leads-post')!.textContent).toBe('A POST THERE: THE DOOR · SUITS KOJI');
  });

  it('draws the route over the JOB column, with the beat and the job line', () => {
    const { t } = mount();
    t.show(A);
    expect(one('.tb-route .tb-role').textContent).toBe('TIER 2 · HEAT 0 · 360–440 SOL');
    expect(one('.tb-route svg.rt [data-beat="lobby"]').getAttribute('class')).toBe('lit cur');
    expect(one('.tb-route .tb-beat').textContent).toBe('THE LOBBY');
    expect(one('.tb-route .rt-note').textContent).toBe('A POST: ONE OF YOURS CAN STAY THERE');
    t.show(OUT);
    expect(one('.tb-route .rt-note').textContent).toBe('A MISS HERE KEEPS HALF · KOJI TAKES THE HIT');
    expect(one('.tb-route svg.rt [data-beat="out"]').getAttribute('class')).toBe('hot cur');
  });

  it('the post stands at the head of the crew rail', () => {
    const { t } = mount();
    t.show({ ...A, beat: 'stairwell', post: { id: 'door', line: 'Hold the door.', gives: 'The way out stays open.', suits: 'muscle' } });
    expect(one('.g-people > .tb-group-label > .tb-post')).not.toBeNull();
    expect(one('.g-people > .tb-group-label > .tb-post-note').textContent).toBe('The way out stays open.');
    one('.tb-hand .tb-slot[data-id="mia"]').click();
    expect(one('.g-people > .tb-group-label > .tb-post')).not.toBeNull();
  });

  it('the levers stand at the end of the hand as ON THE ROLL', () => {
    const { t } = mount();
    t.show(A);
    expect(one('.tb-bottom > .tb-onroll .tb-push')).not.toBeNull();
    expect(one('.tb-bottom > .tb-onroll .tb-trade .tb-safe')).not.toBeNull();
    expect(one('.tb-onroll').hidden).toBe(false);
    t.end('Night Clerk', 'Out.', document.createElement('div'));
    expect(one('.tb-onroll').hidden).toBe(true);
  });

  it('tells the bar when it goes up and comes down', () => {
    const { t, onUp } = mount();
    t.show(A);
    expect(onUp).toHaveBeenLastCalledWith(true);
    t.close();
    expect(onUp).toHaveBeenLastCalledWith(false);
  });

  describe('keys', () => {
    it('the first card is selected; arrows move it and Enter rolls it', () => {
      const { t, onChoose } = mount();
      t.show(A);
      expect(card('charm').classList.contains('sel')).toBe(true);
      expect(t.key('ArrowRight', true)).toBe(true);
      expect(card('stairs').classList.contains('sel')).toBe(true);
      expect(t.key('ArrowRight', true)).toBe(true);
      expect(card('charm').classList.contains('sel')).toBe(true);
      expect(t.key('ArrowLeft', true)).toBe(true);
      expect(t.key('Enter', true)).toBe(true);
      expect(onChoose).toHaveBeenLastCalledWith('stairs', {});
    });

    it('the selected card lights its way on the route', () => {
      const { t } = mount();
      t.show(A);
      const ways = () => all('.tb-route svg.rt path').map((p) => p.getAttribute('class'));
      expect(ways()).toEqual(['lit', 'lit', 'dim', 'dim']);
      t.key('ArrowRight', true);
      expect(ways()).toEqual(['lit', 'dim', 'lit', 'dim']);
    });

    it('a digit calls the crew in rail order, P pushes, S and B trade; none while typing', () => {
      const { t, onChoose } = mount();
      t.show(A);
      expect(t.key('2', true)).toBe(false);
      expect(t.key('p', true)).toBe(false);
      expect(t.key('1', false)).toBe(true);
      expect(one('.tb-hand .tb-slot[data-id="koji"]').classList.contains('lifted')).toBe(true);
      expect(t.key('p', false)).toBe(true);
      expect(one('.tb-push').classList.contains('on')).toBe(true);
      expect(t.key('b', false)).toBe(true);
      expect(one('.tb-trade .tb-bold').classList.contains('on')).toBe(true);
      t.key('Enter', true);
      expect(onChoose).toHaveBeenLastCalledWith('charm', { push: 'dice', trade: 'bold', card: 'koji' });
    });

    it('Escape puts a lifted card back, and is left alone with nothing lifted', () => {
      const { t } = mount();
      t.show(A);
      expect(t.key('Escape', true)).toBe(false);
      t.key('1', false);
      expect(t.key('Escape', true)).toBe(true);
      expect(all('.tb-hand .tb-slot.lifted')).toEqual([]);
    });

    it('up and down move the cost, Enter picks it; then Enter takes it and R resists', () => {
      const { t, onChoose } = mount();
      t.show(COSTS);
      expect(one('.tb-cost[data-cost="alarm"]').classList.contains('kb')).toBe(true);
      expect(t.key('ArrowDown', true)).toBe(true);
      expect(one('.tb-cost[data-cost="worse"]').classList.contains('kb')).toBe(true);
      expect(t.key('Enter', true)).toBe(true);
      expect(onChoose).toHaveBeenLastCalledWith('!cost', { card: 'worse' });
      t.show(ANSWER);
      expect(t.key('r', true)).toBe(false);
      expect(t.key('r', false)).toBe(true);
      expect(onChoose).toHaveBeenLastCalledWith('!resist', { card: 'alarm' });
      t.show(ANSWER);
      expect(t.key('Enter', true)).toBe(true);
      expect(onChoose).toHaveBeenLastCalledWith('!take', { card: 'alarm' });
    });

    it('takes no key while the contact is on the line, and Enter closes the debrief', () => {
      const { t, onChoose } = mount();
      t.show(A);
      t.hold('Rue');
      expect(t.key('Enter', true)).toBe(false);
      expect(onChoose).not.toHaveBeenCalled();
      t.hold(null);
      t.end('Night Clerk', 'Out.', document.createElement('div'));
      expect(t.key('Enter', true)).toBe(true);
      expect(t.isOpen()).toBe(false);
    });

    // Review fixes (the branch's fresh review, 2026-11-15).
    it('a second Enter while the pick is on its way is not a second pick', () => {
      const { t, onChoose } = mount();
      t.show(A);
      expect(t.key('Enter', true)).toBe(true);
      expect(t.key('Enter', true)).toBe(false);
      expect(onChoose).toHaveBeenCalledTimes(1);
      t.show({ ...A, beat: 'desk' });
      expect(t.key('Enter', true)).toBe(true);
      expect(onChoose).toHaveBeenCalledTimes(2);
    });

    it('a new beat starts on its first card, even one with the same ids', () => {
      const { t } = mount();
      t.show(A);
      t.key('ArrowRight', true);
      t.show({ ...A, beat: 'desk' });
      expect(card('charm').classList.contains('sel')).toBe(true);
    });

    it('the digits count only the recruits who can be called', () => {
      const { t } = mount();
      t.show({ ...A, hand: { ...A.hand!, people: [{ ...koji, down: true }, { ...koji, id: 'mia', name: 'Mia Okoro', spec: 'face' as const }] } });
      expect(one('.tb-keys').textContent).toContain('[1] CALL CREW');
      expect(t.key('1', false)).toBe(true);
      expect(one('.tb-hand .tb-slot[data-id="mia"]').classList.contains('lifted')).toBe(true);
    });

    it("the next roll's costs start on the first again", () => {
      const { t } = mount();
      t.show(COSTS);
      t.key('ArrowDown', true);
      t.show(A);
      t.show(COSTS);
      expect(one('.tb-cost[data-cost="alarm"]').classList.contains('kb')).toBe(true);
    });

    it('WALK or PRESS ON names the moment, not the beat id', () => {
      const { t } = mount();
      t.show({ ...A, beat: '!push', route: undefined, choices: [{ id: '!walk', line: 'WALK — 200 SOL' }, { id: '!press', line: 'PRESS ON' }], push: { stage: 1, pot: 0, walk: { sol: 200, heat: 0 } } });
      expect(one('.tb-route .tb-beat').textContent).toBe('PRESS ON?');
    });

    it('the key line names only the keys that work now', () => {
      const { t } = mount();
      t.show(A);
      expect(one('.tb-keys').textContent).toBe('[←→] CHOICE · [1–2] CALL CREW · [P] PUSH · [S] SAFE · [B] BOLD · [ENTER] ROLL, AND GO THAT WAY');
      t.key('1', false);
      expect(one('.tb-keys').textContent).toContain('[ESC] PUT BACK');
      t.show(COSTS);
      expect(one('.tb-keys').textContent).toBe('[↑↓] COST · [ENTER] PICK IT');
      t.show(ANSWER);
      expect(one('.tb-keys').textContent).toBe('[ENTER] TAKE IT · [R] RESIST');
      t.hold('Rue');
      expect(one('.tb-keys').textContent).toBe('');
    });
  });

  // The table's additions (2026-11-15): SO FAR, the offer box, and the leaders to the offer and the held post.
  describe('SO FAR, under the JOB column', () => {
    const row = (beat: string, title: string, line: string, o: { take?: number; alarm?: number } = {}) => ({ beat, title, line, ...o });
    const LOBBY = row('lobby', 'THE LOBBY', 'COOL 5 · THROUGH, AT A COST', { take: 1, alarm: 1 });
    const STAIR = row('stairwell', 'THE STAIRWELL', 'BODY 6 6 · CRIT', { take: 3 });
    const box = () => one('.tb-sofar');
    const rows = () => all('.tb-sofar > .tb-sofar-row');
    const moved = (r: HTMLElement) => [...r.querySelectorAll('.tb-sofar-moved > b')].map((b) => [b.className, b.textContent]);

    it("lists each rolled beat played: its name, the roll's line and what it changed, oldest first", () => {
      const { t } = mount();
      t.show({ ...OUT, soFar: [LOBBY, STAIR] });
      expect(box().hidden).toBe(false);
      // In the log region, after the column's place.
      expect(box().parentElement!.classList.contains('tb-log')).toBe(true);
      expect(box().previousElementSibling!.className).toBe('tb-log-at');
      expect([...box().children].map((n) => n.className)).toEqual(['tb-sofar-head', 'tb-sofar-row', 'tb-sofar-row']);
      expect(one('.tb-sofar-head').textContent).toBe('SO FAR');
      expect(rows().map((r) => [...r.children].map((n) => n.className))).toEqual([['tb-sofar-beat', 'tb-sofar-line', 'tb-sofar-moved'], ['tb-sofar-beat', 'tb-sofar-line', 'tb-sofar-moved']]);
      expect(rows().map((r) => [r.querySelector('.tb-sofar-beat')!.textContent, r.querySelector('.tb-sofar-line')!.textContent])).toEqual([['THE LOBBY', 'COOL 5 · THROUGH, AT A COST'], ['THE STAIRWELL', 'BODY 6 6 · CRIT']]);
      expect(rows().map(moved)).toEqual([[['take', 'TAKE +1'], ['alarm', 'ALARM +1']], [['take', 'TAKE +3']]]);
    });

    it('what a beat took back is marked apart: TAKE lost and ALARM off, with a real minus; a beat that moved nothing shows none', () => {
      const { t } = mount();
      t.show({ ...OUT, soFar: [row('lobby', 'THE LOBBY', 'COOL 2 · MISS', { take: -1, alarm: 2 }), row('desk', 'THE DESK', 'WITS 6 · CLEAN', { alarm: -2 }), row('stairwell', 'THE STAIRWELL', 'BODY 4 · THROUGH, AT A COST')] });
      expect(rows().map(moved)).toEqual([[['take loss', 'TAKE −1'], ['alarm', 'ALARM +2']], [['alarm off', 'ALARM −2']], []]);
      expect(rows()[0].querySelector('.tb-sofar-moved b')!.textContent!.charCodeAt(5)).toBe(0x2212);
      expect(rows()[2].querySelector('.tb-sofar-moved')!.childElementCount).toBe(0);
    });

    it('shows the latest four: older beats drop off the top', () => {
      const { t } = mount();
      const six = [1, 2, 3, 4, 5, 6].map((n) => row(`b${n}`, `BEAT ${n}`, `COOL ${n} · CLEAN`, { take: n }));
      t.show({ ...OUT, soFar: six });
      expect(rows().map((r) => r.querySelector('.tb-sofar-beat')!.textContent)).toEqual(['BEAT 3', 'BEAT 4', 'BEAT 5', 'BEAT 6']);
      expect(rows().map((r) => r.querySelector('.tb-sofar-moved')!.textContent)).toEqual(['TAKE +3', 'TAKE +4', 'TAKE +5', 'TAKE +6']);
      expect(all('.tb-sofar-head')).toHaveLength(1);
      t.show({ ...OUT, soFar: six.slice(0, 4) });
      expect(rows().map((r) => r.querySelector('.tb-sofar-beat')!.textContent)).toEqual(['BEAT 1', 'BEAT 2', 'BEAT 3', 'BEAT 4']);
    });

    it('is hidden and empty with nothing played, and once the job has ended', () => {
      const { t } = mount();
      t.show(A);
      expect([box().hidden, box().childElementCount]).toEqual([true, 0]);
      t.show({ ...A, soFar: [] });
      expect([box().hidden, box().childElementCount]).toEqual([true, 0]);
      t.show({ ...OUT, soFar: [LOBBY] });
      expect([box().hidden, rows().length]).toEqual([false, 1]);
      // The next state replaces the rows; one without any empties the box.
      t.show({ ...OUT, soFar: [LOBBY, STAIR] });
      expect(rows()).toHaveLength(2);
      t.show(OUT);
      expect([box().hidden, box().childElementCount]).toEqual([true, 0]);
      t.show({ ...OUT, soFar: [LOBBY, STAIR] });
      t.end('Night Clerk', 'Out.', document.createElement('div'));
      expect([box().hidden, box().childElementCount]).toEqual([true, 0]);
    });

    it('stays while a roll waits on its costs', () => {
      const { t } = mount();
      t.show({ ...COSTS, soFar: [LOBBY] });
      expect([box().hidden, rows().length]).toEqual([false, 1]);
    });
  });

  describe('a card that rolls nothing says what it does for certain', () => {
    const rows = (id: string) => all(`.tb-card[data-choice="${id}"] .tb-res-row`).map((r) => [r.querySelector('.tb-res-k')!.textContent, r.querySelector('.tb-res-text')!.textContent]);
    const plain = (sure: NonNullable<Active['choices'][number]['sure']> | undefined, more: Record<string, unknown> = {}): Active => ({ ...A, choices: [...A.choices, { id: 'walk', line: 'Copy it and walk.', ...(sure ? { sure } : {}), ...more }] });

    it('NO ROLL, a SURE bar where the odds would be, then the TAKE it fills and where it goes', () => {
      const { t } = mount();
      t.show(plain({ take: 1, then: 'THE END' }));
      const card = one('.tb-card[data-choice="walk"]');
      expect(card.querySelector('.tb-sure')).not.toBeNull();
      expect(card.querySelector('.tb-noroll')!.textContent).toBe('NO ROLL');
      expect(card.querySelector('.tb-oddsbar')!.textContent).toBe('SURE 100');
      expect(rows('walk')).toEqual([
        ['TAKE', '+1 TAKE. No dice, no cost.'],
        ['THEN', 'The job ends.'],
      ]);
    });

    it('a template job fills nothing; the card names the next beat, its ALARM, its time and what it leaves', () => {
      const { t } = mount();
      t.show(plain({ take: 0, then: 'THE FLOOR', minutes: 20, left: 'part', pay: 'half' }, { alarm: 1 }));
      expect(rows('walk')).toEqual([
        ['TAKE', 'No TAKE. It costs nothing either.'],
        ['ALARM', 'ALARM +1. Whatever else happens.'],
        ['ENDS', 'You keep half the take.'],
        ['PAYS', 'Half.'],
        ['TIME', '20 min.'],
        ['THEN', 'THE FLOOR'],
      ]);
      t.show(plain({ take: 0, blown: true }));
      expect(rows('walk')).toEqual([
        ['TAKE', 'No TAKE. It costs nothing either.'],
        ['ENDS', 'THE JOB IS BLOWN.'],
      ]);
    });

    it('with nothing sent about it (an older server) the card is as it was: NO ROLL and its key', () => {
      const { t } = mount();
      t.show(plain(undefined));
      const card = one('.tb-card[data-choice="walk"]');
      expect(card.querySelector('.tb-sure')).toBeNull();
      expect(card.querySelector('.tb-oddsbar')).toBeNull();
      expect(card.querySelector('.tb-noroll')!.textContent).toBe('NO ROLL');
    });
  });

  describe('the offer box: what a recruit can play on the waiting roll, before you pick', () => {
    const ab = (id: string, label: string, o: Record<string, unknown> = {}) => ({ id, label, kind: 'nerve' as const, timing: 'after' as const, words: `${label} words.`, nerve: 0 as 0 | 1, afford: true, used: false, playable: true, ...o });
    const rolled = { choice: 'run', faces: [3, 1], keep: 'high' as const, kind: 'miss' as const, cost: { alarm: 1, heat: 0 } };
    const crew = (kojis: ReturnType<typeof ab>[], mias: ReturnType<typeof ab>[] = []) => ({ ...A.hand!, people: [{ ...koji, abilities: kojis }, { ...koji, id: 'mia', name: 'Mia Okoro', spec: 'face' as const, abilities: mias }] });
    /** A roll waiting on its costs, with the crew's abilities. */
    const waiting = (kojis: ReturnType<typeof ab>[], mias: ReturnType<typeof ab>[] = []): Active => ({ ...COSTS, rolled, hand: crew(kojis, mias) });
    const offers = () => all('.tb-deal > .tb-offers > .tb-offer');
    const WIPE = ab('log-wipe', 'Log Wipe');

    it("shows each playable AFTER A ROLL ability under the roll and over its costs: whose it is, its name, its words and PLAY", () => {
      const { t } = mount();
      t.show(waiting([WIPE, ab('steady-hand', 'Steady Hand', { timing: 'roll', playable: false })], [ab('clean-exit', 'Clean Exit', { nerve: 1 })]));
      expect(all('.tb-deal > *').map((n) => n.className.split(' ')[0])).toEqual(['tb-parked', 'tb-offers', 'tb-costs']);
      expect([...one('.tb-offers').children].map((n) => n.className)).toEqual(['tb-offers-head', 'tb-offer', 'tb-offer']);
      expect(one('.tb-offers-head').textContent).toBe('BEFORE YOU PICK');
      expect(offers().map((o) => [o.dataset.card, o.dataset.who])).toEqual([['koji/log-wipe', 'koji'], ['mia/clean-exit', 'mia']]);
      expect(offers().map((o) => [...o.children].map((n) => `${n.tagName.toLowerCase()}.${n.className}`))).toEqual([['span.tb-offer-who', 'div.tb-offer-name', 'div.tb-offer-words', 'button.tb-offer-play'], ['span.tb-offer-who', 'div.tb-offer-name', 'div.tb-offer-words', 'button.tb-offer-play']]);
      // The first name in capitals; an ability that costs NERVE says so.
      expect(offers().map((o) => [...o.children].map((n) => n.textContent))).toEqual([['KOJI', 'Log Wipe', 'Log Wipe words.', 'PLAY'], ['MIA · 1 NERVE', 'Clean Exit', 'Clean Exit words.', 'PLAY']]);
      const play = offers()[0].querySelector<HTMLButtonElement>('.tb-offer-play')!;
      expect([play.type, play.getAttribute('aria-label')]).toEqual(['button', 'Play Log Wipe']);
    });

    it('PLAY sends !after with its card; nothing while the contact is on the line', () => {
      const { t, onChoose } = mount();
      t.show(waiting([WIPE], [ab('clean-exit', 'Clean Exit', { nerve: 1 })]));
      t.hold('Rue');
      offers()[1].querySelector<HTMLElement>('.tb-offer-play')!.click();
      expect(onChoose).not.toHaveBeenCalled();
      t.hold(null);
      offers()[1].querySelector<HTMLElement>('.tb-offer-play')!.click();
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenLastCalledWith('!after', { card: 'mia/clean-exit' });
      offers()[0].querySelector<HTMLElement>('.tb-offer-play')!.click();
      expect(onChoose).toHaveBeenLastCalledWith('!after', { card: 'koji/log-wipe' });
    });

    it('stands under a parked roll that has no costs dealt, before its cards', () => {
      const { t } = mount();
      t.show({ ...OUT, choices: [{ id: '!take', line: 'TAKE IT' }], rolled, hand: crew([WIPE]) });
      expect(all('.tb-deal > *').map((n) => n.className.split(' ')[0])).toEqual(['tb-parked', 'tb-offers', 'tb-card']);
      expect(offers().map((o) => o.dataset.card)).toEqual(['koji/log-wipe']);
    });

    it('no box with no roll waiting, with nothing playable, or on a phone', () => {
      const { t } = mount();
      // The ability is ready but no roll waits.
      t.show({ ...OUT, hand: crew([WIPE]) });
      expect(document.querySelector('.tb-offers')).toBeNull();
      // A roll waits, and nothing can be played on it: not playable, or not an AFTER A ROLL one.
      t.show(waiting([ab('log-wipe', 'Log Wipe', { playable: false }), ab('steady-hand', 'Steady Hand', { timing: 'roll' })]));
      expect(document.querySelector('.tb-offers')).toBeNull();
      t.show(waiting([]));
      expect(document.querySelector('.tb-offers')).toBeNull();
      t.show({ ...COSTS, rolled, hand: undefined });
      expect(document.querySelector('.tb-offers')).toBeNull();
      const width = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
      try {
        t.show(waiting([WIPE]));
        expect(document.querySelector('.tb-offers')).toBeNull();
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      }
    });

    it('goes on the next state that has nothing to offer, and is not doubled by a redraw', () => {
      const { t } = mount();
      t.show(waiting([WIPE]));
      expect(all('.tb-offers')).toHaveLength(1);
      // The same roll again (a cost picked): still one box, still over the costs.
      t.show({ ...waiting([WIPE]), costs: ANSWER.costs });
      expect(all('.tb-offers')).toHaveLength(1);
      expect(all('.tb-deal > *').map((n) => n.className.split(' ')[0])).toEqual(['tb-parked', 'tb-offers', 'tb-costs']);
      // Played: the ability is spent.
      t.show(waiting([ab('log-wipe', 'Log Wipe', { playable: false, used: true })]));
      expect(document.querySelector('.tb-offers')).toBeNull();
      t.show(waiting([WIPE]));
      expect(all('.tb-offers')).toHaveLength(1);
      // The roll settled: the next beat.
      t.show({ ...A, hand: crew([WIPE]) });
      expect(document.querySelector('.tb-offers')).toBeNull();
    });
  });

  describe('leaders to the offer and to the held post', () => {
    // jsdom lays nothing out, so the trace draws nothing by itself: the boxes it measures are given here, on the stage's pixels.
    type Box = [left: number, top: number, width: number, height: number];
    afterEach(() => vi.unstubAllGlobals());
    const layout = (root: HTMLElement, boxes: [string, Box][]) => {
      // jsdom has no CSS.escape, which the trace's selectors use; the ids here need no escaping.
      vi.stubGlobal('CSS', { escape: (s: string) => s });
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1600);
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const [l, t, w, h] = this === root ? [0, 0, 1600, 900] : (boxes.find(([sel]) => this.matches(sel))?.[1] ?? [0, 0, 0, 0]);
        return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => ({}) } as DOMRect;
      });
    };
    /** The trace is drawn on the next frame. */
    const frame = async () => {
      for (let i = 0; i < 2; i++) await new Promise<void>((r) => requestAnimationFrame(() => r()));
    };
    const drawn = () => all('svg.hv-lead').filter((s) => s.childElementCount > 0).map((s) => s.dataset.lead!);
    const lead = (key: string) => document.querySelector<SVGSVGElement>(`svg.hv-lead[data-lead="${key}"]`);
    const d = (key: string) => lead(key)!.querySelector('path')!.getAttribute('d')!;
    // The top bar and the hand's row fix the rail: the left rail at x 72, the hand's rail at y 702.
    const FRAME: [string, Box][] = [['.tb-top', [100, 20, 1400, 40]], ['.tb-bottom', [100, 700, 1400, 180]]];
    const ab = (id: string, label: string) => ({ id, label, kind: 'nerve' as const, timing: 'after' as const, words: 'WORDS', nerve: 0 as const, afford: true, used: false, playable: true });
    const rolled = { choice: 'run', faces: [3, 1], keep: 'high' as const, kind: 'miss' as const, cost: { alarm: 1, heat: 0 } };
    const OFFER: Active = { ...COSTS, rolled, hand: { ...A.hand!, people: [{ ...koji, abilities: [ab('log-wipe', 'Log Wipe')] }, { ...koji, id: 'mia', name: 'Mia Okoro', spec: 'face' as const, abilities: [ab('clean-exit', 'Clean Exit')] }] } };
    const HELD: Active = { ...A, beat: 'stairwell', post: { id: 'door', line: 'Hold the door.', gives: 'The way out stays open.', suits: 'muscle', by: 'koji' }, route: { ways: ROUTE.ways.map((w) => ({ ...w, beats: w.beats.map((b) => (b.post?.id === 'door' ? { ...b, post: { ...b.post, by: 'koji' } } : b)) })), played: ['lobby'] } };

    it("an offer's leader runs from its recruit's place in the hand to its box, one per offer", async () => {
      const { t } = mount();
      layout(t.root, [...FRAME, ['.tb-slot[data-id="koji"], .tb-slot[data-id="koji"] *', [300, 720, 60, 80]], ['.tb-slot[data-id="mia"], .tb-slot[data-id="mia"] *', [400, 720, 60, 80]], ['.tb-offer[data-who="koji"]', [500, 300, 200, 100]], ['.tb-offer[data-who="mia"]', [800, 300, 200, 100]]]);
      t.show(OFFER);
      await frame();
      expect(drawn().filter((k) => k.startsWith('offer'))).toEqual(['offer-0-0', 'offer-1-0']);
      expect(lead('offer-0-0')!.parentElement).toBe(t.root);
      // From over the middle of Koji's card, up to the rail, along it, and up into the foot of the box: each offer in its own lane.
      expect(d('offer-0-0')).toBe('M330.5 716.5 L348.5 698.5 L237.5 698.5 L532.5 403.5');
      expect(d('offer-1-0')).toBe('M430.5 716.5 L452.5 694.5 L569.5 694.5 L860.5 403.5');
      expect(lead('offer-0-0')!.style.getPropertyValue('--hv-c')).toBe('var(--k-people)');
      // No call or program leader while the costs are up, and no post's.
      expect(drawn().filter((k) => k.startsWith('lift') || k === 'post')).toEqual([]);
      // The offer gone, its leader goes.
      t.show({ ...OFFER, hand: { ...OFFER.hand!, people: [OFFER.hand!.people[0], { ...OFFER.hand!.people[1], abilities: [] }] } });
      await frame();
      expect(drawn().filter((k) => k.startsWith('offer'))).toEqual(['offer-0-0']);
      t.show(A);
      await frame();
      expect(drawn().filter((k) => k.startsWith('offer'))).toEqual([]);
    });

    it('no offer leader without an offer', async () => {
      const { t } = mount();
      layout(t.root, [...FRAME, ['.tb-slot[data-id="koji"], .tb-slot[data-id="koji"] *', [300, 720, 60, 80]]]);
      t.show(COSTS);
      await frame();
      expect(drawn()).toEqual(expect.arrayContaining(['head', 'rail']));
      expect(drawn().filter((k) => k.startsWith('offer'))).toEqual([]);
    });

    it("a held post's leader runs from the POST key along the rail and up the left to its beat on the route", async () => {
      const { t } = mount();
      layout(t.root, [...FRAME, ['.tb-post', [110, 720, 100, 30]], ['.tb-route [data-beat="stairwell"] .pst', [150, 86, 10, 10]]]);
      t.show(HELD);
      await frame();
      expect(one('.tb-post').classList.contains('held')).toBe(true);
      expect(drawn()).toContain('post');
      expect(lead('post')!.parentElement).toBe(t.root);
      expect(d('post')).toBe('M122.5 717.5 L122.5 692.5 L82.5 692.5 L82.5 173.5 L155.5 100.5');
      expect(lead('post')!.style.getPropertyValue('--hv-c')).toBe('var(--k-people)');
      // Nobody at the post: the key stands, with no leader.
      t.show({ ...HELD, post: { ...HELD.post!, by: undefined }, route: { ...ROUTE, played: ['lobby'] } });
      await frame();
      expect(document.querySelector('.tb-post')).not.toBeNull();
      expect(drawn()).not.toContain('post');
    });

    it('no post leader with no held post, or once the job has ended', async () => {
      const { t } = mount();
      layout(t.root, [...FRAME, ['.tb-post', [110, 720, 100, 30]], ['.tb-route [data-beat="stairwell"] .pst', [150, 86, 10, 10]]]);
      t.show({ ...A, beat: 'stairwell', post: { id: 'door', line: 'Hold the door.', gives: 'The way out stays open.', suits: 'muscle' } });
      await frame();
      expect(drawn()).toEqual(expect.arrayContaining(['head', 'rail']));
      expect(drawn()).not.toContain('post');
      t.show(HELD);
      await frame();
      expect(drawn()).toContain('post');
      t.end('Night Clerk', 'Out.', document.createElement('div'));
      await frame();
      expect(drawn()).not.toContain('post');
    });
  });
});
