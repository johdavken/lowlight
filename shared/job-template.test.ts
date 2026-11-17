import { describe, expect, it } from 'vitest';
import { blowsOnMiss, blowUpSpread, offTemplate, rolledBeats } from './job-template';
import { parseQuestFile, type QuestEntry } from './quests';

const PAIRS: Record<1 | 2, string[][]> = { 1: [['cool', 'reflex'], ['body', 'wits'], ['body', 'tech']], 2: [['cool', 'reflex'], ['wits', 'tech'], ['body', 'cool'], ['tech', 'wits'], ['reflex', 'body']] };
const text = (o: { tier?: 1 | 2; beats?: number; checks?: number[]; take?: number; head?: string; patch?: (s: string) => string } = {}) => {
  const tier = o.tier ?? 1;
  const n = o.beats ?? (tier === 1 ? 3 : 5);
  const checks = o.checks ?? (tier === 1 ? [50, 50, 50] : [55, 55, 55, 50, 50]);
  const L = ['---', 'title: T', 'kind: mission', `tier: ${tier}`, `take-size: ${o.take ?? 4}`, 'starts: anywhere', 'after: null', `pay: ${tier === 1 ? '90-110' : '360-440'}`, ...(o.head ? [o.head] : []), '---', ''];
  for (let i = 0; i < n; i++) {
    const [a, b] = PAIRS[tier][i % PAIRS[tier].length];
    L.push(`# b${i}`, '', '*A beat.*', '', `- x: X. → o${i} / o${i} [check ${a} ${checks[i] ?? 50}]`, `- y: Y. → o${i} / o${i} [check ${b} ${checks[i] ?? 50}]`, '', `## o${i}`, '*On.*');
    L.push(...(i === n - 1 ? ['pay: full', 'take: full', '→ end', ''] : [`→ b${i + 1}`, '']));
  }
  const s = L.join('\n');
  return o.patch ? o.patch(s) : s;
};
const parse = (s: string) => {
  const r = parseQuestFile('t', s, { roster: null, places: null });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r;
};
const flags = (o: Parameters<typeof text>[0] = {}) => offTemplate(parse(text(o)).entry);

describe('tier templates (tier template spec §1)', () => {
  it('tier 3 wants the night: 7 beats, TAKE 6', () => {
    const line = (i: number, n: number) => `# b${i}\n\n*A.*\n\n- x: X. → o${i} / o${i} [check cool ${n}]\n- y: Y. → o${i} / o${i} [check ${i % 2 ? 'wits' : 'tech'} ${n}]\n\n## o${i}\n*On.*\n${i === 6 ? 'pay: full\n→ end' : `→ b${i + 1}`}\n`;
    const job = (nums: number[], extra = '') => parse(`---\ntitle: T\nkind: mission\ntier: 3\nstarts: anywhere\nafter: null\npay: 1000-1200\n---\n\n${nums.map((n, i) => line(i, n)).join('\n')}`.replace('- y: Y. → o2 / o2', `${extra}- y: Y. → o2 / o2`)).entry;
    const fair = [55, 55, 55, 50, 50, 50, 50];
    expect(offTemplate(job(fair)).filter((f) => !/covers every beat/.test(f))).toEqual([]);
    expect(offTemplate(job([...fair.slice(0, 6), 45]))).toContain('beat b6: check 45, tier 3 wants 50');
    // An angle's card is a third card the file adds: it doesn't count against the beat's two.
    expect(offTemplate(job(fair, '- z: Z. → o2 / o2 [check cool 55 angle]\n')).filter((f) => /rolled cards|two cards/.test(f))).toEqual([]);
  });
  it('a job to template has no flags, at either tier', () => expect([flags(), flags({ tier: 2 })]).toEqual([[], []]));
  it('flags the rolled beats', () => expect(flags({ beats: 2 })).toContain('2 rolled beats, tier 1 wants 3'));
  it('flags a check number', () => expect(flags({ checks: [50, 55, 50] })).toContain('beat b1: check 55, tier 1 wants 50'));
  it('flags a beat with one rolled card', () => expect(flags({ patch: (s) => s.replace('- y: Y. → o1 / o1 [check wits 50]', '- y: Y. → o1') })).toContain('beat b1: 1 rolled cards, wants 2'));
  it('flags two cards on a stat', () => expect(flags({ patch: (s) => s.replace('[check body 50]', '[check wits 50]') })).toContain('beat b1: two cards on WITS'));
  it('flags an approach covering every beat', () => expect(flags({ patch: (s) => s.replace('o2 / o2 [check body 50]', 'o2 / o2 [check cool 50]') }).join()).toMatch(/covers every beat/));
  const blow = (s: string, i: number) => s.replace(`## o${i}\n*On.*`, `## o${i}\n*On.*`).replace(`- x: X. → o${i} / o${i}`, `- x: X. → o${i} / caught`) + '\n## caught\n*Caught.*\ntake: none\nblown\n→ end\n';
  it('a blow-up on the last beat is fine', () => expect(flags({ patch: (s) => blow(s, 2) })).toEqual([]));
  it('flags a blow-up before the last beat', () => expect(flags({ patch: (s) => blow(s, 0) }).join()).toContain('a blow-up before the last beat (b0)'));
  it('flags two blow-ups', () => expect(flags({ patch: (s) => blow(blow(s, 2).replace('\n## caught\n*Caught.*\ntake: none\nblown\n→ end\n', ''), 1) }).join()).toContain('2 blow-ups'));
  it('flags pay off the tier', () => expect(flags({ patch: (s) => s.replace('pay: 90-110', 'pay: 50-150') })).toContain('pay 50-150, tier 1 wants 90-110'));
  it('flags TAKE, an effect tag and a heat: line', () => {
    expect(flags({ take: 3 })).toContain('TAKE 3, tier 1 wants 4');
    expect(flags({ patch: (s) => s.replace('[check cool 50]', '[check cool 50, big]') })).toContain('beat b0: an effect tag');
    expect(flags({ patch: (s) => s.replace('## o0\n*On.*', '## o0\n*On.*\nheat: +1') })).toContain('outcome o0: heat: does nothing in a job');
  });
  it('an `if` variant of a beat counts as that beat', () => {
    const q = parse(text({ patch: (s) => s.replace('# b1\n', '# b1 if alarm>=3\n\n*A loud beat.*\n\n- x: X. → o1\n- y: Y. → o1\n\n# b1\n') })).entry;
    expect(rolledBeats(q).map((b) => b.id)).toEqual(['b0', 'b1', 'b2']);
  });
  it('a template job warns in the parse; another job does not', () => {
    expect(parse(text({ beats: 2, head: 'template: true' })).warnings).toContain('2 rolled beats, tier 1 wants 3');
    expect(parse(text({ beats: 2 })).warnings).toEqual([]);
  });
  it('a template job reads template: true', () => expect(parse(text({ head: 'template: true' })).entry.template).toBe(true));
});

describe('blowUpSpread (approach shapes spec §2)', () => {
  /** A job of one beat: two cards, a miss on either blows it unless `soft`. */
  const job = (stats: string[], o: { tier?: number; id?: string; soft?: boolean } = {}) =>
    ({
      tier: o.tier ?? 2,
      beats: new Map([[o.id ?? 'out', [{ choices: stats.map((stat, i) => ({ id: `c${i}`, fail: 'lost', check: { stat } })) }]]]),
      outcomes: new Map([['lost', { effects: o.soft ? { take: 'part' } : { blown: true } }]]),
    }) as unknown as QuestEntry;

  it("flags a stat on more than two thirds of a tier's blow-up beats", () => {
    expect(blowUpSpread([job(['cool', 'body']), job(['cool', 'reflex']), job(['cool', 'wits'])])).toEqual([{ tier: 2, stat: 'cool', on: 3, of: 3 }]);
  });
  it('two of three is fine', () => {
    expect(blowUpSpread([job(['cool', 'body']), job(['cool', 'reflex']), job(['tech', 'wits'])])).toEqual([]);
  });
  it('a soft beat, a push beat and another tier do not count', () => {
    expect(blowUpSpread([job(['cool', 'body']), job(['cool', 'wits'], { soft: true }), job(['cool', 'wits'], { id: 'push-1' }), job(['tech', 'wits']), job(['tech', 'reflex']), job(['cool', 'wits'], { tier: 1 }), job(['body', 'wits'], { tier: 1 }), job(['body', 'tech'], { tier: 1 })]).filter((r) => r.stat === 'cool')).toEqual([]);
  });
});

describe('blowsOnMiss', () => {
  it('is true for a card whose fail takes nothing or is blown, false for the rest', () => {
    const q = parse(text({ patch: (x) => x.replace('- x: X. → o2 / o2', '- x: X. → o2 / gone').replace(/(## o2\n\*On\.\*\npay: full\ntake: full\n→ end\n)/, '$1\n## gone\n*Gone.*\ntake: none\n→ end\n') })).entry;
    const last = q.beats.get('b2')![0].choices;
    expect(last.map((c) => blowsOnMiss(q, c))).toEqual([true, false]);
    expect(q.beats.get('b0')![0].choices.map((c) => blowsOnMiss(q, c))).toEqual([false, false]);
  });
});

import { outcomeFor, type CondCtx } from './quests';

describe('outcome versions (routes and posts spec §1)', () => {
  const ctx = (flags: Record<string, string> = {}): CondCtx => ({ flags, trust: 'mid', warmth: 'mid', with: 'hicks' });
  const versioned = (s: string) => s.replace('## o2\n*On.*\npay: full\ntake: full\n→ end', '## o2\n*On.*\npay: full\ntake: full\n→ end\n\n## caught if post.door\n*Out, rough.*\ntake: part\n→ end\n\n## caught\n*Caught.*\ntake: none\n→ end').replace('- y: Y. → o2 / o2', '- y: Y. → o2 / caught');
  const problems = (s: string) => {
    const r = parseQuestFile('t', s, { roster: null, places: null });
    return r.ok ? [] : r.problems.map((p) => `${p.field}: ${p.message}`);
  };
  it('reads outcome versions, the plain one last', () => {
    const q = parse(text({ patch: versioned })).entry;
    expect(q.outcomes.get('caught')!.effects.take).toBe('none');
    expect(q.outcomes.get('caught')!.versions).toHaveLength(1);
    expect(outcomeFor(q, 'caught', ctx({ 'post.door': 'yes' }))!.effects.take).toBe('part');
    expect(outcomeFor(q, 'caught', ctx())!.effects.take).toBe('none');
    expect(outcomeFor(q, 'nope', ctx())).toBeUndefined();
  });
  it('refuses an outcome version with no plain one after it', () => {
    expect(problems(text({ patch: (s) => versioned(s).replace('\n\n## caught\n*Caught.*\ntake: none\n→ end', '') }))).toContain('caught: needs a last version without `if` (the default)');
  });
  it('refuses a plain outcome before a version', () => {
    const swapped = (s: string) => versioned(s).replace('## caught if post.door', '## caught-x').replace('\n## caught\n', '\n## caught if post.door\n').replace('## caught-x', '## caught');
    expect(problems(text({ patch: swapped }))).toContain('caught: the version without `if` must be the last one, and there can be only one');
  });
  it('a miss blows the job unless the version that plays keeps a take', () => {
    const q = parse(text({ patch: versioned })).entry;
    const card = q.beats.get('b2')!.at(-1)!.choices.find((c) => c.id === 'y')!;
    expect(blowsOnMiss(q, card)).toBe(true);
    expect(blowsOnMiss(q, card, ctx())).toBe(true);
    expect(blowsOnMiss(q, card, ctx({ 'post.door': 'yes' }))).toBe(false);
  });
});

import { beatTitle, jobPosts, type Beat } from './quests';

describe('post lines and beat titles (routes and posts spec §2)', () => {
  const problems = (s: string) => {
    const r = parseQuestFile('t', s, { roster: null, places: null });
    return r.ok ? [] : r.problems.map((p) => p.message);
  };
  const POST = 'post door: Someone holds the service door. [suits muscle]\ngives door: The way out stays open.';
  /** Tier 2's five beats: a post on b1, read by a version of the last miss, which hurts whoever holds it. */
  const posted = (o: { post?: string; harm?: string; read?: boolean; on?: string } = {}) =>
    text({
      tier: 2,
      patch: (s) =>
        s
          .replace(`# ${o.on ?? 'b1'}\n\n*A beat.*`, `# ${o.on ?? 'b1'}\n\ntitle: The Stairwell\n${o.post ?? POST}\n\n*A beat.*`)
          .replace('- y: Y. → o4 / o4', '- y: Y. → o4 / caught')
          .replace('## o4\n', `${o.read === false ? '' : `## caught if post.door\n*Out, rough.*\ntake: part\n${o.harm ?? 'post door: hurt'}\n→ end\n\n`}## caught\n*Caught.*\ntake: none\n→ end\n\n## o4\n`),
    });
  it('reads a post, its promise and what suits it', () => {
    const q = parse(posted()).entry;
    expect(q.beats.get('b1')!.at(-1)!.post).toEqual({ id: 'door', line: 'Someone holds the service door.', gives: 'The way out stays open.', suits: 'muscle' });
    expect(jobPosts(q).map((p) => p.id)).toEqual(['door']);
  });
  it('reads a post that suits nobody in particular', () => {
    expect(parse(posted({ post: 'post door: Someone holds the door.\ngives door: The way out stays open.' })).entry.beats.get('b1')!.at(-1)!.post).toEqual({ id: 'door', line: 'Someone holds the door.', gives: 'The way out stays open.' });
  });
  it('reads the harm line on an outcome', () => {
    const q = parse(posted()).entry;
    expect(q.outcomes.get('caught@0')!.effects.postHarm).toEqual({ post: 'door', harm: 'hurt' });
    expect(parse(posted({ harm: 'post door: held' })).entry.outcomes.get('caught@0')!.effects.postHarm).toEqual({ post: 'door', harm: 'held' });
  });
  it('titles a beat', () => {
    const q = parse(posted()).entry;
    expect(beatTitle(q.beats.get('b1')!.at(-1)!)).toBe('THE STAIRWELL');
    expect(beatTitle({ id: 'the-floor' } as Beat)).toBe('THE FLOOR');
    expect(q.beats.get('b1')!.at(-1)!.text).toBe('*A beat.*');
  });
  it.each([
    ['a post with no gives line', posted({ post: 'post door: Someone holds the door.' }), "post door needs a 'gives door:' line"],
    ['suits that is not a specialty', posted({ post: 'post door: Someone holds the door. [suits wizard]\ngives door: Out.' }), "suits: 'wizard' isn't a specialty"],
    ['two posts on one beat', posted({ post: `${POST}\npost desk: Someone talks.\ngives desk: Talk.` }), 'one post on a beat'],
    ['a harm line for a post the job has not got', posted({ harm: 'post desk: hurt' }), "no post 'desk' in this file"],
    ['a post nothing reads', posted({ read: false }), 'post door: no later beat or outcome reads post.door'],
    ['a post on a push beat or the getaway', text({ tier: 2, patch: (s) => s + `\n# push-1\n\n${POST}\n\n*More.*\n\n- a: A. → won / lost1 [check cool 55]\n- b: B. → won / lost1 [check wits 55]\n\n## won\n*Won.*\npay: +50\n→ end\n\n## lost1\n*Lost.*\nlost\n→ end\n` }), 'a post goes on a rolled beat'],
  ])('refuses %s', (_n, file, message) => expect(problems(file)).toContain(message));
  it('refuses three posts in a job', () => {
    const three = posted()
      .replace('# b2\n\n*A beat.*', '# b2\n\npost desk: Someone talks.\ngives desk: Talk.\n\n*A beat.*')
      .replace('# b3\n\n*A beat.*', '# b3\n\npost roof: Someone watches.\ngives roof: Eyes.\n\n*A beat.*');
    expect(problems(three)).toContain('at most two posts in a job');
  });
  it('a job with no posts has none', () => expect(jobPosts(parse(text()).entry)).toEqual([]));
});

import { paths } from './job-template';

describe('the template per path (routes and posts spec §1)', () => {
  const beat = (id: string, a: string, b: string, n: number, to: string, o: { head?: string; tagA?: string; tagB?: string; idA?: string; idB?: string; toA?: string; toB?: string } = {}) =>
    `# ${id}\n\n*A beat.*\n\n- ${o.idA ?? 'x'}: X. → ${o.toA ?? `${id}-o`} / ${o.toA ?? `${id}-o`} [check ${a} ${n}${o.tagA ?? ''}]\n- ${o.idB ?? 'y'}: Y. → ${o.toB ?? `${id}-o`} / ${o.toB ?? `${id}-o`} [check ${b} ${n}${o.tagB ?? ''}]\n\n${o.toA ? '' : `## ${id}-o\n*On.*\n→ ${to}\n`}`;
  /** Tier 2, forked at the lobby: charm → desk → floor-front, stairs → stairwell → floor-back, then closet and out for both. */
  const forked = (o: { closet?: string; short?: boolean } = {}) =>
    [
      '---\ntitle: T\nkind: mission\ntier: 2\ntake-size: 4\nstarts: anywhere\nafter: null\npay: 360-440\n---\n',
      beat('lobby', 'cool', 'reflex', 55, '', { idA: 'charm', idB: 'stairs', toA: 'front', toB: 'back', tagA: ', set route=front', tagB: ', set route=back' }),
      '## front\n*Front.*\n→ desk\n',
      `## back\n*Back.*\n→ ${o.short ? 'floor-back' : 'stairwell'}\n`,
      beat('desk', 'wits', 'reflex', 55, 'floor-front'),
      beat('floor-front', 'cool', 'body', 55, 'closet'),
      ...(o.short ? [] : [beat('stairwell', 'body', 'wits', 55, 'floor-back')]),
      beat('floor-back', 'tech', 'reflex', 55, 'closet'),
      beat('closet', 'tech', o.closet ?? 'body', 50, 'out'),
      '# out if route=front\n\n*Past the glass.*\n\n- x: X. → home / home [check cool 50]\n- y: Y. → home / home [check tech 50]\n',
      '# out\n\n*The stair.*\n\n- x: X. → home / home [check reflex 50]\n- y: Y. → home / home [check body 50]\n\n## home\n*Out.*\npay: full\ntake: full\n→ end\n',
    ].join('\n');
  const entry = (s: string) => parse(s).entry;
  it('finds both routes of a forked job', () => {
    const ps = paths(entry(forked()));
    expect(ps.map((p) => p.via)).toEqual(['charm', 'stairs']);
    expect(ps.map((p) => p.beats.map((b) => b.id))).toEqual([
      ['lobby', 'desk', 'floor-front', 'closet', 'out'],
      ['lobby', 'stairwell', 'floor-back', 'closet', 'out'],
    ]);
  });
  it('judges a beat version by the flags the route set', () => {
    const [front, back] = paths(entry(forked()));
    const stats = (p: typeof front) => p.beats.at(-1)!.versions.map((v) => v.choices.map((c) => c.check!.stat));
    expect(stats(front)).toEqual([['cool', 'tech']]);
    expect(stats(back)).toEqual([['reflex', 'body']]);
  });
  it('a forked job to template has no flags', () => expect(offTemplate(entry(forked()))).toEqual([]));
  it('flags a route one beat short', () => expect(offTemplate(entry(forked({ short: true })))).toContain('via stairs: 4 rolled beats, tier 2 wants 5'));
  it('judges an approach per path', () => {
    const lines = offTemplate(entry(forked({ closet: 'wits' })));
    expect(lines).toContain('via charm: SMOOTH covers every beat');
    expect(lines.filter((l) => /^via stairs: .*covers every beat/.test(l))).toEqual([]);
  });
  it('a job with one path has one, and its lines carry no prefix', () => {
    const q = entry(text({ tier: 2 }));
    expect(paths(q).map((p) => p.via)).toEqual([null]);
    expect(offTemplate(entry(text({ tier: 2, beats: 4 })))).toContain('4 rolled beats, tier 2 wants 5');
  });
  it('refuses a route that loops', () => {
    const loop = forked().replace('→ closet\n', '→ lobby\n');
    expect(offTemplate(entry(loop))).toContain('a route loops back to lobby');
  });
});
