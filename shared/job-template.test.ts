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
