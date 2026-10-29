import { describe, expect, it } from 'vitest';
import { MISSION, TRAIL, WAITS } from './quests.fixture';
import { holds, parseCondition, parseQuestFile, type CondCtx, type Condition, type QuestEntry } from './quests';
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
const POCKET: Deck = { id: 'pocket-deck', name: 'Pocket deck', bonus: 5, heat: 0, traits: ['hidden'] };
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
