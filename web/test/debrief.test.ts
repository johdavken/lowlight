import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debriefEl, debriefRolls } from '../src/room/debrief';
import { mountQuestCards } from '../src/room/quest-cards';
import type { Debrief } from '../../shared/types';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const D: Debrief = {
  tier: 'clean',
  checks: [
    { line: 'Loop the cameras from the roof.', stat: 'TECH', chance: 74, rolls: [91, 40] },
    { line: 'Crack the lock panel.', crack: { tries: 2, state: 'granted' } },
  ],
  sol: 420,
  heat: { district: 'karasu', delta: 3 },
  rep: { district: 'karasu', before: 30, after: 37 },
};
describe('loot (crew goods spec §6)', () => {
  it('names the lot', () => {
    show({ ...D, loot: { label: 'DATA' } });
    expect(document.querySelector('.db-loot')!.textContent).toBe('A LOT OF DATA');
  });
  it('with the stash full it says it was lost', () => {
    show({ ...D, loot: { label: 'DATA', lost: true } });
    expect(document.querySelector('.db-loot')!.textContent).toBe('A LOT OF DATA · NO ROOM IN THE STASH');
  });
});

const show = (d: Debrief, reduced = false) => {
  const cues: string[] = [];
  const n = debriefEl(d, { cue: (c) => cues.push(c), reduced });
  document.body.append(n);
  return { n, cues };
};
const text = (n: HTMLElement, sel: string) => [...n.querySelectorAll(sel)].map((x) => x.textContent);

describe('the debrief', () => {
  it('the debrief shows program lines (programs spec §2.5)', () => {
    const { n } = show({ ...D, programs: ['SOLVENT · RAN 2 · TECH IN THE DARK', 'FIREWALL · BURNED'] });
    expect(text(n, '.db-program-line')).toEqual(['SOLVENT · RAN 2 · TECH IN THE DARK', 'FIREWALL · BURNED']);
    expect(show(D).n.querySelector('.db-programs')).toBeNull();
  });

  it('a recruit line under the crew lines (crew spec §5)', () => {
    const { n } = show({ ...D, crew: ['DEZ · CLEAN RUN · 2 TO HAND'], recruit: 'RECRUIT · SAIDA RAHM WANTS IN' });
    expect(text(n, '.db-recruit')).toEqual(['RECRUIT · SAIDA RAHM WANTS IN']);
    expect(n.querySelector('.db-crew + .db-recruit')).not.toBeNull();
    expect(show(D).n.querySelector('.db-recruit')).toBeNull();
  });

  it('crew lines under the checks', () => {
    const { n } = show({ ...D, crew: ['DEZ · CLEAN RUN · 2 TO HAND', 'MOSS FENCED IT · TAKE +1'] });
    expect(text(n, '.db-crew-line')).toEqual(['DEZ · CLEAN RUN · 2 TO HAND', 'MOSS FENCED IT · TAKE +1']);
    expect(n.querySelector('.db-checks + .db-row > .db-crew')).not.toBeNull();
    expect(show(D).n.querySelector('.db-crew')).toBeNull();
  });
  it('a person\'s lines stand on their card; a line about nobody stays words (graft results 2026-11-04)', () => {
    const { n } = show({
      ...D,
      crew: ['KOJI · HURT · 2 DAYS', 'DEZ · CLEAN RUN · 2 TO HAND', 'KOJI · MESSY', 'CASS FENCED IT · TAKE +1', 'MOSS FENCED IT · TAKE +1'],
      people: [{ name: 'DEZ', face: 'crew-wire-02' }, { name: 'KOJI', face: null }, { name: 'CASS', face: null, art: '/contacts/cass.webp' }, { name: 'PELL', face: 'crew-runner-01' }],
    });
    const cards = [...n.querySelectorAll('.db-mate')];
    expect(cards.map((c) => c.querySelector('.db-mate-name')!.textContent)).toEqual(['DEZ', 'KOJI', 'CASS']);
    expect(text(cards[1] as HTMLElement, '.db-crew-line')).toEqual(['KOJI · HURT · 2 DAYS', 'KOJI · MESSY']);
    expect(cards[1].classList.contains('hurt')).toBe(true);
    expect(cards[0].querySelector('img')!.getAttribute('src')).toBe('/api/extras/crew-wire-02');
    expect(cards[2].querySelector('img')!.getAttribute('src')).toBe('/contacts/cass.webp');
    expect(text(cards[2] as HTMLElement, '.db-crew-line')).toEqual(['CASS FENCED IT · TAKE +1']);
    expect(text(n, '.db-crew > .db-crew-line')).toEqual(['MOSS FENCED IT · TAKE +1']);
  });

  it('two people with one first name: their lines stay words, once each', () => {
    const { n } = show({ ...D, crew: ['JUNO · HELD', 'JUNO · CLEAN RUN'], people: [{ name: 'JUNO', face: 'a' }, { name: 'JUNO', face: 'b' }] });
    expect(n.querySelector('.db-mate')).toBeNull();
    expect(text(n, '.db-crew-line')).toEqual(['JUNO · HELD', 'JUNO · CLEAN RUN']);
  });

  it('a contact\'s missing art falls to their initial', () => {
    const { n } = show({ ...D, crew: ['CASS FENCED IT · TAKE +1'], people: [{ name: 'CASS', face: null, art: '/contacts/cass.webp' }] });
    n.querySelector('.db-face')!.dispatchEvent(new Event('error'));
    expect(n.querySelector('.db-face')!.textContent).toBe('C');
  });

  it('YOU KEEP is the pay less her cut and a paid retainer', () => {
    const keep = (d: Partial<Debrief>) => show({ ...D, ...d }, true).n.querySelector('.db-keep b')!.textContent;
    expect(keep({})).toBe('420 SOL');
    expect(keep({ cut: { name: 'Nix', pct: 25, amount: 105 }, retainer: { name: 'Nix', amount: 30, paid: true } })).toBe('285 SOL');
    expect(keep({ retainer: { name: 'Nix', amount: 30, paid: false } })).toBe('420 SOL');
    expect(keep({ sol: 0, retainer: { name: 'Nix', amount: 30, paid: true } })).toBe('−30 SOL');
  });

  it('debriefRolls takes the checks and pushes out for the JOB column', () => {
    const { n } = show({ ...D, pushes: [{ line: 'One more.', faces: [6, 2], kind: 'clean', result: 'won', sol: 50 }] });
    const rolls = debriefRolls(n)!;
    expect(rolls.querySelectorAll('.db-check, .db-push')).toHaveLength(3);
    expect(n.querySelector('.db-checks, .db-pushes')).toBeNull();
    expect(debriefRolls(n)).toBeNull();
  });

  it('stamps the tier with its cue', () => {
    expect(show(D).cues).toEqual(['clean']);
    expect(show(D).n.querySelector('.db-tier')!.textContent).toBe('CLEAN');
    const messy = show({ ...D, tier: 'messy' });
    expect(messy.n.querySelector('.db-tier')!.textContent).toBe('MESSY');
    expect(messy.cues).toEqual(['messy']);
    expect(show({ ...D, tier: 'blown' }).cues).toEqual(['blown']);
  });

  it('dice rows: the top two faces and the result; a 0d roll shows the lower first; STEADIED (the table spec §4)', () => {
    const { n } = show({
      ...D,
      checks: [
        { line: 'Talk.', stat: 'COOL', dice: 3, position: 'open', faces: [6, 6, 2], keep: 'high', kind: 'crit' },
        { line: 'Grab.', stat: 'REFLEX', dice: 2, position: 'open', faces: [3, 5], keep: 'high', kind: 'cost', steadied: true },
        { line: 'Bluff.', stat: 'COOL', dice: 0, position: 'wire', faces: [5, 2], keep: 'low', kind: 'miss' },
      ],
    });
    expect(text(n, '.db-check .db-roll')).toEqual(['6 6 CRIT', '5 3 COST · STEADIED', '2 5 MISS']);
  });

  it('the TAKE clock and the NERVE spent', () => {
    const { n } = show({ ...D, take: { filled: 3, size: 4 }, nerve: 4 });
    expect(n.querySelectorAll('.db-take i')).toHaveLength(4);
    expect(n.querySelectorAll('.db-take i.on')).toHaveLength(3);
    expect(n.querySelector('.db-nerve')!.textContent).toBe('NERVE −4');
    expect(show(D).n.querySelector('.db-take')).toBeNull();
    expect(show(D).n.querySelector('.db-nerve')).toBeNull();
  });

  it('a PRESSED row on the dice shows its faces', () => {
    const { n } = show({ ...D, pushes: [{ line: 'Empty the safe.', stat: 'REFLEX', dice: 2, position: 'open', faces: [6, 1], keep: 'high', kind: 'clean', result: 'won', sol: 150 }], push: 'won' });
    expect(text(n, '.db-push .db-roll')).toEqual(['6 1 CLEAN']);
  });

  it('shows a PRESSED section with +150 SOL and LOST rows', () => {
    const { n } = show({
      ...D,
      pushes: [
        { line: 'Empty the safe.', stat: 'REFLEX', chance: 57, rolls: [10], result: 'won', sol: 150 },
        { line: 'Copy the payroll.', stat: 'TECH', chance: 64, rolls: [99], result: 'lost', sol: 0 },
      ],
      push: 'lost',
    });
    expect(n.querySelector('.db-pushes .db-push-head')!.textContent).toBe('PRESSED');
    expect(text(n, '.db-push .db-line')).toEqual(['Empty the safe.', 'Copy the payroll.']);
    expect(text(n, '.db-push .db-roll')).toEqual(['REFLEX 57% · 10 clean', 'TECH 64% · 99 no']);
    expect(text(n, '.db-push .db-gain')).toEqual(['+150 SOL', 'LOST']);
    expect(show(D).n.querySelector('.db-pushes')).toBeNull();
  });

  it('lists each check with its odds and rolls, and each crack', () => {
    const { n } = show(D);
    expect(text(n, '.db-check .db-roll')).toEqual(['TECH 74% · 91 no · 40 clean', 'CRACK · 2 TRIES USED · ACCESS GRANTED']);
    expect(text(n, '.db-check .db-line')).toEqual(['Loop the cameras from the roof.', 'Crack the lock panel.']);
  });

  it('counts the sol up to its value', async () => {
    const { n } = show(D);
    expect(n.querySelector('.db-sol')!.textContent).toBe('0 SOL');
    await vi.runAllTimersAsync();
    expect(n.querySelector('.db-sol')!.textContent).toBe('420 SOL');
    expect(show(D, true).n.querySelector('.db-sol')!.textContent).toBe('420 SOL');
  });

  it('heat, rep, and the tier crossing only when the tier changed', () => {
    const same = show(D).n;
    expect(same.querySelector('.db-heat')!.textContent).toBe('HEAT KARASU +3');
    expect(same.querySelector('.db-rep')!.textContent).toBe('REP KARASU 30 → 37');
    expect(same.querySelector('.db-cross')).toBeNull();
    const down = show({ ...D, tier: 'blown', rep: { district: 'karasu', before: 30, after: 16 } }).n;
    expect(down.querySelector('.db-cross')!.textContent).toBe('KARASU · KNOWN → NOBODY');
  });

  it('a deck gained or lost', () => {
    expect(show(D).n.querySelector('.db-deck')).toBeNull();
    expect(show({ ...D, deck: { from: 'stall-build', to: null } }).n.querySelector('.db-deck')!.textContent).toBe('DECK STALL BUILD → NONE');
    expect(show({ ...D, deck: { from: 'stall-build', to: 'deaf-meridian' } }).n.querySelector('.db-deck')!.textContent).toBe('DECK STALL BUILD → DEAF MERIDIAN');
  });

  it('names the cover that softened it', () => {
    expect(show({ ...D, tier: 'blown', cover: 'burner' }).n.querySelector('.db-cover')!.textContent).toBe('A BURNER TOOK HALF');
    expect(show({ ...D, tier: 'blown', cover: 'fall-guy' }).n.querySelector('.db-cover')!.textContent).toBe('A FALL GUY TOOK IT');
  });
});

describe('cover cards', () => {
  it('show their copy, marked as cover', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show({
      id: 'back-door',
      title: 'Back Door',
      beat: 'door',
      alarm: 1,
      nerve: { left: 0, max: 5 },
      heat: 2,
      pay: [350, 450],
      choices: [
        { id: '!burner', line: 'USE BURNER (−7 INSTEAD OF −14)' },
        { id: '!fall-guy', line: 'USE FALL GUY (0, −225 SOL)' },
        { id: '!take', line: 'TAKE IT' },
      ],
    });
    expect([...h.querySelectorAll('.qc-card.qc-cover .qc-line')].map((n) => n.textContent)).toEqual(['USE BURNER (−7 INSTEAD OF −14)', 'USE FALL GUY (0, −225 SOL)']);
    expect(h.querySelector('.qc-head .qc-blown')!.textContent).toBe('BLOWN');
  });

  it('carry the debrief as it stands under them (I3)', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).show({
      id: 'back-door',
      title: 'Back Door',
      beat: 'door',
      alarm: 1,
      nerve: { left: 0, max: 5 },
      heat: 2,
      pay: [350, 450],
      choices: [
        { id: '!burner', line: 'USE BURNER (−6 INSTEAD OF −12)' },
        { id: '!take', line: 'TAKE IT' },
      ],
      blown: { text: '*He turns you round.*', debrief: { ...D, tier: 'blown', rep: { district: 'karasu', before: 30, after: 18 } } },
    });
    expect(h.querySelector('.qc-cards + .db .db-tier')!.textContent).toBe('BLOWN');
    expect(h.querySelector('.db .db-rep')!.textContent).toBe('REP KARASU 30 → 18');
  });
});

describe('the end panel', () => {
  it('carries the debrief under the story', () => {
    const h = document.createElement('div');
    document.body.append(h);
    mountQuestCards(h, { onChoose: vi.fn(), onTalk: vi.fn() }).end('Back Door', '*All of it.*', { debrief: D, cue: vi.fn(), reduced: true });
    expect(h.querySelector('.qc-story + .db')).not.toBeNull();
  });
});

describe('the big debrief', () => {
});

describe('a trust job (Intake board spec §2)', () => {
  it('a trust job: the word line, no rep line', () => {
    const { n } = show({ ...D, rep: { district: 'karasu', before: 30, after: 30 }, trust: { name: 'Nix', before: 'Wary', after: 'Steady' } });
    expect(text(n, '.db-trust')).toEqual(['NIX · WARY → STEADY']);
    expect(n.querySelector('.db-rep')).toBeNull();
  });
  it('a trust job with no word change shows neither', () => {
    const { n } = show({ ...D, rep: { district: 'karasu', before: 30, after: 30 }, trust: null });
    expect(n.querySelector('.db-trust')).toBeNull();
    expect(n.querySelector('.db-rep')).toBeNull();
  });
  it('other jobs keep the rep line', () => {
    const { n } = show(D);
    expect(text(n, '.db-rep')).toEqual(['REP KARASU 30 → 37']);
    expect(n.querySelector('.db-trust')).toBeNull();
  });
});

describe('her cut (Tier 2 spec §3)', () => {
  it('NIX\'S CUT · 25% · −40 SOL', () => {
    expect(text(show({ ...D, cut: { name: 'Nix', pct: 25, amount: 40 } }).n, '.db-cut')).toEqual(["NIX'S CUT · 25% · −40 SOL"]);
    document.body.innerHTML = '';
    expect(show(D).n.querySelector('.db-cut')).toBeNull();
  });
});

describe('the retainer (arrangement spec §2)', () => {
  it('retainer lines', () => {
    expect(text(show({ ...D, retainer: { name: 'Nix', amount: 150, paid: true } }).n, '.db-retainer')).toEqual(["NIX'S RETAINER −150 SOL"]);
    document.body.innerHTML = '';
    expect(text(show({ ...D, retainer: { name: 'Nix', amount: 150, paid: false } }).n, '.db-unpaid')).toEqual(["NIX WASN'T PAID"]);
    document.body.innerHTML = '';
    const { n } = show(D);
    expect(n.querySelector('.db-retainer, .db-unpaid')).toBeNull();
  });
});
