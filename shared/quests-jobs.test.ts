import { describe, expect, it } from 'vitest';
import { JOB, MISSION, TRAIL } from './quests.fixture';
import { parseQuestFile, stepMinutes, tagText, type QuestEntry } from './quests';

const known = { roster: new Set(['nix-direct', 'hicks', 'cass', 'ember']), places: new Set(['haes-noodles']), decks: new Set(['stall-build', 'deaf-meridian']) };
const parse = (text: string) => parseQuestFile('back-door', text, known);
const ok = (text: string): QuestEntry => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const messages = (text: string) => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
};
const one = (text: string, want: RegExp) => expect(messages(text).filter((m) => want.test(m)), String(want)).toHaveLength(1);

describe('job front matter', () => {
  it('JOB parses', () => {
    const q = ok(JOB);
    expect(q.tier).toBe(2);
    expect(q.payRange).toEqual([350, 450]);
    expect(q.minutes).toBe(30);
    expect(q.draws).toEqual([
      { name: 'complication', values: ['none', 'buyer-brought-a-friend', 'caper-watching'] },
      { name: 'door', values: ['easy', 'hard'] },
    ]);
    expect(q.beats.get('door')!.at(-1)!.stranger).toMatchObject({ name: 'The doorman', temper: 'door' });
  });

  it('defaults: tier 1, step minutes by tier, a plain pay is a range of one', () => {
    const q = ok(MISSION);
    expect(q.tier).toBe(1);
    expect(q.payRange).toEqual([400, 400]);
    expect(q.minutes).toBeNull();
    expect(q.draws).toEqual([]);
    expect([1, 2, 3, 4].map((tier) => stepMinutes({ ...q, tier: tier as 1 | 2 | 3 | 4 }))).toEqual([20, 30, 45, 60]);
    expect(stepMinutes(ok(JOB))).toBe(30);
  });

  it('outcome lines: take, blown, pay full and half', () => {
    const q = ok(JOB);
    expect(q.outcomes.get('turned')!.effects).toEqual({ take: 'none', blown: true });
    expect(q.outcomes.get('paid')!.effects).toEqual({ payKind: 'full', take: 'full' });
    expect(q.outcomes.get('part')!.effects).toEqual({ payKind: 'half', take: 'part' });
    expect(q.outcomes.get('turned')!.text).toBe('*He turns you round.*');
  });

  it('take: outside a mission is a problem', () => {
    const r = parseQuestFile('paper-trail', TRAIL.replace('*He thanks you like he means it.*\n→ return', '*He thanks you like he means it.*\ntake: part\n→ return'), { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((x) => x.message).filter((m) => /go only in a mission/.test(m))).toHaveLength(1);
  });

  it('problems', () => {
    one(JOB.replace('tier: 2', 'tier: 5'), /tier/);
    one(JOB.replace('pay: 350-450', 'pay: 500-400'), /pay/);
    one(JOB.replace('draw door: easy | hard', 'draw door: easy'), /draw door/);
    one(JOB.replace('stranger: The doorman — bored, big, watching the street\n', ''), /temper/);
    one(JOB.replace('temper: door', 'temper: mood'), /mood/);
  });
});

import { beatText, holds, parseCondition, questBlock, questRowText, type CondCtx } from './quests';
import { DEFAULT_STATS } from './stats';

const tagJob = (choice: string, extra = '') =>
  JOB.replace('- talk: Talk your way in. → inside / turned [check cool 50]\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside', `${choice}\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside`).replace('*A steel door behind the stall. One man on it.*', `*A steel door behind the stall. One man on it.*\n${extra}`);
const firstChoice = (text: string) => ok(text).beats.get('door')!.at(-1)!.choices[0];
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks', stats: DEFAULT_STATS, ...o });

describe('choice tags', () => {
  it('red, prep modifiers beside crew bonuses', () => {
    expect(firstChoice(tagJob('- talk: Talk. → inside / turned [check tech 50 grid red]')).check).toMatchObject({ stat: 'tech', base: 50, grid: true, red: true, mods: [], crew: [] });
    const c = firstChoice(tagJob('- talk: Talk. → inside / turned [check cool 50 · if cased +15 "you cased the door" · hicks +10, set cased=yes]'));
    expect(c.check).toMatchObject({ red: false, crew: [{ contact: 'hicks', bonus: 10 }], mods: [{ when: [{ kind: 'set', name: 'cased' }], delta: 15, label: 'you cased the door' }] });
    expect(firstChoice(tagJob('- talk: Talk. → inside / turned [check cool 50 · if door=hard -10 "a hard mark"]')).check!.mods[0].delta).toBe(-10);
  });
  it('alarm +1', () => {
    expect(firstChoice(tagJob('- talk: Kick it in. → inside [alarm +1]')).tags).toEqual([{ kind: 'alarm', delta: 1 }]);
  });
  it('crack', () => {
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 6]')).crack).toEqual({ kind: 'crack', length: 6, mods: [] });
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 7 · if cased +1 "cased"]')).crack!.mods).toEqual([{ when: [{ kind: 'set', name: 'cased' }], delta: 1, label: 'cased' }]);
  });
  it('crack … ice: a corporate terminal; tagText prints it back', () => {
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 6 ice]')).crack).toEqual({ kind: 'crack', length: 6, mods: [], ice: true });
    expect(firstChoice(tagJob('- talk: Crack. → inside / turned [crack 7 ice · if cased +1 "cased"]')).crack).toMatchObject({ ice: true, mods: [{ delta: 1, label: 'cased' }] });
    for (const src of ['crack 6', 'crack 6 ice', 'crack 7 ice · if cased +1 "cased"']) {
      expect(tagText(firstChoice(tagJob(`- talk: Crack. → inside / turned [${src}]`)).crack!)).toBe(src);
    }
  });
  it('problems', () => {
    one(tagJob('- talk: Crack. → inside / turned [crack 4]'), /crack/);
    one(tagJob('- talk: Crack. → inside / turned [crack 10]'), /crack/);
    one(tagJob('- talk: Crack. → inside [crack 6]'), /fail/);
    one(tagJob('- talk: Crack. → inside / turned [crack 6, check tech 50]'), /crack/);
    const plain = (tag: string) => {
      const r = parseQuestFile('paper-trail', TRAIL.replace('- hand: Hand it over. → given [set ledger=given]', `- hand: Hand it over. → given / given [${tag}]`), { roster: null, places: null });
      return r.ok ? [] : r.problems.map((x) => x.message);
    };
    expect(plain('crack 6').some((m) => /mission/.test(m))).toBe(true);
    expect(plain('check tech 50 red').some((m) => /mission/.test(m))).toBe(true);
  });
  it('two red checks is a warning, not a problem', () => {
    const text = JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [check reflex 50 red]').replace('- talk: Talk your way in. → inside / turned [check cool 50]\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside', '- talk: Talk your way in. → inside / turned [check cool 50 red]\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside');
    const r = parse(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => /red/.test(w))).toBe(true);
    const r1 = parse(JOB);
    if (r1.ok) expect(r1.warnings).toEqual([]);
  });
  it('a red check in each version of one beat counts once (only one version plays)', () => {
    const r = parse(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'));
    expect(r.ok && r.warnings).toEqual([]);
  });
});

describe('alarm conditions', () => {
  it('parse and hold', () => {
    const c = parseCondition('alarm>=2');
    expect(c).toEqual([{ kind: 'alarm', op: '>=', value: 2 }]);
    expect(holds(c as never, ctx({ alarm: 2 }))).toBe(true);
    expect(holds(c as never, ctx({ alarm: 1 }))).toBe(false);
    expect(holds(parseCondition('alarm=0') as never, ctx())).toBe(true);
  });
});

describe('passive lines', () => {
  const extra = '[wits 6] The doorman keeps glancing at his phone.\n[deck:hidden] Your pocket deck could ride in under his nose.\n[complication=caper-watching] Someone across the street is watching.';
  const beat = () => ok(tagJob('- talk: Talk your way in. → inside / turned [check cool 50]', extra)).beats.get('door')!.at(-1)!;
  it('show only when their condition holds, with a label, in file order', () => {
    expect(beatText(beat(), ctx({ stats: { ...DEFAULT_STATS, wits: 6 } }))).toBe('*A steel door behind the stall. One man on it.*\n⟦WITS⟧ The doorman keeps glancing at his phone.');
    expect(beatText(beat(), ctx({ stats: { ...DEFAULT_STATS, wits: 5 } }))).toBe('*A steel door behind the stall. One man on it.*');
    expect(beatText(beat(), ctx({ deck: { id: 'pocket-deck', name: 'Pocket deck', bonus: 5, heat: 0, traits: ['hidden'] } }))).toContain('⟦DECK⟧ Your pocket deck');
    expect(beatText(beat(), ctx({ flags: { complication: 'caper-watching' } }))).toContain('\nSomeone across the street is watching.');
  });
  it('the plain text leaves them out', () => {
    expect(beat().text).toBe('*A steel door behind the stall. One man on it.*');
  });
  it('her history reads the marker as (LABEL)', () => {
    expect(questRowText({ title: 'Back Door', text: '⟦WITS⟧ x' }, (s) => s)).toContain('(WITS) x');
  });
});

describe('job lines are not quest lines', () => {
  it('a row from a job run reads as a [job] line; a quest row stays a [quest] line', () => {
    expect(questRowText({ title: 'Last Ferry', text: 'Rain.', run: 'last-ferry@0' }, (s) => s)).toBe('[job — Last Ferry: Rain.]');
    expect(questRowText({ title: 'Paper Trail', text: 'Rain.' }, (s) => s)).toBe('[quest — Paper Trail: Rain.]');
  });
  it("a job's beat block is a [job] block that keeps the job to itself", () => {
    const q = ok(JOB);
    const b = questBlock(q, q.beats.get('door')!.at(-1)!, ctx(), (s) => s, true);
    expect(b.startsWith('[job — ')).toBe(true);
    expect(b).toContain('the [job — ');
    expect(b).not.toContain('[quest');
  });
});

describe('time tokens', () => {
  it('{time} and {time +40m} / {time +2h} read the story clock as HH:MM, past midnight too', async () => {
    const { fillTimes } = await import('./quests');
    expect(fillTimes('Due at {time +40m}. Now {time}.', 1200)).toBe('Due at 20:40. Now 20:00.');
    expect(fillTimes('By {time +2h}.', 1440 + 23 * 60)).toBe('By 01:00.');
    expect(fillTimes('No tokens.', 1200)).toBe('No tokens.');
  });
});
