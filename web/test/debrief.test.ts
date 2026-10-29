import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debriefEl } from '../src/room/debrief';
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
const show = (d: Debrief, reduced = false) => {
  const cues: string[] = [];
  const n = debriefEl(d, { cue: (c) => cues.push(c), reduced });
  document.body.append(n);
  return { n, cues };
};
const text = (n: HTMLElement, sel: string) => [...n.querySelectorAll(sel)].map((x) => x.textContent);

describe('the debrief', () => {
  it('stamps the tier with its cue', () => {
    expect(show(D).cues).toEqual(['clean']);
    expect(show(D).n.querySelector('.db-tier')!.textContent).toBe('CLEAN');
    const messy = show({ ...D, tier: 'messy' });
    expect(messy.n.querySelector('.db-tier')!.textContent).toBe('MESSY');
    expect(messy.cues).toEqual(['messy']);
    expect(show({ ...D, tier: 'blown' }).cues).toEqual(['blown']);
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
      edge: 0,
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
      edge: 0,
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
  it('lists clues found, READ FULL/HALF/WRONG (never the words), the gig as HACK · MEDIUM · CLEAN, then the totals', () => {
    const big: Debrief = { ...D, checks: [], big: { clues: ["A courier's strap.", 'The guard changes at four.'], read: 'half', gig: { kind: 'hack', tier: 'medium', result: 'close' } } };
    const n = debriefEl(big, { cue: () => {}, reduced: true });
    document.body.append(n);
    const order = [...n.children].map((c) => c.className);
    expect(order.indexOf('db-clues')).toBeLessThan(order.indexOf('db-read'));
    expect(order.indexOf('db-read')).toBeLessThan(order.indexOf('db-gig'));
    expect(order.indexOf('db-gig')).toBeLessThan(order.indexOf('db-totals'));
    expect([...n.querySelectorAll('.db-clues li')].map((li) => li.textContent)).toEqual(["A courier's strap.", 'The guard changes at four.']);
    expect(n.querySelector('.db-read')!.textContent).toBe('READ · HALF');
    expect(n.querySelector('.db-gig')!.textContent).toBe('HACK · MEDIUM · CLOSE CALL');
    const none = debriefEl({ ...D, big: { clues: [], read: null, gig: null } }, { cue: () => {}, reduced: true });
    expect(none.querySelector('.db-read')).toBeNull();
    expect(none.querySelector('.db-gig')).toBeNull();
  });
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
