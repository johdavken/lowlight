import { describe, expect, it } from 'vitest';
import type { Grade, Trait } from './crew-book';
import { ABILITY_NERVE, abilityCard, abilityEffect, abilityNerve, better, hardStartTake, callEffect, contactId, crewLines, drawHurtDays, favourFor, jobShares, lossOnAgain, pressed, type Call, type Setup } from './hand';
import type { DiceRoll } from './quests';
import { afterEffect, savedFaces } from './dice';

const trait = (id: string, kind: 'never-held' | 'hurt-not-gone-once'): Trait => ({ id, label: id, good: true, effect: { kind }, for: 'any', text: '' });
const setup = (people: string[], o: Partial<Setup> = {}): Setup => ({ approach: 'quiet', people, favour: false, at: 100, ...o });
const call = (card: string, o: Partial<Call> = {}): Call => ({ beat: 'b1', choice: 'c1', card, again: false, at: 110, ...o });

describe('RUNNER (crew cleanup spec §3)', () => {
  it('lifts on TECH and gives a die on REFLEX', () => {
    expect(callEffect({ spec: 'runner' }, 'tech', 'open')).toMatchObject({ lift: true });
    expect(callEffect({ spec: 'runner' }, 'reflex', 'open')).toMatchObject({ lift: false, dice: 1 });
  });
});

describe('better', () => {
  it('lifts one position, the dark stays', () => {
    expect([better('wire'), better('open'), better('dark')]).toEqual(['open', 'dark', 'dark']);
  });
});

describe('callEffect', () => {
  it('lifts on its stat, +1d in the dark or off it', () => {
    expect(callEffect({ spec: 'runner' }, 'tech', 'wire')).toMatchObject({ lift: true, dice: 0 });
    expect(callEffect({ spec: 'runner' }, 'tech', 'dark')).toMatchObject({ lift: false, dice: 1 });
    expect(callEffect({ spec: 'runner' }, 'cool', 'open')).toMatchObject({ lift: false, dice: 1 });
    expect(callEffect({ spec: 'runner' }, 'tech', 'open')).toMatchObject({ lift: true, dice: 0 });
    expect(callEffect({ spec: 'muscle' }, 'body', 'open')).toMatchObject({ lift: true, dice: 0 });
  });
  it('fence and wheel are not playable', () => {
    expect(callEffect({ spec: 'fence' }, 'reflex', 'open')).toBeNull();
    expect(callEffect({ spec: 'wheel' }, 'reflex', 'open')).toBeNull();
  });
  it('the favour is +1d anywhere', () => {
    expect(callEffect('favour', 'tech', 'wire')).toEqual({ lift: false, dice: 1, label: 'FAVOUR' });
  });
});

describe('lossOnAgain', () => {
  const rate = (grade: Grade, position: 'wire' | 'open', neverHeld = false) => {
    const out = { hurt: 0, held: 0, none: 0 };
    for (let i = 0; i < 6000; i++) out[lossOnAgain({ seed: `s${i}`, grade, position, neverHeld }) ?? 'none']++;
    return out;
  };
  it('1 in 2, 3, 4 and 6 by grade', () => {
    ([[0, 2], [1, 3], [2, 4], [3, 6]] as [Grade, number][]).forEach(([g, n]) => {
      const r = rate(g, 'open');
      expect(Math.abs(r.hurt / 6000 - 1 / n)).toBeLessThan(0.02);
      expect(r.held).toBe(0);
    });
  });
  it('held on the wire, hurt with never-held', () => {
    expect(rate(1, 'wire').hurt).toBe(0);
    expect(rate(1, 'wire').held).toBeGreaterThan(0);
    expect(rate(1, 'wire', true).held).toBe(0);
    expect(rate(1, 'wire', true).hurt).toBeGreaterThan(0);
  });
});

describe('drawHurtDays', () => {
  it('med 2–3, high 2–4, seeded', () => {
    const med = new Set(Array.from({ length: 200 }, (_, i) => drawHurtDays(`m${i}`, 'med')));
    expect([...med].sort()).toEqual([2, 3]);
    expect(drawHurtDays('x', 'high')).toBe(drawHurtDays('x', 'high'));
  });
});

describe('favourFor', () => {
  it('Known and cool enough', () => {
    expect(favourFor({ rep: 19, heat: 0, district: 'Karasu' })).toEqual({ ok: false, why: 'NO FAVOURS · NOBODY HERE' });
    expect(favourFor({ rep: 20, heat: 5, district: 'Karasu' })).toEqual({ ok: true });
    expect(favourFor({ rep: 20, heat: 6, district: 'Karasu' })).toEqual({ ok: false, why: 'NO FAVOURS · KARASU HEAT 6' });
  });
});

describe('jobShares', () => {
  const rs = [
    { id: 'dez', spec: 'runner' as const, traits: [], goneUsed: false },
    { id: 'koji', spec: 'muscle' as const, traits: [], goneUsed: false },
  ];
  it('clean and messy share the tier', () => {
    expect(jobShares({ setup: setup(['dez', 'koji']), calls: [], tier: 'clean', seed: 's', recruits: rs }).map((s) => [s.rid, s.kind, s.fate])).toEqual([['dez', 'clean', null], ['koji', 'clean', null]]);
    expect(jobShares({ setup: setup(['dez']), calls: [], tier: 'messy', seed: 's', recruits: rs }).map((s) => s.kind)).toEqual(['messy']);
  });
  it('blown draws seeded fates', () => {
    const fates = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const a = jobShares({ setup: setup(['dez']), calls: [], tier: 'blown', seed: `s${i}`, recruits: rs });
      expect(a).toEqual(jobShares({ setup: setup(['dez']), calls: [], tier: 'blown', seed: `s${i}`, recruits: rs }));
      fates.add(String(a[0].fate));
      if (a[0].fate === 'hurt') expect(a[0].hurtDays).toBeGreaterThanOrEqual(2);
    }
    expect([...fates].sort()).toEqual(['gone', 'held', 'hurt']);
  });
  it('blown fates follow never-held and hurt-not-gone-once', () => {
    const tough = [{ id: 'dez', spec: 'runner' as const, traits: [trait('a', 'never-held'), trait('b', 'hurt-not-gone-once')], goneUsed: false }];
    for (let i = 0; i < 300; i++) expect(jobShares({ setup: setup(['dez']), calls: [], tier: 'blown', seed: `s${i}`, recruits: tough })[0].fate).toBe('hurt');
  });
  it('a recruit lost on a call gets no share', () => {
    const s = jobShares({ setup: setup(['dez', 'koji']), calls: [call('dez', { again: true, loss: 'hurt' })], tier: 'blown', seed: 's', recruits: rs });
    expect(s.map((x) => x.rid)).toEqual(['koji']);
  });
  it('a brought fence is fenced too, but not on a GET OUT', () => {
    const f = [{ id: 'moss', spec: 'fence' as const, traits: [], goneUsed: false }];
    expect(jobShares({ setup: setup(['moss']), calls: [], tier: 'messy', seed: 's', recruits: f }).map((s) => s.kind)).toEqual(['messy', 'fenced']);
    expect(jobShares({ setup: setup(['moss']), calls: [], tier: 'messy', seed: 's', recruits: f, getOut: true }).map((s) => s.kind)).toEqual(['messy']);
  });
});

describe('crewLines', () => {
  it('says a FENCE fenced it only when the run says it did', () => {
    const fence = { id: 'moss', name: 'Moss Ade', spec: 'fence' as const, grade: 1 as Grade, toNext: 5, traits: [], goneUsed: false };
    expect(crewLines({ setup: setup(['moss']), calls: [], tier: 'messy', key: 'k', getOut: false, recruits: [fence] })).toEqual(['MOSS · MESSY']);
    expect(crewLines({ setup: setup(['moss'], { fenced: true }), calls: [], tier: 'messy', key: 'k', getOut: true, recruits: [fence] })).toEqual(['MOSS · MESSY', 'MOSS FENCED IT · TAKE +1']);
  });
  const who = (id: string, spec: 'runner' | 'fence' | 'muscle', grade: Grade = 1, toNext = 5) => ({ id, name: `${id[0].toUpperCase()}${id.slice(1)} Vance`, spec, grade, toNext, traits: [], goneUsed: false });
  it('clean runs toward the next grade, a fence, a call loss', () => {
    const lines = crewLines({ setup: setup(['dez', 'moss', 'koji'], { fenced: true }), calls: [call('koji', { beat: 'desk', again: true, loss: 'hurt' })], tier: 'clean', key: 'k', getOut: false, recruits: [who('dez', 'runner', 1, 2), who('moss', 'fence', 3, 0), who('koji', 'muscle')] });
    expect(lines).toEqual([`KOJI · HURT · ${drawHurtDays('k|desk|koji|days', 'med')} DAYS`, 'DEZ · CLEAN RUN · 1 TO PRO', 'MOSS · CLEAN RUN', 'MOSS FENCED IT · TAKE +1']);
    expect(crewLines({ setup: setup(['dez']), calls: [], tier: 'clean', key: 'k', getOut: false, recruits: [who('dez', 'runner', 0, 1)] })).toEqual(['DEZ · CLEAN RUN · NOW HAND']);
  });
  it('messy and blown, as the fold draws them', () => {
    expect(crewLines({ setup: setup(['dez']), calls: [], tier: 'messy', key: 'k', getOut: true, recruits: [who('dez', 'runner')] })).toEqual(['DEZ · MESSY']);
    const s = jobShares({ setup: setup(['dez']), calls: [], tier: 'blown', seed: 'k', recruits: [{ id: 'dez', spec: 'runner', traits: [], goneUsed: false }] })[0];
    const want = s.fate === 'hurt' ? `DEZ · HURT · ${s.hurtDays} DAYS` : s.fate === 'held' ? 'DEZ · HELD' : 'DEZ · GONE';
    expect(crewLines({ setup: setup(['dez']), calls: [], tier: 'blown', key: 'k', getOut: false, recruits: [who('dez', 'runner')] })).toEqual([want]);
  });
});

describe('contact cards', () => {
  it('reads a contact card id', () => {
    expect(contactId('contact:cass')).toBe('cass');
    expect(contactId('dez')).toBeNull();
    expect(contactId('contact:')).toBeNull();
    expect(contactId('favour')).toBeNull();
  });
  it("plays to the contact's trade, as a recruit's call", () => {
    expect(callEffect({ spec: 'runner' }, 'tech', 'open')).toEqual({ lift: true, dice: 0, label: '' });
    expect(callEffect({ spec: 'runner' }, 'body', 'open')).toEqual({ lift: false, dice: 1, label: '' });
    expect(callEffect({ spec: 'fence' }, 'tech', 'open')).toBeNull();
  });
});

describe('abilities on the table (crew abilities spec §2)', () => {
  it('abilityCard reads <rid>/<ability>', () => {
    expect(abilityCard('dez/spoof')).toEqual({ rid: 'dez', ability: 'spoof' });
    expect(abilityCard('dez')).toBeNull();
    expect(abilityCard('contact:cass')).toBeNull();
  });
  it('abilityEffect: the ability pass\'s ON A ROLL effects, each with the recruit\'s grade', () => {
    const on = (kind: 'setup-position' | 'setup-die' | 'greed-effect' | 'greed-die') => abilityEffect({ kind }, 'ears', 'tech', 'open', false, 1);
    expect(on('setup-position')).toMatchObject({ lift: false, dice: -1, after: { better: true }, grade: 1 });
    expect(on('setup-die')).toMatchObject({ lift: false, dice: 0, step: -1, after: { die: true }, grade: 1 });
    expect(on('greed-effect')).toMatchObject({ lift: false, dice: 0, step: 1, alarm: 1, grade: 1 });
    expect(on('greed-die')).toMatchObject({ lift: false, dice: 1, missTake: 1, grade: 1 });
    expect(abilityEffect({ kind: 'die' }, 'face', 'body', 'wire', false, 2)).toMatchObject({ grade: 2 });
    for (const kind of ['gamble-cost', 'gamble-miss', 'trade-alarm', 'trade-nerve', 'end-take', 'end-cool'] as const) expect(abilityEffect({ kind }, 'runner', 'tech', 'open', false, 1)).toBeNull();
  });

  it('abilityNerve: a press costs 1, trade-nerve and the end effects none', () => {
    expect((['setup-position', 'setup-die', 'greed-effect', 'greed-die', 'gamble-cost', 'gamble-miss', 'trade-alarm'] as const).map((kind) => abilityNerve({ kind }))).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect((['trade-nerve', 'end-take', 'end-cool'] as const).map((kind) => abilityNerve({ kind }))).toEqual([0, 0, 0]);
  });

  it('abilityEffect: on a roll only', () => {
    const cross = { kind: 'cross', stat: 'wits' } as const;
    expect(abilityEffect(cross, 'runner', 'wits', 'open', false)).toMatchObject({ lift: true, dice: 0 });
    expect(abilityEffect(cross, 'runner', 'wits', 'dark', false)).toMatchObject({ lift: false, dice: 1 });
    expect(abilityEffect(cross, 'runner', 'tech', 'open', false)).toBeNull();
    expect(abilityEffect({ kind: 'die' }, 'face', 'body', 'wire', false)).toMatchObject({ lift: false, dice: 1 });
    expect(abilityEffect({ kind: 'getaway' }, 'runner', 'reflex', 'wire', false)).toBeNull();
    expect(abilityEffect({ kind: 'getaway' }, 'runner', 'cool', 'wire', true)).toMatchObject({ lift: true, dice: 0 });
    expect(abilityEffect({ kind: 'again' }, 'runner', 'tech', 'open', false)).toMatchObject({ lift: true, dice: 0 });
    for (const kind of ['save', 'alarm', 'nerve', 'take', 'heat'] as const) expect(abilityEffect({ kind }, 'runner', 'tech', 'open', false)).toBeNull();
  });
  const roll = (o: Partial<DiceRoll>): DiceRoll => ({ stat: 'TECH', dice: 2, position: 'wire', faces: [2, 1], keep: 'high', kind: 'miss', pass: false, ...o });
  it('afterEffect: save turns a miss into the 4–5 result for its position', () => {
    expect(afterEffect({ kind: 'save' }, roll({}), { alarm: 2, heat: 1 })).toEqual({ roll: { ...roll({}), faces: [5, 1], kind: 'cost', pass: true, saved: true }, cost: { alarm: 1, heat: 1 }, nerve: 0 });
    expect(afterEffect({ kind: 'save' }, roll({ deck: 'outclassed' }), { alarm: 3, heat: 1 })!.roll.deck).toBeUndefined();
    expect(afterEffect({ kind: 'save' }, roll({ hidden: true }), { alarm: 2, heat: 0 })!.cost).toEqual({ alarm: 1, heat: 0 });
    expect(afterEffect({ kind: 'save' }, roll({ kind: 'cost', pass: true }), { alarm: 1, heat: 1 })).toBeNull();
  });
  it('savedFaces: the kept die turns to a 5', () => {
    expect(savedFaces([3, 1, 3], 'high')).toEqual([5, 1, 3]);
    expect(savedFaces([2, 6], 'low')).toEqual([5, 6]);
    expect(savedFaces([1, 3], 'low')).toEqual([5, 5]);
  });
  it('afterEffect: alarm takes one ALARM, nerve gives one back', () => {
    expect(afterEffect({ kind: 'alarm' }, roll({ kind: 'cost', pass: true }), { alarm: 2, heat: 1 })).toEqual({ roll: roll({ kind: 'cost', pass: true }), cost: { alarm: 1, heat: 1 }, nerve: 0 });
    expect(afterEffect({ kind: 'alarm' }, roll({ kind: 'cost', pass: true }), { alarm: 0, heat: 1 })).toBeNull();
    expect(afterEffect({ kind: 'nerve' }, roll({}), { alarm: 2, heat: 1 })).toEqual({ roll: roll({}), cost: { alarm: 2, heat: 1 }, nerve: 1 });
    expect(afterEffect({ kind: 'die' }, roll({}), { alarm: 2, heat: 1 })).toBeNull();
  });
  it('pressed: the call and each ability count apart', () => {
    const calls = [call('dez', { ability: 'spoof' })];
    expect(pressed(calls, 'dez')).toBe(false);
    expect(pressed(calls, 'dez', 'spoof')).toBe(true);
    expect(pressed([call('dez')], 'dez')).toBe(true);
    expect(pressed([call('dez')], 'dez', 'spoof')).toBe(false);
  });
  it('crewLines names what each recruit pressed, and what played at the end', () => {
    const who = { id: 'dez', name: 'Dez Vance', spec: 'runner' as const, grade: 0 as Grade, toNext: 3, traits: [], goneUsed: false };
    const labels = { 'log-wipe': 'Log Wipe', 'quick-sale': 'Quick Sale' };
    expect(crewLines({ setup: setup(['dez']), calls: [call('dez', { ability: 'log-wipe' }), call('dez', { ability: 'log-wipe', again: true })], tier: 'clean', key: 'k', getOut: false, recruits: [who], abilityLabels: labels })).toEqual(['DEZ · LOG WIPE · CLEAN RUN · 2 TO HAND']);
    expect(crewLines({ setup: setup(['dez'], { ended: ['dez/quick-sale'] }), calls: [], tier: 'messy', key: 'k', getOut: false, recruits: [who], abilityLabels: labels })).toEqual(['DEZ · QUICK SALE · MESSY']);
  });
});

describe('HARD at the start (balancing 2026-11-01)', () => {
  it('TAKE 1 on tier 2 and up, none on tier 1', () => {
    expect([1, 2, 3, 4].map((t) => hardStartTake(t as 1 | 2 | 3 | 4))).toEqual([0, 1, 1, 1]);
  });
});

describe('abilities on NERVE (effect and NERVE spec §2)', () => {
  it('abilityNerve: 1 a press, nerve +1 and AT THE END abilities free', () => {
    expect(ABILITY_NERVE).toBe(1);
    const kinds = ['die', 'getaway', 'again', 'save', 'alarm', 'nerve', 'take', 'heat'] as const;
    expect(kinds.map((kind) => abilityNerve({ kind }))).toEqual([1, 1, 1, 1, 1, 0, 0, 0]);
    expect(abilityNerve({ kind: 'cross', stat: 'cool' })).toBe(1);
  });
});

describe('growth in the debrief (rewards, 2026-11-03)', () => {
  const hand = { id: 'dez', name: 'Dez Vance', spec: 'runner' as const, grade: 1 as const, traits: [], goneUsed: false };
  const lines = (toNext: number, tier?: number) => crewLines({ setup: { approach: 'quiet', people: ['dez'], favour: false, at: 0, ...(tier ? { tier } : {}) }, calls: [], tier: 'clean', key: 'k', getOut: false, recruits: [{ ...hand, toNext }] });
  it('a job below the recruit counts half, shown rounded up', () => expect(lines(5, 1)).toEqual(['DEZ · CLEAN RUN · 5 TO PRO']));
  it('the last half run reads NOW', () => expect(lines(0.5, 1)).toEqual(['DEZ · CLEAN RUN · NOW PRO']));
  it('a job at their level counts full', () => expect(lines(5, 2)).toEqual(['DEZ · CLEAN RUN · 4 TO PRO']));
});

describe('PRO and VET ON A ROLL effects (tier 3 beat play spec §2)', () => {
  const on = (job: Parameters<typeof abilityEffect>[0], stat = 'tech', red = false) => abilityEffect(job, 'runner', stat, 'open', false, 2, red);
  it('carry their grade', () => {
    expect(on({ kind: 'lookout' })).toMatchObject({ step: 1, after: { small: true }, grade: 2 });
    expect(on({ kind: 'talk-past' })).toMatchObject({ stat: 'cool', missAlarm: 1, grade: 2 });
    expect(on({ kind: 'inside-info' })).toMatchObject({ after: { noCut: true }, grade: 2 });
    expect(on({ kind: 'stand-firm' })).toMatchObject({ firm: true, grade: 2 });
  });
  it('talk-past has nothing to do on COOL', () => expect(on({ kind: 'talk-past' }, 'cool')).toBeNull());
  it('refused on red', () => {
    for (const kind of ['lookout', 'talk-past', 'inside-info', 'stand-firm'] as const) expect(on({ kind }, 'tech', true)).toBeNull();
  });
  it('hold-alarm costs no NERVE', () => expect(abilityNerve({ kind: 'hold-alarm' })).toBe(0));
});
