import { describe, expect, it } from 'vitest';
import { JOB, MISSION, TRAIL } from './quests.fixture';
import { effectTagOf, parseQuestFile, QUEST_DRAFT_RULES, stepMinutes, tagText, type QuestEntry } from './quests';
import { jobTakeSize } from './dice';

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

  it('take-size: a job sets its own TAKE clock (2–8); else the tier decides', () => {
    expect(ok(JOB.replace('tier: 2', 'tier: 2\ntake-size: 5')).takeSize).toBe(5);
    expect(ok(JOB).takeSize).toBeUndefined();
    expect(jobTakeSize(ok(JOB.replace('tier: 2', 'tier: 1\ntake-size: 4')))).toBe(4);
    expect(jobTakeSize(ok(JOB.replace('tier: 2', 'tier: 1')))).toBe(3);
    const bad = (text: string) => { const r = parseQuestFile('x', text, { roster: null, places: null }); return r.ok ? [] : r.problems.map((p) => p.field); };
    expect(bad(JOB.replace('tier: 2', 'tier: 2\ntake-size: 9'))).toContain('take-size');
    expect(bad(TRAIL.replace(/^---\n/, '---\ntake-size: 4\n'))).toContain('take-size');
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

import { beatText, beatViews, heardAt, holds, isLegacyRoll, isOldRun, parseCondition, parseRun, questBlock, questRowText, type CondCtx } from './quests';
import { DEFAULT_STATS } from './stats';

describe('the run on the table (spec 2026-10-29)', () => {
  const base = { beat: 'door', variant: 0, wait: null, flags: {}, done: false, at: 1 };
  const legacy = { stat: 'COOL', chance: 74, rolls: [80], pass: false };
  const dice = { stat: 'COOL', dice: 3, position: 'open', faces: [5, 2, 1], keep: 'high', kind: 'cost', pass: true };
  it('parseRun keeps a legacy pending (chance/rolls) and a legacy roll in picks', () => {
    const run = parseRun(JSON.stringify({ ...base, picks: [{ beat: 'door', choice: 'talk', roll: legacy }], pending: { beat: 'door', choice: 'talk', stat: 'COOL', chance: 74, rolls: [80] } }));
    expect(run!.picks[0].roll).toEqual(legacy);
    expect(run!.pending).toEqual({ beat: 'door', choice: 'talk', stat: 'COOL', chance: 74, rolls: [80] });
  });
  it('parseRun keeps a dice roll and a dice pending', () => {
    const run = parseRun(JSON.stringify({ ...base, picks: [{ beat: 'door', choice: 'talk', roll: { ...dice, pushed: true, steadied: true } }], pending: { beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 1, heat: 0 } } }));
    expect(run!.picks[0].roll).toEqual({ ...dice, pushed: true, steadied: true });
    expect(run!.pending).toEqual({ beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 1, heat: 0 } });
  });
  it('parseRun keeps the abilities fields (crew abilities spec §5), and runs without them', () => {
    const setup = { approach: 'quiet', people: ['dez'], favour: false, at: 5, abilities: { dez: ['spoof'] }, ended: ['dez/quick-sale'] };
    const call = { beat: 'door', choice: 'talk', card: 'dez', ability: 'spoof', again: false, at: 6 };
    const run = parseRun(JSON.stringify({ ...base, picks: [{ beat: 'door', choice: 'talk', roll: { ...dice, saved: true } }], setup, calls: [call], pending: { beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 1, heat: 0 }, after: [call] } }));
    expect(run!.setup).toEqual(setup);
    expect(run!.calls).toEqual([call]);
    expect(run!.picks[0].roll).toEqual({ ...dice, saved: true });
    expect(run!.pending).toEqual({ beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 1, heat: 0 }, after: [call] });
    expect(parseRun(JSON.stringify({ ...base, picks: [], setup: { approach: 'quiet', people: [], favour: false, at: 5 } }))!.setup).toEqual({ approach: 'quiet', people: [], favour: false, at: 5 });
  });
  it('parseRun accepts alarm 4, takeFill, getaway and payCeiling', () => {
    const run = parseRun(JSON.stringify({ ...base, picks: [], alarm: 4, takeFill: 3, getaway: true, payCeiling: 400 }));
    expect(run).toMatchObject({ alarm: 4, takeFill: 3, getaway: true, payCeiling: 400 });
  });
  it('parseRun keeps a dealt pending, the run\'s next and armourUsed, and a roll\'s settled costs (roll lifecycle spec §1)', () => {
    const pending = { beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 0, heat: 0 }, dealt: [{ cost: 'alarm', line: 'A log fills.', by: 'written' }, { cost: 'worse', line: 'A man waits.', by: 'gm' }], pick: 1, settled: [{ cost: 'alarm', how: 'resisted', faces: [5, 2], nerve: 1 }] };
    const roll = { ...dice, costs: [{ cost: 'alarm', how: 'taken', line: 'A log fills.' }] };
    const run = parseRun(JSON.stringify({ ...base, picks: [{ beat: 'door', choice: 'talk', roll }], pending, next: { worse: true }, armourUsed: true }));
    expect(run).toMatchObject({ pending, next: { worse: true }, armourUsed: true });
    expect(run!.picks[0].roll).toMatchObject({ costs: roll.costs });
    // A pending from before has no deal.
    expect(parseRun(JSON.stringify({ ...base, picks: [], pending: { beat: 'door', choice: 'talk', roll: dice, cost: { alarm: 1, heat: 0 } } }))!.pending).not.toHaveProperty('dealt');
  });
  it('isLegacyRoll tells the two shapes apart', () => {
    expect(isLegacyRoll(legacy)).toBe(true);
    expect(isLegacyRoll(dice as never)).toBe(false);
  });
});

const tagJob = (choice: string, extra = '') =>
  JOB.replace('- talk: Talk your way in. → inside / turned [check cool 50]\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside', `${choice}\n- wait: Wait for the shift change. → inside [clock +1h]\n\n## inside`).replace('*A steel door behind the stall. One man on it.*', `*A steel door behind the stall. One man on it.*\n${extra}`);
const firstChoice = (text: string) => ok(text).beats.get('door')!.at(-1)!.choices[0];
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks', stats: DEFAULT_STATS, ...o });

describe('programs on the run (programs spec §3)', () => {
  const base = { beat: 'door', variant: 0, wait: null, flags: {}, done: false, at: 1, picks: [] };
  const dice = { stat: 'TECH', dice: 3, position: 'open', faces: [6, 2, 1], keep: 'high', kind: 'clean', pass: true };
  const setup = { approach: 'quiet', people: [], favour: false, at: 1, deck: { id: 'meridian', quality: 3, slots: 2 } };
  it('a run with programs round-trips', () => {
    const run = parseRun(JSON.stringify({ ...base, setup, programs: [{ id: 'solvent', at: 5 }, { id: 'firewall', at: 9, burned: true }], deckDead: true }));
    expect(run!.setup!.deck).toEqual({ id: 'meridian', quality: 3, slots: 2 });
    expect(run!.programs).toEqual([{ id: 'solvent', at: 5 }, { id: 'firewall', at: 9, burned: true }]);
    expect(run!.deckDead).toBe(true);
  });
  it('a bad programs entry drops only programs', () => {
    const run = parseRun(JSON.stringify({ ...base, setup, programs: [{ id: 3 }] }));
    expect(run).not.toBeNull();
    expect(run!.programs).toBeUndefined();
    expect(run!.setup!.deck!.slots).toBe(2);
  });
  it('a roll keeps the programs it ran', () => {
    const run = parseRun(JSON.stringify({ ...base, picks: [{ beat: 'door', choice: 'hack', roll: { ...dice, programs: ['solvent', 'leech'] } }] }));
    expect((run!.picks[0].roll as { programs?: string[] }).programs).toEqual(['solvent', 'leech']);
  });
  it('isOldRun is true for a setup without deck and false with one', () => {
    expect(isOldRun(parseRun(JSON.stringify({ ...base, setup: { ...setup, deck: undefined } }))!)).toBe(true);
    expect(isOldRun(parseRun(JSON.stringify({ ...base, setup }))!)).toBe(false);
    expect(isOldRun(parseRun(JSON.stringify(base))!)).toBe(false);
  });
});

describe('loot: (roll lifecycle spec, writers)', () => {
  it('a job may say what its take is; past 80 characters warns', () => {
    expect(ok(JOB.replace('tier: 2', "tier: 2\nloot: the cash in the stall's till")).loot).toBe("the cash in the stall's till");
    const r = parse(JOB.replace('tier: 2', `tier: 2\nloot: ${'x'.repeat(81)}`));
    expect(r.ok && r.warnings).toContain('loot: at most 80 characters (this is 81)');
  });
});

describe('choice tags', () => {
  it('red, prep modifiers beside crew bonuses', () => {
    expect(firstChoice(tagJob('- talk: Talk. → inside / turned [check tech 50 grid red]')).check).toMatchObject({ stat: 'tech', base: 50, grid: true, red: true, mods: [], crew: [] });
    const c = firstChoice(tagJob('- talk: Talk. → inside / turned [check cool 50 · if cased +15 "you cased the door" · hicks +10, set cased=yes]'));
    expect(c.check).toMatchObject({ red: false, crew: [{ contact: 'hicks', bonus: 10 }], mods: [{ when: [{ kind: 'set', name: 'cased' }], delta: 15, label: 'you cased the door' }] });
    expect(firstChoice(tagJob('- talk: Talk. → inside / turned [check cool 50 · if door=hard -10 "a hard mark"]')).check!.mods[0].delta).toBe(-10);
  });
  it('[big] and [small] (effect and NERVE spec §4); tagText prints them back', () => {
    const big = firstChoice(tagJob('- talk: Kick it in. → inside / turned [check body 50, big]'));
    expect(big.tags).toEqual([{ kind: 'effect', effect: 'big' }]);
    expect(firstChoice(tagJob('- talk: Ease it open. → inside / turned [check tech 50, small]')).tags).toEqual([{ kind: 'effect', effect: 'small' }]);
    expect(tagText(big.tags[0])).toBe('big');
    expect(effectTagOf(big)).toBe('big');
    expect(effectTagOf(firstChoice(tagJob('- talk: Talk. → inside / turned [check cool 50]')))).toBeUndefined();
  });
  it('alarm +1', () => {
    expect(firstChoice(tagJob('- talk: Kick it in. → inside [alarm +1]')).tags).toEqual([{ kind: 'alarm', delta: 1 }]);
  });
  it('crack', () => {
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 6]')).crack).toEqual({ kind: 'crack', length: 6, mods: [] });
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 7 · if cased +1 "cased"]')).crack!.mods).toEqual([{ when: [{ kind: 'set', name: 'cased' }], delta: 1, label: 'cased' }]);
  });
  it('crack … corp: a corporate terminal; tagText prints it back', () => {
    expect(firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 6 corp]')).crack).toEqual({ kind: 'crack', length: 6, mods: [], corp: true });
    expect(firstChoice(tagJob('- talk: Crack. → inside / turned [crack 7 corp · if cased +1 "cased"]')).crack).toMatchObject({ corp: true, mods: [{ delta: 1, label: 'cased' }] });
    for (const src of ['crack 6', 'crack 6 corp', 'crack 7 corp · if cased +1 "cased"']) {
      expect(tagText(firstChoice(tagJob(`- talk: Crack. → inside / turned [${src}]`)).crack!)).toBe(src);
    }
  });
  it('crack … ice, the old word, still reads as corp', () => {
    const tag = firstChoice(tagJob('- talk: Crack the panel. → inside / turned [crack 6 ice]')).crack!;
    expect(tag).toEqual({ kind: 'crack', length: 6, mods: [], corp: true });
    expect(tagText(tag)).toBe('crack 6 corp');
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
  it('[big] / [small] warnings: no check, both, a getaway or push beat', () => {
    const warns = (text: string) => {
      const r = parse(text);
      expect(r.ok).toBe(true);
      return r.ok ? r.warnings : [];
    };
    expect(warns(JOB.replace('- skim: Take what fits in a pocket. → part', '- skim: Take what fits in a pocket. → part [big]'))).toContain("skim: [big] only works on a checked choice");
    expect(warns(JOB.replace('→ paid / part [check reflex 50]', '→ paid / part [check reflex 50, big, small]'))).toContain('grab: a choice is [big] or [small], not both');
    const getaway = JOB.replace('## part\n', '# getaway\n*Run.*\n\n- run: Run for it. → part / part [check reflex 50, big]\n- hide: Hide. → part\n\n## part\n');
    expect(warns(getaway)).toContain('run: [big] does nothing on a getaway or push beat');
    expect(warns(JOB.replace('→ paid / part [check reflex 50]', '→ paid / part [check reflex 50, big]'))).toEqual([]);
  });
  it('the draft rules ask for loot:', () => {
    expect(QUEST_DRAFT_RULES.some((r) => r.includes('loot:'))).toBe(true);
  });
  it('the draft rules name [big] and [small]', () => {
    expect(QUEST_DRAFT_RULES.some((r) => r.includes('[big]') && r.includes('[small]'))).toBe(true);
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
    expect(beatText(beat(), ctx({ deck: { id: 'pocket-deck', name: 'Pocket deck', quality: 1, heat: 0, traits: ['hidden'] } }))).toContain('⟦DECK⟧ Your pocket deck');
    expect(beatText(beat(), ctx({ flags: { complication: 'caper-watching' } }))).toContain('\nSomeone across the street is watching.');
  });
  it('the plain text leaves them out', () => {
    expect(beat().text).toBe('*A steel door behind the stall. One man on it.*');
  });
  it('her history reads the marker as (LABEL)', () => {
    expect(questRowText({ title: 'Back Door', text: '⟦WITS⟧ x' }, (s) => s)).toContain('(WITS) x');
    // The hand: a call and a loss as her own lines, never the ⟦CALL⟧ label.
    const hand = questRowText({ title: 'Back Door', text: 'You take the door.\n⟦CALL⟧ Dez (runner) takes the door.\n⟦LOST⟧ Dez got hurt.', run: 'back-door@0' }, (s) => s);
    expect(hand).toContain('[call: Dez (runner) takes the door]');
    expect(hand).toContain('[Dez got hurt]');
    expect(hand).not.toContain('⟦');
  });
});

describe('job lines are not quest lines', () => {
  it('a row from a job run reads as a [job] line; a quest row stays a [quest] line', () => {
    expect(questRowText({ title: 'Last Ferry', text: 'Rain.', run: 'last-ferry@0' }, (s) => s)).toBe('[job — Last Ferry: Rain.]');
    expect(questRowText({ title: 'Paper Trail', text: 'Rain.' }, (s) => s)).toBe('[quest — Paper Trail: Rain.]');
  });
  it("her history leaves out a roll's result line: no dice, odds or game words (the table live check)", () => {
    const text = 'You talk your way in.\n\n*COOL 3d · IN THE OPEN — 6 6, crit.*\n\n*You\'re in.*';
    expect(questRowText({ title: 'Back Door', text, run: 'back-door@0' }, (s) => s.replace(/\n+/g, ' '))).toBe("[job — Back Door: You talk your way in. *You're in.*]");
    const old = 'You loop the cameras.\n\n*TECH 74% — no.*\n\n*The camera turns.*';
    expect(questRowText({ title: 'Night Shift', text: old, run: 'night-shift@0' }, (s) => s.replace(/\n+/g, ' '))).toBe('[job — Night Shift: You loop the cameras. *The camera turns.*]');
  });
  it("a job's beat block is a [job] block that keeps the job to itself", () => {
    const q = ok(JOB);
    const b = questBlock(q, q.beats.get('door')!.at(-1)!, ctx(), (s) => s, true);
    expect(b.startsWith('[job — ')).toBe(true);
    expect(b).toContain('the [job — ');
    expect(b).not.toContain('[quest');
  });
});

describe('who a job line is told to (playtest: she answered as the player)', () => {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  it('says who "you" is in a job line or a quest line', () => {
    expect(questRowText({ title: 'Run Sheet', text: 'You take it.', run: 'run-sheet@0' }, flat, 'Soren')).toBe('[job — Run Sheet (told to Soren, so "you" here is Soren): You take it.]');
    expect(questRowText({ title: 'Paper Trail', text: 'Rain.' }, flat, 'Soren')).toBe('[quest — Paper Trail (told to Soren, so "you" here is Soren): Rain.]');
  });
  it('a beat she only hears reaches her as what she heard, never as what the player saw', () => {
    const line = questRowText({ title: 'Run Sheet', text: 'A branch stamp.', run: 'run-sheet@0', heard: 'You stop. "What is it?"' }, flat, 'Soren');
    expect(line).toBe(`[job — Run Sheet (told to Soren, so "you" here is Soren; you weren't there, and this is all you heard on the line): You stop. "What is it?"]`);
  });
  it('what she heard is the pick and the marked words', () => {
    expect(heardAt({ onLine: ['"Why stop?"', '"What is it?"'] }, 'You stop.')).toBe('You stop. "Why stop?" "What is it?"');
    expect(heardAt({ onLine: ['"Why stop?"'] })).toBe('"Why stop?"');
    expect(heardAt({})).toBe('Nothing came over the line.');
  });
  it("the beat block tells the beat the same way when it isn't the turn's own line", () => {
    const q = ok(JOB);
    const beat = { ...q.beats.get('door')!.at(-1)!, room: 'spine/long-haul', text: 'A branch stamp.', onLine: ['"What is it?"'] };
    const told = questBlock(q, beat, ctx(), flat, false, 'Soren');
    expect(told).toContain(`Where it stands (told to Soren, so "you" here is Soren; you weren't there, and this is all you heard on the line): "What is it?"\n`);
    expect(told).not.toContain('branch');
    const onComms = questBlock(q, { ...beat, room: undefined, onComms: true }, ctx(), flat, false, 'Soren');
    expect(onComms).toContain("you weren't there");
  });
  it('a beat\'s views read the same in the block and on their own', () => {
    const q = ok(TRAIL.replace('starts: lowlight-intake', 'starts: haes-noodles'));
    const beat = q.beats.get('sentinel')![0];
    const views = beatViews(beat, ctx({ trust: 'high' }));
    expect(views).toBe('Paper burns. A Sentinel made you the old offer again this week.');
    expect(questBlock(q, beat, ctx({ trust: 'high' }), flat)).toContain(` What you think: ${views}\n`);
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

describe('effect lines that would show as story', () => {
  it('an outcome with alarm: or set is a problem, not text', () => {
    const job = (line: string) => `---\ntitle: X\nkind: mission\ntier: 1\nstarts: haes-noodles\npay: 100\n---\n\n# door\n*A door.*\n\n- a: Go. → in\n- b: Wait. → in\n\n## in\n*In.*\n${line}\n→ end\n`;
    for (const line of ['alarm: +1', 'set book=held']) {
      const r = parseQuestFile('x', job(line), { roster: null, places: null });
      expect(r.ok).toBe(false);
    }
  });
});
