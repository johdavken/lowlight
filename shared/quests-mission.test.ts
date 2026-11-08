import { describe, expect, it } from 'vitest';
import { MISSION, TRAIL, WAITS } from './quests.fixture';
import { fillRecruit, holds, parseCondition, parseQuestFile, parseRun, questGuest, type CondCtx, type Condition, type QuestEntry } from './quests';
import type { Deck } from './gear';
import { DEFAULT_STATS } from './stats';

const roster = new Set(['nix-direct', 'hicks', 'cass', 'ember']);
const places = new Set(['lowlight-intake', 'haes-noodles']);
const decks = new Set(['stall-build', 'deaf-meridian', 'pocket-deck']);
const known = { roster, places, decks };
const parse = (text: string) => parseQuestFile('night-shift', text, known);
const ok = (text: string): QuestEntry => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const messages = (text: string): string[] => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const conds = (s: string): Condition[] => {
  const c = parseCondition(s);
  if (!Array.isArray(c)) throw new Error(c.message);
  return c;
};
const POCKET: Deck = { id: 'pocket-deck', name: 'Pocket deck', quality: 1, heat: 0, traits: ['hidden'] };
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks', heat: 0, deck: null, stats: DEFAULT_STATS, ...o });

describe('mission files', () => {
  it('MISSION parses', () => {
    const q = ok(MISSION);
    expect(q.kind).toBe('mission');
    expect(q.pay).toBe(400);
    const [roof, ride, walk] = q.beats.get('door')![0].choices;
    expect(roof).toMatchObject({ id: 'roof', to: 'inside', fail: 'spotted', check: { stat: 'tech', base: 45, grid: true, crew: [{ contact: 'ember', bonus: 15 }], red: false, mods: [] } });
    expect(ride).toMatchObject({ to: 'inside', fail: null, check: null });
    expect(ride.tags).toEqual([{ kind: 'needs', all: [{ kind: 'with', contact: 'ember' }] }]);
    expect(walk.check).toEqual({ stat: 'cool', base: 50, grid: false, crew: [{ contact: 'hicks', bonus: 10 }], red: false, mods: [] });
  });

  it('effect lines', () => {
    const q = ok(MISSION);
    expect(q.outcomes.get('spotted')!.effects).toEqual({ heat: 2 });
    expect(q.outcomes.get('paid')!.effects).toEqual({ pay: 400, deck: 'deaf-meridian' });
    expect(q.outcomes.get('burned')!.effects).toEqual({ deck: null, heat: 1 });
    expect(q.outcomes.get('paid')!.text).toBe('*Clean.*');
    expect(ok(MISSION.replace('heat: +2', 'heat: -1')).outcomes.get('spotted')!.effects).toEqual({ heat: -1 });
  });

  it('views are optional in missions', () => {
    expect(messages(MISSION)).toEqual([]);
  });

  it('quest files are unchanged', () => {
    for (const text of [TRAIL, WAITS]) {
      const r = parseQuestFile('paper-trail', text, { roster, places });
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      expect(r.entry.kind).toBe('quest');
      expect(r.entry.pay).toBeNull();
      for (const c of [...r.entry.beats.values()].flat().flatMap((b) => b.choices)) expect(c).toMatchObject({ fail: null, check: null });
      for (const o of r.entry.outcomes.values()) expect(o.effects).toEqual({});
    }
  });

  it('problems', () => {
    const one = (text: string, want: RegExp, n = 1) => expect(messages(text).filter((m) => want.test(m)), String(want)).toHaveLength(n);
    one(MISSION.replace('kind: mission\n', ''), /check goes only in a mission/, 3);
    one(MISSION.replace('check tech 45 grid', 'check luck 45 grid'), /luck/);
    one(MISSION.replace('check tech 45 grid', 'check tech 0 grid'), /1–99/);
    one(MISSION.replace('check tech 45 grid', 'check tech 100 grid'), /1–99/);
    one(MISSION.replace('→ inside / spotted', '→ inside / nowhere'), /nowhere/);
    one(MISSION.replace('- copy: Copy it and walk. → kept', '- copy: Copy it and walk. → kept / paid'), /fail.*check|check.*fail/);
    one(MISSION.replace('→ paid / burned [check tech 50 grid]', '→ paid [check tech 50 grid]'), /fail/);
    one(MISSION.replace('gives: deck deaf-meridian', 'gives: deck golden-deck'), /golden-deck/);
    one(MISSION.replace('pay: 400\n---', 'pay: lots\n---'), /pay/);
    one(MISSION.replace('kind: mission\n', '').replace(/ \/ \S+ \[check[^\]]*\]/g, ''), /go only in a mission/, 3);
    // A mis-written effect line is a problem, never story text.
    one(MISSION.replace('pay: 400\ngives', 'pay: 400\n\ngives'), /effect line/);
    one(MISSION.replace('heat: +2', 'heat: 2'), /effect line/);
  });
});

describe('mission conditions', () => {
  it('parse', () => {
    expect(conds('heat>=7')).toEqual([{ kind: 'heat', op: '>=', value: 7 }]);
    expect(conds('heat≤2')).toEqual([{ kind: 'heat', op: '<=', value: 2 }]);
    expect(conds('deck')).toEqual([{ kind: 'deck', id: null, trait: null }]);
    expect(conds('deck=pocket-deck')).toEqual([{ kind: 'deck', id: 'pocket-deck', trait: null }]);
    expect(conds('deck:hidden')).toEqual([{ kind: 'deck', id: null, trait: 'hidden' }]);
    expect(conds('tech>=6')).toEqual([{ kind: 'stat', stat: 'tech', op: '>=', value: 6 }]);
  });
  it('hold', () => {
    expect(holds(conds('heat>=7'), ctx({ heat: 7 }))).toBe(true);
    expect(holds(conds('heat>=7'), ctx({ heat: 6 }))).toBe(false);
    expect(holds(conds('deck'), ctx())).toBe(false);
    expect(holds(conds('deck'), ctx({ deck: POCKET }))).toBe(true);
    expect(holds(conds('deck=pocket-deck'), ctx({ deck: POCKET }))).toBe(true);
    expect(holds(conds('deck:hidden'), ctx({ deck: POCKET }))).toBe(true);
    expect(holds(conds('deck:ghost'), ctx({ deck: POCKET }))).toBe(false);
    expect(holds(conds('tech>=6'), ctx({ stats: { ...DEFAULT_STATS, tech: 7 } }))).toBe(true);
    expect(holds(conds('tech>=6'), ctx())).toBe(false);
  });
  it('a context without kit fields reads as heat 0, no deck, 3s', () => {
    const bare: CondCtx = { flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks' };
    expect(holds(conds('heat<=0'), bare)).toBe(true);
    expect(holds(conds('deck'), bare)).toBe(false);
    expect(holds(conds('tech=3'), bare)).toBe(true);
  });
});

describe('a quest picture (art:)', () => {
  it('reads a picture file name; none is null', () => {
    expect(ok(MISSION.replace('pay: 400\n---', 'pay: 400\nart: night-shift.png\n---')).art).toBe('night-shift.png');
    expect(ok(MISSION).art).toBeNull();
  });
  it('a name with a path or another kind of file is a problem', () => {
    for (const bad of ['../x.png', 'art/x.png', 'x.gif', 'X Y.png']) expect(messages(MISSION.replace('pay: 400\n---', `pay: 400\nart: ${bad}\n---`)).join(' '), bad).toMatch(/art/);
  });
});

describe('crew phase 2 lines (crew spec §5)', () => {
  const withEffect = (line: string) => MISSION.replace('*Clean.*\npay: 400\n', `*Clean.*\npay: 400\n${line}\n`);
  const SPRING = MISSION.replace('starts: haes-noodles\n', 'spring: true\n').replace('*The office is two floors up', '*Get {recruit} out. The office is two floors up');
  it('reads gives: recruit muscle hand', () => expect(ok(withEffect('gives: recruit muscle hand')).outcomes.get('paid')!.effects.recruit).toEqual({ spec: 'muscle', grade: 1 }));
  it('reads a hire the text calls he or she', () => expect(ok(withEffect('gives: recruit muscle green man')).outcomes.get('paid')!.effects.recruit).toEqual({ spec: 'muscle', grade: 0, sex: 'man' }));
  it('reads hire-pitch: on either side of gives:', () => {
    const want = { spec: 'muscle', grade: 1, pitch: 'I lift.' };
    expect(ok(withEffect('gives: recruit muscle hand\nhire-pitch: I lift.')).outcomes.get('paid')!.effects.recruit).toEqual(want);
    expect(ok(withEffect('hire-pitch: I lift.\ngives: recruit muscle hand')).outcomes.get('paid')!.effects.recruit).toEqual(want);
  });
  it('hire-pitch: needs gives: recruit, and a short line', () => {
    expect(messages(withEffect('hire-pitch: I lift.')).some((m) => m.includes('hire-pitch: goes with gives: recruit'))).toBe(true);
    expect(messages(withEffect(`gives: recruit muscle hand\nhire-pitch: ${'x'.repeat(121)}`)).some((m) => m.includes('at most 120'))).toBe(true);
  });
  it('{hire} needs gives: recruit on the same ending', () => {
    expect(messages(MISSION.replace('*Clean.*\npay: 400\n', '*{hire} waits.*\npay: 400\n')).some((m) => m.includes('{hire} needs gives: recruit'))).toBe(true);
    ok(withEffect('gives: recruit muscle hand').replace('*Clean.*', '*{hire} waits.*'));
  });
  it('reads the grade in any case', () => expect(ok(withEffect('gives: recruit runner VET')).outcomes.get('paid')!.effects.recruit).toEqual({ spec: 'runner', grade: 3 }));
  it('rejects an unknown specialty or grade', () => {
    expect(messages(withEffect('gives: recruit chef boss')).some((m) => m.includes("can't read the effect line 'gives: recruit chef boss'"))).toBe(true);
    expect(messages(withEffect('gives: recruit wheel green')).some((m) => m.includes("can't read the effect line"))).toBe(true);
  });
  it('gives: recruit only in a mission', () => {
    expect(messages(withEffect('gives: recruit muscle hand').replace('kind: mission\n', '')).some((m) => m.includes('go only in a mission'))).toBe(true);
  });
  it('the effect-line hint names gives: recruit', () => expect(messages(withEffect('gives: recruit')).some((m) => m.includes('gives: recruit <specialty> <grade>'))).toBe(true));
  it('a spring file parses without starts', () => expect(ok(SPRING)).toMatchObject({ spring: true, starts: '', kind: 'mission' }));
  it('a plain mission without starts is still an error', () => expect(messages(MISSION.replace('starts: haes-noodles\n', '')).some((m) => m.startsWith('starts:'))).toBe(true));
  it('a spring file is a mission', () => expect(messages(SPRING.replace('kind: mission\n', '')).some((m) => m.includes('spring: true goes only in a job (kind: mission)'))).toBe(true));
  it('a spring file has no starts', () => expect(messages(SPRING.replace('spring: true\n', 'spring: true\nstarts: haes-noodles\n')).some((m) => m.includes("a spring file has no starts: (it posts where the recruit was hired)"))).toBe(true));
  it('{recruit} outside a spring file is a problem', () => {
    expect(messages(MISSION.replace('*The office is two floors up', '*{recruit} waits. The office is two floors up'))).toContain('file: {recruit} goes only in a spring file (spring: true)');
  });
  it('fillRecruit fills and leaves alone', () => {
    expect(fillRecruit('Get {recruit} out.', 'Juno')).toBe('Get Juno out.');
    expect(fillRecruit('Get {recruit} out.', null)).toBe('Get {recruit} out.');
  });
});

describe('a stored run from before RUNNER (crew cleanup spec §4)', () => {
  it('reads a contact of wire as a runner', () => {
    const contact = { id: 'hicks', name: 'Hicks', accent: '#7fe9ff', portrait: null, spec: 'wire' };
    const run = { beat: 'a', picks: [], flags: {}, done: false, at: 1, setup: { approach: 'quiet', people: [], favour: false, at: 1, contacts: [contact] } };
    expect(parseRun(JSON.stringify(run))?.setup?.contacts?.[0].spec).toBe('runner');
  });
});

describe('drops: (crew goods spec §6)', () => {
  const file = (line: string) => MISSION.replace(/^title:/m, `${line}\ntitle:`);
  it('reads a kind of goods', () => expect(ok(file('drops: data')).drops).toBe('data'));
  it('refuses an unknown kind', () => expect(messages(file('drops: gold')).join()).toContain('drops'));
});

describe('a guest on a mission (The Passenger spec, engine §1)', () => {
  const WITH = MISSION.replace('pay: 400\n---', 'pay: 400\nguest: noa GREEN\n---');
  it('a mission can have a guest, with no lead', () => {
    const q = ok(WITH);
    expect(q.guest).toEqual({ id: 'noa', grade: 0 });
    expect(questGuest(q)).toEqual({ id: 'noa', grade: 0 });
  });
  it('a quest that is no job still has no guest', () => {
    expect(messages(TRAIL.replace('\n---\n', '\nguest: noa GREEN\n---\n'))).toContain('guest: only a contract or a mission has a guest');
  });
  it('guest-note: stays a contract line', () => {
    expect(messages(WITH.replace('*Clean.*\npay: 400', '*Clean.*\nguest-note: I was there.\npay: 400'))).toContain('paid: guest-note: needs a guest: on the contract');
  });
  it('a bad guest line on a mission is a problem', () => {
    expect(messages(MISSION.replace('pay: 400\n---', 'pay: 400\nguest: noa\n---'))).toContain('guest: guest: is a contact and a grade, like ember VET');
  });
});

describe('a mission guest must be someone (The Passenger spec, engine §2)', () => {
  const WITH = MISSION.replace('pay: 400\n---', 'pay: 400\nguest: noa GREEN\n---');
  it('a mission guest must be a contact or a guest file', () => {
    const r = parseQuestFile('night-shift', WITH, { ...known, guests: new Set<string>() });
    expect(r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`)).toContain("guest: no character or guest 'noa'");
    expect(parseQuestFile('night-shift', WITH, { ...known, guests: new Set(['noa']) }).ok).toBe(true);
  });
  it("a contact's id is enough", () => {
    expect(parseQuestFile('night-shift', WITH.replace('guest: noa', 'guest: ember'), { ...known, guests: new Set<string>() }).ok).toBe(true);
  });
});

