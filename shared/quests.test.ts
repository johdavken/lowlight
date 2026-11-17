import { describe, expect, it } from 'vitest';
import { TRAIL } from './quests.fixture';
import { QUEST_CHOICE_MAX, QUEST_PITCH_MAX, QUEST_NODES_MAX, QUEST_TEXT_MAX, QUEST_VIEW_MAX, QUEST_JOB_TEXT_MAX, toldKey, toldOf, beatAway, holds, parseCondition, parseQuestFile, type CondCtx, type Condition, type QuestEntry } from './quests';

const roster = new Set(['nix-direct', 'hicks', 'cass']);
const places = new Set(['lowlight-intake', 'haes-noodles']);
const known = { roster, places };

const parse = (text: string, k: Parameters<typeof parseQuestFile>[2] = known) => parseQuestFile('paper-trail', text, k);
const ok = (text: string): QuestEntry => {
  const r = parse(text);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const fields = (text: string, k: Parameters<typeof parseQuestFile>[2] = known): string[] => {
  const r = parse(text, k);
  return r.ok ? [] : r.problems.map((p) => p.field);
};
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks', ...o });
const conds = (s: string): Condition[] => {
  const c = parseCondition(s);
  if (!Array.isArray(c)) throw new Error(c.message);
  return c;
};

describe('parseCondition', () => {
  it('takes a flag with an underscore', () => {
    expect(conds('intake_ledger=burned')).toEqual([{ kind: 'flag', name: 'intake_ledger', op: '=', value: 'burned' }]);
  });
  it('rejects a flag with capitals', () => {
    expect(Array.isArray(parseCondition('Ledger=x'))).toBe(false);
  });
  it('joins with and', () => {
    expect(conds('ledger=burned and trust≥mid and with=hicks')).toEqual([
      { kind: 'flag', name: 'ledger', op: '=', value: 'burned' },
      { kind: 'band', axis: 'trust', op: '>=', band: 'mid' },
      { kind: 'with', contact: 'hicks' },
    ]);
  });
  it('reads >= as ≥ and <= as ≤', () => {
    expect(conds('trust>=mid')).toEqual(conds('trust≥mid'));
    expect(conds('warmth<=low')).toEqual(conds('warmth≤low'));
  });
  it('reads != and a bare flag', () => {
    expect(conds('ledger!=burned and ledger')).toEqual([
      { kind: 'flag', name: 'ledger', op: '!=', value: 'burned' },
      { kind: 'set', name: 'ledger' },
    ]);
  });
  it('has no or', () => {
    expect(Array.isArray(parseCondition('ledger or x'))).toBe(false);
  });
  it('refuses a band that is not low, mid or high', () => {
    expect(Array.isArray(parseCondition('trust=great'))).toBe(false);
  });
});

describe('holds', () => {
  it('compares bands in order', () => {
    expect(holds(conds('trust≥mid'), ctx({ trust: 'mid' }))).toBe(true);
    expect(holds(conds('trust≥mid'), ctx({ trust: 'high' }))).toBe(true);
    expect(holds(conds('trust≥mid'), ctx({ trust: 'low' }))).toBe(false);
    expect(holds(conds('warmth≤mid'), ctx({ warmth: 'high' }))).toBe(false);
    expect(holds(conds('trust=high'), ctx({ trust: 'high' }))).toBe(true);
  });
  it('is false on a band when standing does not apply', () => {
    expect(holds(conds('trust≥low'), ctx({ trust: null }))).toBe(false);
  });
  it('reads unset flags', () => {
    expect(holds(conds('ledger!=burned'), ctx())).toBe(true);
    expect(holds(conds('ledger'), ctx())).toBe(false);
    expect(holds(conds('ledger'), ctx({ flags: { ledger: 'given' } }))).toBe(true);
    expect(holds(conds('ledger=given'), ctx({ flags: { ledger: 'given' } }))).toBe(true);
  });
  it('reads with', () => {
    expect(holds(conds('with=hicks'), ctx())).toBe(true);
    expect(holds(conds('with=hicks'), ctx({ with: 'nix-direct' }))).toBe(false);
  });
  it('holds with no conditions', () => {
    expect(holds(null, ctx())).toBe(true);
  });
});

describe('parseQuestFile', () => {
  it('reads the front matter, the first beat and its stranger', () => {
    const q = ok(TRAIL);
    expect(q).toMatchObject({ id: 'paper-trail', title: 'Paper Trail', with: ['nix-direct', 'hicks'], starts: 'lowlight-intake', after: null, first: 'sentinel' });
    const b = q.beats.get('sentinel')![0];
    expect(b.stranger).toEqual({ name: 'Arlo Venn', voice: 'an SDG Sentinel: polite, patient, never raises his voice', face: null, temper: null });
    expect(b.text).toBe('*Boots on the stairs.*\n\n"Evening," he says.');
  });
  it('reads views, gated views and the fallback', () => {
    const b = ok(TRAIL).beats.get('sentinel')![0];
    expect(b.views).toEqual([
      { contact: 'nix-direct', when: null, text: "The ledger is the Intake's whole promise." },
      { contact: 'hicks', when: null, text: 'Paper burns.' },
      { contact: 'hicks', when: [{ kind: 'band', axis: 'trust', op: '=', band: 'high' }], text: 'A Sentinel made you the old offer again this week.' },
      { contact: 'any', when: null, text: "You don't like a Sentinel in this room." },
    ]);
  });
  it('reads choices and their tags', () => {
    const q = ok(TRAIL);
    expect(q.beats.get('sentinel')![0].choices).toEqual([
      { id: 'hand', line: 'Hand it over.', to: 'given', fail: null, check: null, crack: null, tags: [{ kind: 'set', name: 'ledger', value: 'given' }] },
      { id: 'stall', line: 'Stall him till morning.', to: 'stalled', fail: null, check: null, crack: null, tags: [{ kind: 'clock', minutes: 360 }] },
      { id: 'deny', line: "Say there's no ledger.", to: 'denied', fail: null, check: null, crack: null, tags: [{ kind: 'needs', all: [{ kind: 'band', axis: 'trust', op: '>=', band: 'mid' }] }] },
    ]);
    expect(q.beats.get('return')![0].choices[0].tags).toEqual([
      { kind: 'set', name: 'intake_ledger', value: 'faced' },
      { kind: 'clock', minutes: 30 },
    ]);
  });
  it('reads outcomes and where they go', () => {
    const q = ok(TRAIL);
    expect(q.outcomes.get('given')).toEqual({ id: 'given', text: '*He thanks you like he means it.*', to: 'return', wait: null, next: null, effects: {} });
    expect(q.outcomes.get('faced')!.to).toBe('end');
  });
  it('takes a quest for anyone, and an after condition', () => {
    const q = ok(TRAIL.replace('with: [nix-direct, hicks]\n', '').replace('after: null', 'after: "ledger=burned"'));
    expect(q.with).toBeNull();
    expect(q.after).toEqual([{ kind: 'flag', name: 'ledger', op: '=', value: 'burned' }]);
  });

  it('reads a pitch line, and knows a quest with a deadline (new-player quick wins)', () => {
    expect(ok(TRAIL).pitch).toBeNull();
    const q = ok(TRAIL.replace('after: null', 'after: null\npitch: A Sentinel wants one page.'));
    expect(q.pitch).toBe('A Sentinel wants one page.');
    expect(ok(TRAIL).timed).toBe(false);
    expect(ok(WAITS).timed).toBe(true);
  });
  it('refuses a pitch over QUEST_PITCH_MAX', () => {
    expect(fields(TRAIL.replace('after: null', `after: null\npitch: ${'a'.repeat(QUEST_PITCH_MAX + 1)}`))).toContain('pitch');
  });

  it('refuses an unknown with id', () => {
    expect(fields(TRAIL.replace('with: [nix-direct, hicks]', 'with: [nix-direct, dixie]'))).toContain('with');
  });
  it('refuses an unknown start place', () => {
    expect(fields(TRAIL.replace('starts: lowlight-intake', 'starts: the-moon'))).toContain('starts');
  });
  it('refuses an arrow to a missing node', () => {
    expect(fields(TRAIL.replace('→ given [set', '→ nowhere [set'))).toContain('sentinel');
  });
  it('needs 2 to 4 choices on a beat', () => {
    expect(fields(TRAIL.replace('- run: Run. → ran\n', ''))).toContain('return');
    const five = TRAIL.replace('- run: Run. → ran\n', '- run: Run. → ran\n- a: A. → ran\n- b: B. → ran\n- c: C. → ran\n');
    expect(fields(five)).toContain('return');
  });
  it('needs a view for every beat', () => {
    expect(fields(TRAIL.replace('view any: Here he is again.\n', ''))).toContain('return');
  });
  it('needs an arrow at the end of an outcome', () => {
    expect(fields(TRAIL.replace('*You run.*\n→ end', '*You run.*'))).toContain('ran');
  });
  it('refuses a node nothing reaches', () => {
    expect(fields(`${TRAIL}\n## lost\n*Nobody comes here.*\n→ end\n`)).toContain('lost');
  });
  it('refuses a node that can never end', () => {
    const loop = TRAIL.replace('*You run.*\n→ end', '*You run.*\n→ return').replace('*It\'s over.*\n→ end', "*It's over.*\n→ return");
    expect(fields(loop)).toContain('return');
  });
  it('allows a loop through a choice when another path ends', () => {
    expect(fields(TRAIL.replace('*You run.*\n→ end', '*You run.*\n→ return'))).toEqual([]);
  });
  it('limits a body, a view and a choice line', () => {
    expect(fields(TRAIL.replace('*Venn is back.*', 'x'.repeat(QUEST_TEXT_MAX + 1)))).toContain('return');
    expect(fields(TRAIL.replace('Here he is again.', 'x'.repeat(QUEST_VIEW_MAX + 1)))).toContain('return');
    expect(fields(TRAIL.replace('Face him.', 'x'.repeat(QUEST_CHOICE_MAX + 1)))).toContain('return');
  });
  it(`allows at most ${QUEST_NODES_MAX} beats and outcomes`, () => {
    const extra = Array.from({ length: QUEST_NODES_MAX }, (_, i) => `\n## more-${i}\n*x*\n→ end\n`).join('');
    expect(fields(TRAIL + extra)).toContain('file');
  });
  it('refuses a view for someone not on the roster', () => {
    expect(fields(TRAIL.replace('view hicks: Paper burns.', 'view dixie: Paper burns.'))).toContain('sentinel');
  });
  it('skips roster and place checks without them', () => {
    expect(fields(TRAIL.replace('with: [nix-direct, hicks]', 'with: [dixie]').replace('starts: lowlight-intake', 'starts: the-moon'), { roster: null, places: null })).toEqual([]);
  });
  it('refuses a bad condition in a tag', () => {
    expect(fields(TRAIL.replace('[needs trust≥mid]', '[needs trust or x]'))).toContain('sentinel');
  });
  it('refuses a bad id', () => {
    expect(parseQuestFile('Paper_Trail', TRAIL, known).ok).toBe(false);
  });
});

import { PICK_CHECK_SYSTEM, flagsOf, openQuests, parsePick, parseRun, pickCheckMessages, pickLine, questBlock, questRowText, shownChoices, type QuestRun } from './quests';

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const CLOSE_VENN =
  " Talk it through as yourself, and never choose for them. If they act a choice out — say it to Arlo Venn, start doing it — it hasn't happened yet: nobody answers it or moves on it, and your reply stops at the moment before it lands. These are the only choices; don't offer other ways out. Arlo Venn knows only what is written above: give them no new facts, and they stay where they are, waiting. Don't guess at what comes after.]";

describe('questBlock', () => {
  const q = ok(TRAIL);
  const beat = q.beats.get('sentinel')![0];
  it('is the spec text, with the gated line at its band', () => {
    expect(questBlock(q, beat, ctx({ trust: 'high' }), flat)).toBe(
      `[quest — Paper Trail. Where it stands: *Boots on the stairs.* "Evening," he says.\n` +
        ` The choices in front of them: hand it over; stall him till morning; say there's no ledger.\n` +
        ` What you think: Paper burns. A Sentinel made you the old offer again this week.\n` +
        CLOSE_VENN,
    );
  });
  it("on the beat's own turn, points at the row's line instead of telling the beat again", () => {
    const b = questBlock(q, beat, ctx({ trust: 'high' }), flat, true);
    expect(b).toContain('[quest — Paper Trail. Where it stands: the [quest — Paper Trail: …] line at the end of this message, which they have just read\n');
    expect(b).not.toContain('Boots on the stairs');
  });
  it('leaves the gated line out below its band', () => {
    expect(questBlock(q, beat, ctx({ trust: 'mid' }), flat)).not.toContain('old offer');
  });
  it('falls back to view any', () => {
    expect(questBlock(q, beat, ctx({ with: 'cass' }), flat)).toContain(" What you think: You don't like a Sentinel in this room.\n");
  });
  it('lists only the choices shown', () => {
    const b = questBlock(q, beat, ctx({ trust: 'low' }), flat);
    expect(b).toContain('The choices in front of them: hand it over; stall him till morning.\n');
    expect(shownChoices(beat, ctx({ trust: 'low' })).map((c) => c.id)).toEqual(['hand', 'stall']);
  });
  it('speaks of someone here when the beat has no stranger', () => {
    const b = questBlock(q, q.beats.get('return')![0], ctx(), flat);
    expect(b).toContain('say it to someone here, start doing it');
    expect(b).not.toContain('knows only what is written above');
    expect(b.endsWith("These are the only choices; don't offer other ways out. Don't guess at what comes after.]")).toBe(true);
  });
});

describe('pick lines and rows', () => {
  it('turns a choice line to the second person', () => {
    expect(pickLine('Stall him till morning.')).toBe('You stall him till morning.');
  });
  it('flattens a quest row for the history', () => {
    expect(questRowText({ title: 'Paper Trail', text: 'One.\n\nTwo.' }, flat)).toBe('[quest — Paper Trail: One. Two.]');
  });
});

describe('runs and flags', () => {
  const run = (o: Partial<QuestRun>): QuestRun => ({ beat: 'sentinel', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1, ...o });
  it('reads a stored run and refuses junk', () => {
    expect(parseRun(JSON.stringify(run({})))).toEqual(run({}));
    expect(parseRun('nope')).toBeNull();
    expect(parseRun(null)).toBeNull();
    expect(parseRun('{"beat":3}')).toBeNull();
  });
  it('lets the later run win a flag', () => {
    expect(flagsOf([{ run: run({ flags: { ledger: 'given' }, at: 9 }) }, { run: run({ flags: { ledger: 'burned', x: 'y' }, at: 5 }) }])).toEqual({ ledger: 'given', x: 'y' });
  });
});

describe('openQuests', () => {
  const q = ok(TRAIL);
  const base = { placeId: 'lowlight-intake', contact: 'hicks', started: [], ctx: ctx() };
  it('offers it at its place with an allowed contact', () => {
    expect(openQuests([q], base).map((e) => e.id)).toEqual(['paper-trail']);
  });
  it('not elsewhere, not with someone else', () => {
    expect(openQuests([q], { ...base, placeId: 'haes-noodles' })).toEqual([]);
    expect(openQuests([q], { ...base, contact: 'cass', ctx: ctx({ with: 'cass' }) })).toEqual([]);
  });
  it('not before its after condition', () => {
    const later = ok(TRAIL.replace('after: null', 'after: "ledger=burned"'));
    expect(openQuests([later], base)).toEqual([]);
    expect(openQuests([later], { ...base, ctx: ctx({ flags: { ledger: 'burned' } }) })).toHaveLength(1);
  });
  it('not once started anywhere, or done', () => {
    const r = { beat: 'sentinel', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1 };
    expect(openQuests([q], { ...base, started: [{ id: 'paper-trail', contact: 'nix-direct', run: r }] })).toEqual([]);
    expect(openQuests([q], { ...base, started: [{ id: 'paper-trail', contact: 'hicks', run: { ...r, beat: null, done: true } }] })).toEqual([]);
  });
});

describe('the pick check', () => {
  const choices = ok(TRAIL).beats.get('sentinel')![0].choices;
  it('sends the system text, the choices, the recent lines and the line', () => {
    const m = pickCheckMessages({ beat: 'A Sentinel wants a page.', choices, recent: ['Cass: hi', 'Hicks: hey'], line: 'Come back in the morning.' });
    expect(m[0]).toEqual({ role: 'system', content: PICK_CHECK_SYSTEM });
    expect(m[1].role).toBe('user');
    expect(m[1].content).toContain('hand: Hand it over.\nstall: Stall him till morning.');
    expect(m[1].content).toContain('Cass: hi\nHicks: hey');
    expect(m[1].content.endsWith('The line: Come back in the morning.')).toBe(true);
  });
  it('reads a pick among the shown ids only', () => {
    const shown = ['hand', 'stall'];
    expect(parsePick('{"pick":"stall"}', shown)).toBe('stall');
    expect(parsePick('```json\n{"pick": "hand"}\n```', shown)).toBe('hand');
    expect(parsePick('{"pick":"burn"}', shown)).toBeNull();
    expect(parsePick('{"pick":null}', shown)).toBeNull();
    expect(parsePick('I think stall.', shown)).toBeNull();
    expect(parsePick('', shown)).toBeNull();
  });
});

import { QUEST_DRAFT_RULES, questCounts, questDraftPrompt, questOutline } from './quests';

describe('Studio helpers', () => {
  const q = ok(TRAIL);
  it('outlines each beat with its choices, where they lead and their tags', () => {
    const o = questOutline(q);
    expect(o.map((b) => b.beat)).toEqual(['sentinel', 'return']);
    expect(o[0].choices[0]).toEqual({ id: 'hand', line: 'Hand it over.', to: 'given', next: 'return', tags: ['set ledger=given'], wait: null, waitNext: null, check: null });
    expect(o[0].choices[1].tags).toEqual(['clock +6h']);
    expect(o[0].choices[2].tags).toEqual(['needs trust≥mid']);
    expect(o[1].choices[1]).toMatchObject({ id: 'run', to: 'ran', next: 'end' });
  });
  it('counts the quests that name a character', () => {
    expect(questCounts([q], 'hicks')).toBe(1);
    expect(questCounts([q], 'cass')).toBe(0);
  });
  it("COPY FOR OPUS: the author's outline, the rules, the format and who can be in it", () => {
    const p = questDraftPrompt({ outline: 'A Sentinel wants the ledger.', roster: [{ id: 'hicks', name: 'Hicks', pronoun: 'he' }], places: ['lowlight-intake'] });
    expect(p).toContain('A Sentinel wants the ledger.');
    for (const r of QUEST_DRAFT_RULES) expect(p).toContain(r);
    expect(p).toContain('hicks — Hicks (he)');
    expect(p).toContain('lowlight-intake');
    expect(p).toContain('view any:');
  });
});

import { beatAt, chooseVariant } from './quests';
import { VARIANTS } from './quests.fixture';

describe('beat variants', () => {
  const q = ok(VARIANTS);
  it('reads every version of a beat, in file order, the default last', () => {
    const vs = q.beats.get('return')!;
    expect(vs.map((b) => b.when)).toEqual([[{ kind: 'flag', name: 'ledger', op: '=', value: 'given' }], null]);
    expect(vs[0].choices.map((c) => c.id)).toEqual(['ask', 'out2']);
  });
  it('chooses the first version whose condition holds, else the default', () => {
    expect(chooseVariant(q, 'return', ctx({ flags: { ledger: 'given' } }))).toMatchObject({ variant: 0 });
    expect(chooseVariant(q, 'return', ctx())).toMatchObject({ variant: 1 });
    expect(chooseVariant(q, 'nope', ctx())).toBeNull();
    expect(beatAt(q, 'return', 1)!.text).toBe('*Venn is back.*');
    // A save from before a rewrite (fewer versions now) gets the default version.
    expect(beatAt(q, 'return', 5)!.text).toBe('*Venn is back.*');
    expect(beatAt(q, 'nope', 0)).toBeUndefined();
  });
  it("an outcome reached only from a variant isn't an orphan", () => {
    expect(fields(VARIANTS)).toEqual([]);
  });
  it('refuses a bad if, two defaults, a default not last, a variant with one choice', () => {
    expect(fields(VARIANTS.replace('# return if ledger=given', '# return if ledger or x'))).toContain('return');
    expect(fields(VARIANTS.replace('# return if ledger=given', '# return'))).toContain('return');
    const notLast = VARIANTS.replace('# return if ledger=given', '# return-x').replace('\n# return\n', '\n# return if ledger=given\n');
    expect(fields(notLast.replace('# return-x', '# return'))).toContain('return');
    expect(fields(VARIANTS.replace('- out2: Tell him to get out. → ran\n', ''))).toContain('return');
  });
  it('counts each version toward the node limit', () => {
    const extra = Array.from({ length: QUEST_NODES_MAX - 8 }, (_, i) => `\n## more-${i}\n*x*\n→ end\n`).join('');
    expect(fields(VARIANTS + extra)).toContain('file');
  });
  it('a run stored before variants and waits still reads (Review Focus 4)', () => {
    expect(parseRun('{"beat":"sentinel","picks":[],"flags":{},"done":false,"at":1}')).toEqual({ beat: 'sentinel', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1 });
  });
});

import { QUEST_NEXT_MAX, startWait, waitDue, waitLine, type RunWait } from './quests';
import { WAITS } from './quests.fixture';

describe('waits', () => {
  // A wait without `else gone` leaves the gone outcome unreachable: it goes too.
  const swap = (line: string) => {
    const t = WAITS.replace('wait: until 06:00 · at lowlight-intake · by 12:00 else gone', line);
    return line.includes('else gone') ? t : t.replace('\n## gone\n*A card in the door.*\n→ end\n', '');
  };
  it('reads a wait and its next line', () => {
    const o = ok(WAITS).outcomes.get('given')!;
    expect(o.wait).toEqual({ until: 360, after: null, at: 'lowlight-intake', ready: false, by: { kind: 'time', minute: 720 }, else: 'gone', comms: false });
    expect(o.next).toBe('The Sentinel said morning. Be at the Intake.');
    expect(ok(WAITS).outcomes.get('stalled')!.wait).toBeNull();
  });
  it('reads spans, ready, and the other separators', () => {
    expect(ok(swap('wait: after +6h . by +8h else gone')).outcomes.get('given')!.wait).toMatchObject({ after: 360, by: { kind: 'after', minutes: 480 } });
    expect(ok(swap('wait: ready')).outcomes.get('given')!.wait).toMatchObject({ ready: true, until: null, at: null });
    expect(ok(swap('wait: at lowlight-intake - after +30m')).outcomes.get('given')!.wait).toMatchObject({ at: 'lowlight-intake', after: 30 });
  });
  for (const [what, line] of [
    ['until with after', 'wait: until 06:00 · after +2h'],
    ['by with ready', 'wait: ready · by 12:00 else gone'],
    ['by with nothing to wait for', 'wait: by 12:00 else gone'],
    ['by not after the wait', 'wait: after +6h · by +4h else gone'],
    ['else to a missing node', 'wait: until 06:00 · by 12:00 else nowhere'],
    ['else to its own target', 'wait: until 06:00 · by 12:00 else return'],
    ['a part it cannot read', 'wait: soon'],
    ['an unknown place', 'wait: at the-moon'],
  ] as const) {
    it(`refuses ${what}`, () => {
      expect(fields(swap(line))).toContain('given');
    });
  }
  it('refuses a wait on → end, a long next line, and a wait line out of place', () => {
    expect(fields(WAITS.replace('*It\'s over.*\n→ end', "*It's over.*\n→ end\nwait: ready"))).toContain('faced');
    expect(fields(WAITS.replace('next: The Sentinel said morning. Be at the Intake.', `next: ${'x'.repeat(QUEST_NEXT_MAX + 1)}`))).toContain('given');
    expect(fields(WAITS.replace('## gone\n*A card in the door.*', '## gone\nwait: ready\n*A card in the door.*'))).toContain('gone');
  });

  const D = 1440;
  const at = (day: number, hhmm: number) => (day - 1) * D + hhmm;
  const given = ok(WAITS).outcomes.get('given')!;
  it('starts from the pick: until across midnight, by after it, spans from the pick', () => {
    expect(startWait(given, at(1, 23 * 60 + 30))).toEqual({ to: 'return', from: at(2, 360), at: 'lowlight-intake', ready: false, by: at(2, 720), else: 'gone', next: 'The Sentinel said morning. Be at the Intake.' });
    const spans = ok(swap('wait: after +6h · by +8h else gone')).outcomes.get('given')!;
    expect(startWait(spans, 1200)).toMatchObject({ from: 1560, by: 1680 });
    expect(startWait(ok(swap('wait: ready')).outcomes.get('given')!, 1200)).toMatchObject({ from: 1200, by: null, ready: true });
  });
  it('is due, missed or still waiting', () => {
    const w = startWait(given, at(1, 23 * 60)) as RunWait;
    expect(waitDue(w, { now: at(2, 300), placeId: 'lowlight-intake', ready: false })).toBe('wait');
    expect(waitDue(w, { now: at(2, 360), placeId: 'lowlight-intake', ready: false })).toBe('due');
    expect(waitDue(w, { now: at(2, 400), placeId: 'haes-noodles', ready: false })).toBe('wait');
    expect(waitDue(w, { now: at(2, 721), placeId: 'lowlight-intake', ready: false })).toBe('missed');
    const r = startWait(ok(swap('wait: ready')).outcomes.get('given')!, 1200);
    expect(waitDue(r, { now: 1200, placeId: null, ready: false })).toBe('wait');
    expect(waitDue(r, { now: 1200, placeId: null, ready: true })).toBe('due');
  });
  it('says the next step: its line, else one made from the parts', () => {
    const name = (id: string) => (id === 'lowlight-intake' ? 'Lowlight Intake' : id);
    expect(waitLine(startWait(given, 1200), name)).toBe('The Sentinel said morning. Be at the Intake.');
    const plain = ok(WAITS.replace('next: The Sentinel said morning. Be at the Intake.\n', '')).outcomes.get('given')!;
    expect(waitLine(startWait(plain, 1200), name)).toBe('At Lowlight Intake, after 06:00.');
  });
});

describe('Studio knows waits', () => {
  it('the outline shows an outcome\'s wait and next line under the choice that leads to it', () => {
    const o = questOutline(ok(WAITS));
    const hand = o.find((b) => b.beat === 'sentinel')!.choices.find((c) => c.id === 'hand')!;
    expect(hand).toMatchObject({ wait: 'until 06:00 · at lowlight-intake · by 12:00 → gone', waitNext: 'The Sentinel said morning. Be at the Intake.' });
    expect(o.map((b) => b.beat)).toContain('return if ledger=given');
    expect(o.find((b) => b.beat === 'sentinel')!.choices.find((c) => c.id === 'stall')!.wait).toBeNull();
  });
  it('COPY FOR OPUS knows variants, waits and next lines, and the three rules', () => {
    const p = questDraftPrompt({ outline: 'x', roster: [], places: [] });
    expect(p).toContain('# <beat-id> if <condition>');
    expect(p).toContain('wait: until 06:00 · at <place id> · by 12:00 else <beat or outcome id>');
    expect(p).toContain('next: <what to do, never what happens if you don');
    expect(QUEST_DRAFT_RULES.some((r) => r.startsWith('A wait is where the evening happens'))).toBe(true);
    expect(QUEST_DRAFT_RULES.some((r) => r.startsWith('A deadline needs a missed-it path'))).toBe(true);
    expect(QUEST_DRAFT_RULES.some((r) => r.startsWith('A next: line says what to do'))).toBe(true);
    expect(QUEST_DRAFT_RULES.some((r) => r.startsWith('A missed-it path plays wherever the player is'))).toBe(true);
  });
});

describe('face: on a stranger (stranger faces spec §4)', () => {
  const FACE = (line: string) => TRAIL.replace(/(stranger: Arlo Venn[^\n]*\n)/, `$1${line}\n`);
  const sentinel = (text: string, known: Parameters<typeof parseQuestFile>[2] = { roster: null, places: null }) => {
    const r = parseQuestFile('paper-trail', text, known);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r.entry.beats.get('sentinel')![0].stranger!;
  };
  const problemsOf = (text: string, known: Parameters<typeof parseQuestFile>[2]) => {
    const r = parseQuestFile('paper-trail', text, known);
    return r.ok ? [] : r.problems;
  };
  const LIB = { roster: null, places: null, extras: { ids: new Set(['sdg-07']), tags: new Set(['sdg']) } };
  it('a face id, any face with a tag, or none', () => {
    expect(sentinel(FACE('face: sdg-07')).face).toEqual({ id: 'sdg-07' });
    expect(sentinel(FACE('face: any sdg')).face).toEqual({ tag: 'sdg' });
    expect(sentinel(TRAIL).face).toBeNull();
    expect(sentinel(FACE('face: sdg-07')).name).toBe('Arlo Venn');
  });
  it('checks the face against the library, when there is one', () => {
    expect(problemsOf(FACE('face: sdg-99'), LIB).map((p) => p.field)).toContain('sentinel');
    expect(problemsOf(FACE('face: any dock'), LIB).map((p) => p.field)).toContain('sentinel');
    expect(problemsOf(FACE('face: sdg-07'), LIB)).toEqual([]);
    expect(problemsOf(FACE('face: sdg-99'), { roster: null, places: null, extras: null })).toEqual([]);
    expect(problemsOf(FACE('face: sdg-99'), { roster: null, places: null })).toEqual([]);
  });
  it('face: goes right after stranger:', () => {
    const misplaced = TRAIL.replace('# return\n', '# return\nface: sdg-07\n');
    expect(problemsOf(misplaced, { roster: null, places: null }).map((p) => p.message).join(' ')).toContain('face: goes right after stranger:');
  });
  it('an old run reads with no faces', () => {
    expect(parseRun(JSON.stringify({ beat: 'x', picks: [], flags: {}, done: false, at: 1 }))!.faces ?? {}).toEqual({});
  });
  it('COPY FOR OPUS knows face: and the tags on offer', () => {
    const p = questDraftPrompt({ outline: 'x', roster: [], places: [], tags: [{ tag: 'sdg', count: 16 }] });
    expect(p).toContain('face: any <tag>');
    expect(p).toContain('sdg (16)');
  });
});

import { mentionsFlag } from './quests';
import { JOB } from './quests.fixture';

describe('mentionsFlag (crew spec §2)', () => {
  const parse = (t: string) => {
    const r = parseQuestFile('back-door', t, { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r.entry;
  };
  it('finds a flag in a beat variant, a check modifier or a passive line; not otherwise', () => {
    expect(mentionsFlag(parse(JOB), 'complication')).toBe(true);
    expect(mentionsFlag(parse(JOB), 'cased')).toBe(false);
    expect(mentionsFlag(parse(JOB.replace('[check reflex 50]', '[check reflex 50 · if cased +15 "you cased it"]')), 'cased')).toBe(true);
    expect(mentionsFlag(parse(JOB.replace('*The ledger.*', "*The ledger.*\n\n[cased] The back stair's clear.")), 'cased')).toBe(true);
    expect(mentionsFlag(parse(JOB.replace('# desk\n', '# desk if cased=clean\n*Quick.*\n\n- grab: Grab it. → paid\n- skim: Skim it. → part\n\n# desk\n')), 'cased')).toBe(true);
  });
});

// House Glass (2026-11-08): Nix walks into the Orchid with Hicks; a room: beat alone would leave her ON COMMS.
describe('here: on a beat', () => {
  const file = (lines: string) => TRAIL.replace(/^(# sentinel)$/m, `$1\n${lines}`);
  const hereBeat = () => {
    const r = parseQuestFile('t', file('room: karasu/dead-blocks\nhere: yes'), { roster, places });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return { q: r.entry, beat: [...r.entry.beats.values()].flat().find((b) => b.here === true)! };
  };
  it('marks the contact in the room', () => {
    const { beat } = hereBeat();
    expect(beat).toMatchObject({ here: true, room: 'karasu/dead-blocks' });
    expect(JSON.stringify(beat)).not.toContain('here: yes');
  });
  it('needs a room, and not comms', () => {
    const messages = (lines: string) => {
      const r = parseQuestFile('t', file(lines), { roster, places });
      return r.ok ? '' : r.problems.map((p) => p.message).join(' ');
    };
    expect(messages('here: yes')).toMatch(/here/);
    expect(messages('room: karasu/dead-blocks\nhere: yes\ncomms: yes')).toMatch(/here/);
  });
  it('is not away: she hears the whole beat', () => {
    expect(beatAway({ room: 'x', here: true })).toBe(false);
    expect(beatAway({ room: 'x' })).toBe(true);
    const { q, beat } = hereBeat();
    const b = questBlock(q, beat, { flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks' }, (s) => s.replace(/\s+/g, ' ').trim(), false, 'Hicks');
    expect(b).toContain('Boots on the stairs');
    expect(b).not.toContain('heard on the line');
    expect(b).toContain('there with them');
    // Live check: in the room, she acted the client card out herself; the cards stay theirs (House Glass).
    expect(b).toContain("You're in the room with them, but these choices are theirs");
  });
});

// Silas was in the player's ear with no tag: the tag needed a room, and the job had none yet (playtest).
describe('comms: on a beat', () => {
  const file = (line: string) => TRAIL.replace(/^(# \S+)$/m, `$1\n${line}`);
  it('marks the contact on the line, with no room', () => {
    const r = parseQuestFile('t', file('comms: yes'), { roster, places });
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.entry.beats.values()].flat().some((b) => b.onComms === true && !b.room)).toBe(true);
  });
  it("doesn't reach the beat's text", () => {
    const r = parseQuestFile('t', file('comms: yes'), { roster, places });
    if (r.ok) expect(JSON.stringify([...r.entry.beats.values()])).not.toContain('comms: yes');
  });
});

// Job texts (spec 2026-11-09 §1): a contact's own job may be handed over by her text, or in the room.
describe('text: a contact hands you her job', () => {
  const own = (front: string) => TRAIL.replace('with: [nix-direct, hicks]', 'with: [nix-direct]').replace('after: null', 'after: lark=hers').replace('starts: lowlight-intake', `starts: lowlight-intake\n${front}`);
  const messages = (text: string) => {
    const r = parse(text);
    return r.ok ? [] : r.problems.map((p) => p.message);
  };
  it("a job's text: parses onto the entry", () => {
    const r = parse(own('text: You need him up the stairs.\nkind: mission'));
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.text).toBe('You need him up the stairs.');
  });
  it('text: with no with: contact, or two, is a problem', () => {
    const two = TRAIL.replace('after: null', 'after: lark=hers').replace('starts: lowlight-intake', 'starts: lowlight-intake\ntext: Come up.');
    const none = two.replace('with: [nix-direct, hicks]\n', '');
    expect(messages(two)).toContain("text: needs one with: contact (she's the one who texts)");
    expect(messages(none)).toContain("text: needs one with: contact (she's the one who texts)");
  });
  it('text: without after: is a problem', () => {
    expect(messages(own('text: Come up.').replace('after: lark=hers\n', ''))).toContain("text: needs an after: (it's sent when the gate opens)");
  });
  it('text: over 300 characters is a problem', () => {
    expect(QUEST_JOB_TEXT_MAX).toBe(300);
    expect(fields(own(`text: ${'x'.repeat(301)}`))).toContain('text');
  });
  it('text: goes only on a job (Important 2: a contract or story quest lists outside the told check)', () => {
    expect(messages(own('text: Come up.'))).toContain('text: goes only on a job (kind: mission)');
    expect(messages(own('text: Come up.\nkind: mission'))).not.toContain('text: goes only on a job (kind: mission)');
  });
  it('toldKey and toldOf', () => {
    expect(toldKey('hicks', 'x')).toBe('told.hicks.x');
    expect(toldOf('{"how":"room","at":5}')).toEqual({ how: 'room', at: 5 });
    expect(toldOf('nope')).toBeNull();
    expect(toldOf(null)).toBeNull();
  });
});

// The deduction board (spec 2026-11-09 §2): an ending gives clue cards.
describe('gives: clue', () => {
  const CASES = new Map([['the-fourteenth', new Set(['HAND', 'BOWL', 'DOOR'])]]);
  const giving = (lines: string) => JOB.replace('## paid\n*All of it.*\n', `## paid\n*All of it.*\n${lines}\n`);
  const open = { roster: null, places: null };
  it('parses, several to an ending', () => {
    const r = parseQuestFile('t', giving('gives: clue the-fourteenth BOWL\ngives: clue the-fourteenth DOOR'), { ...open, cases: CASES });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.outcomes.get('paid')!.effects.clues).toEqual([{ case: 'the-fourteenth', card: 'BOWL' }, { case: 'the-fourteenth', card: 'DOOR' }]);
  });
  it('an unknown case or card is a problem', () => {
    const msgs = (l: string) => {
      const r = parseQuestFile('t', giving(l), { ...open, cases: CASES });
      return r.ok ? '' : r.problems.map((p) => p.message).join(' ');
    };
    expect(msgs('gives: clue no-case HAND')).toMatch(/no case 'no-case'/);
    expect(msgs('gives: clue the-fourteenth NOPE')).toMatch(/no card 'NOPE' in the-fourteenth/);
  });
});


// The deduction board (spec 2026-11-09 §3): a beat can be the board; ACCUSE resolves it into its verdict's outcome.
describe('board: on a beat', () => {
  const BOARD = JOB.replace('# desk', '# desk\nboard: mini')
    .replace(/- grab: [^\n]*\n- skim: [^\n]*\n/, '')
    .replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', '## holds\n*It holds.*\npay: full\ntake: full\n→ end\n\n## thin\n*Thin.*\ntake: part\n→ end\n\n## hunch\n*A hunch.*\ntake: part\n→ end\n\n## wrong-b\n*Wrong.*\ntake: none\n→ end')
    .replace(/## part\n[\s\S]*?→ end\n?/, '');
  const known = { roster: null, places: null, cases: new Map([['mini', new Set(['ONE'])]]), caseVerdicts: new Map([['mini', ['holds', 'thin', 'hunch', 'wrong-b']]]) };
  const msgs = (text: string, k = known) => {
    const r = parseQuestFile('t', text, k);
    return r.ok ? '' : r.problems.map((p) => `${p.field}: ${p.message}`).join(' / ');
  };
  it('a board beat parses and needs every verdict outcome', () => {
    const r = parseQuestFile('t', BOARD, known);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect([...r.entry.beats.get('desk')!][0].board).toBe('mini');
    expect(msgs(BOARD.replace(/## wrong-b\n[\s\S]*?→ end/, ''))).toMatch(/board: needs an outcome ## wrong-b/);
    expect(msgs(BOARD.replace('board: mini', 'board: nope'))).toMatch(/board: no case 'nope'/);
  });
  it('a board beat with choices is a problem', () => {
    expect(msgs(BOARD.replace('board: mini', 'board: mini\n- grab: Take it all. → holds'))).toMatch(/a board beat has no choices/);
  });
});

describe('her block on a board beat (deduction board spec §3)', () => {
  it('says the player is working the board, with no empty choices line, and that she never names anyone for them', async () => {
    const { questBlock } = await import('./quests');
    const BOARD = JOB.replace('# desk', '# desk\nboard: mini').replace(/- grab: [^\n]*\n- skim: [^\n]*\n/, '').replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', '## holds\n*It holds.*\ntake: full\n→ end').replace(/## part\n[\s\S]*?→ end\n?/, '');
    const r = parseQuestFile('t', BOARD, { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const beat = [...r.entry.beats.get('desk')!][0];
    const b = questBlock(r.entry, beat, { flags: {}, trust: 'mid', warmth: 'mid', with: 'nix-direct' }, (s) => s, false, 'Hicks');
    expect(b).not.toContain('The choices in front of them');
    expect(b).toContain("Hicks is working the case on the board: pairing what they've found, filing what holds, naming who");
    expect(b).toContain("Don't name anyone or solve it for them");
    expect(b).not.toContain('These are the only choices');
  });
});

describe('[unheard] cards (The Fourteenth final review, Critical 1)', () => {
  const UNHEARD = TRAIL.replace('- stall: Stall him till morning. → stalled [clock +6h]', '- stall: Stall him till morning. → stalled [clock +6h, unheard]');
  it("parses, and the contact's choice list leaves the card out", () => {
    expect(UNHEARD).toContain('unheard]');
    const q = ok(UNHEARD);
    const stall = q.beats.get('sentinel')![0].choices.find((c) => c.id === 'stall')!;
    expect(stall.tags.some((t) => t.kind === 'unheard')).toBe(true);
    const b = questBlock(q, q.beats.get('sentinel')![0], ctx({ trust: 'high' }), flat);
    expect(b).toContain('hand it over');
    expect(b).not.toContain('stall him');
  });
  it('an unheard card keeps its id unique in the file', () => {
    const text = UNHEARD.replace('- face: Face him.', '- stall: Face him.');
    expect(text).not.toBe(UNHEARD);
    const r = parseQuestFile('dup', text, { roster: null, places: null });
    expect(r.ok ? [] : r.problems.map((p) => p.message)).toContain("an [unheard] card's id is used by another card in this file: stall");
  });
});

// Two Stories (spec 2026-11-10 §3): an accounts beat, accounts cards given like clues, settles: with a condition.
import { settledFor } from './quests';
describe('accounts: on a beat', () => {
  const STORY = JOB.replace('# desk', '# desk\naccounts: mini-story')
    .replace(/- grab: [^\n]*\n- skim: [^\n]*\n/, '')
    .replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', '## told\n*Told.*\n→ end')
    .replace(/## part\n[\s\S]*?→ end\n?/, '');
  const known = { roster: null, places: null, cases: new Map([['mini-story', new Set(['DESK'])]]), accounts: new Set(['mini-story']) };
  const msgs = (text: string, k: Parameters<typeof parseQuestFile>[2] = known) => {
    const r = parseQuestFile('t', text, k);
    return r.ok ? '' : r.problems.map((p) => `${p.field}: ${p.message}`).join(' / ');
  };
  it('an accounts beat parses', () => {
    const r = parseQuestFile('t', STORY, known);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect([...r.entry.beats.get('desk')!][0].accounts).toBe('mini-story');
  });
  it('an accounts beat needs told, no choices, a known file', () => {
    expect(msgs(STORY.replace('## told', '## said'))).toMatch(/needs an outcome ## told/);
    expect(msgs(STORY.replace('accounts: mini-story', 'accounts: mini-story\n- grab: Take it. → told'))).toMatch(/an accounts beat has no choices/);
    expect(msgs(STORY.replace('accounts: mini-story', 'accounts: nope'))).toMatch(/no accounts file 'nope'/);
  });
  it('gives: clue takes an accounts id', () => {
    const giving = STORY.replace('## told\n*Told.*\n', '## told\n*Told.*\ngives: clue mini-story DESK\n');
    expect(msgs(giving)).toBe('');
  });
  it('her block says they are working out what to say, with no choices line', () => {
    const r = parseQuestFile('t', STORY, known);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const beat = [...r.entry.beats.get('desk')!][0];
    const b = questBlock(r.entry, beat, { flags: {}, trust: 'mid', warmth: 'mid', with: 'nix-direct' }, (s) => s, false, 'Soren');
    expect(b).toContain('Soren is working out what to say about that night');
    expect(b).toContain("Don't say what you already know about that night or answer for them");
    expect(b).not.toContain('The choices in front of them');
  });
});

describe('settles: with a condition', () => {
  const END = (lines: string) => JOB.replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', `## paid\n*All of it.*\npay: full\ntake: full\n${lines}\n→ end`);
  it('a conditional settles parses', () => {
    const r = parseQuestFile('t', END('settles: nix-direct if story.rue=caught: She caught it.'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const s = r.entry.outcomes.get('paid')!.effects.settles!;
    expect(s).toEqual([{ who: 'nix-direct', text: 'She caught it.', when: [{ kind: 'flag', name: 'story.rue', op: '=', value: 'caught' }] }]);
  });
  it('settledFor: the first conditional that holds, else the plain line', () => {
    const lines = [
      { who: 'rue', text: 'Plain.' },
      { who: 'rue', text: 'Caught.', when: [{ kind: 'flag' as const, name: 'story.rue', op: '=' as const, value: 'caught' }] },
      { who: 'rue', text: 'Also caught.', when: [{ kind: 'flag' as const, name: 'story.rue', op: '!=' as const, value: 'held' }] },
      { who: 'adebayo', text: 'Only if.', when: [{ kind: 'flag' as const, name: 'story.adebayo', op: '=' as const, value: 'held' }] },
    ];
    const c = (flags: Record<string, string>): CondCtx => ({ flags, trust: null, warmth: null, with: 'rue' });
    expect(settledFor(lines, c({ 'story.rue': 'caught' }))).toEqual([{ who: 'rue', text: 'Caught.' }]);
    expect(settledFor(lines, c({ 'story.rue': 'held' }))).toEqual([{ who: 'rue', text: 'Plain.' }]);
    expect(settledFor(lines, c({ 'story.rue': 'thin', 'story.adebayo': 'held' }))).toEqual([{ who: 'rue', text: 'Also caught.' }, { who: 'adebayo', text: 'Only if.' }]);
    expect(settledFor(lines, c({ 'story.rue': 'held', 'story.adebayo': 'thin' }))).toEqual([{ who: 'rue', text: 'Plain.' }]);
  });
  it('the run schema keeps accounts', () => {
    const accounts = { placed: { adebayo: { WHERE: 'POST' }, rue: {} }, pressed: { adebayo: ['DESK|KESTREL'], rue: [] }, marked: ['KESTREL'], patience: { adebayo: 1, rue: 3 }, leaked: [], told: true };
    const r = parseRun(JSON.stringify({ beat: 'desk', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1, accounts }));
    expect(r?.accounts).toEqual(accounts);
  });
});

describe('story flags across jobs (playtest 2026-11-10: Quiet never saw nix4 from The Fourteenth)', () => {
  it("a job run's story flags are what its cards set and a board's verdict, never its draws, prep or guest", async () => {
    const { storyFlagsOf } = await import('./quests');
    const q = ok(TRAIL);
    const run = { flags: { ledger: 'given', intake_ledger: 'faced', complication: 'caper-watching', scouted: 'clean', 'guest.noa': 'yes', 'case.mini': 'thin' } } as unknown as QuestRun;
    expect(storyFlagsOf(q, run)).toEqual({ ledger: 'given', intake_ledger: 'faced', 'case.mini': 'thin' });
  });
  it("an accounts board's verdicts and the flags its cards cost carry too (Two Stories)", async () => {
    const { storyFlagsOf } = await import('./quests');
    const q = ok(TRAIL);
    const run = { flags: { 'story.rue': 'caught', 'story.rue-true': 'no', kade: 'told', clerk: 'burned', scouted: 'clean' } } as unknown as QuestRun;
    expect(storyFlagsOf(q, run, ['kade', 'clerk'])).toEqual({ 'story.rue': 'caught', 'story.rue-true': 'no', kade: 'told', clerk: 'burned' });
  });
});
