import { describe, expect, it } from 'vitest';
import { commsKey, parseComms } from './comms';

describe('comms state', () => {
  it('parseComms round-trips on and off; garbage is null', () => {
    expect(parseComms(JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }))).toEqual({ on: true, at: 'karasu/lowlight-intake' });
    expect(parseComms(JSON.stringify({ on: false }))).toEqual({ on: false });
    expect(parseComms(JSON.stringify({ on: false, at: 'karasu/x' }))).toEqual({ on: false, at: 'karasu/x' });
    expect(parseComms('{nope')).toBeNull();
    expect(parseComms(JSON.stringify({ on: true }))).toBeNull();
    expect(parseComms(null)).toBeNull();
    expect(commsKey('hicks')).toBe('comms.hicks');
  });
});

describe('desk jobs (comms spec §3)', async () => {
  const { parseQuestFile, waitDue } = await import('./quests');
  const { DESK, JOB } = await import('./quests.fixture');
  const parse = (text: string, places: Set<string> | null = null) => parseQuestFile('out-by-water', text, { roster: null, places });
  it('comms: <place> on her own job; the wait takes · comms', () => {
    const r = parse(DESK);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.commsAt).toBe('ferry-stairs');
    expect(r.entry.outcomes.get('sent')!.wait).toMatchObject({ at: 'ferry-stairs', comms: true });
  });
  it('problems: on a job that is not her own; an unknown place', () => {
    const notOwn = parse(JOB.replace('minutes: 30\n', 'minutes: 30\ncomms: ferry-stairs\n'));
    expect(notOwn.ok ? [] : notOwn.problems.map((p) => p.message)).toContainEqual(expect.stringMatching(/comms: goes only on a contact's own job/));
    const unknown = parse(DESK, new Set(['lowlight-intake', 'haes-noodles']));
    expect(unknown.ok ? [] : unknown.problems.map((p) => p.message)).toContainEqual(expect.stringMatching(/no place 'ferry-stairs'/));
  });
  it('waitDue: a comms wait is due only on comms at its place; past by, missed', () => {
    const w = { to: 'stairs', from: 0, at: 'ferry-stairs', ready: false, by: 100, else: 'missed', next: null, comms: true as const };
    expect(waitDue(w, { now: 10, placeId: 'ferry-stairs', ready: false, comms: false })).toBe('wait');
    expect(waitDue(w, { now: 10, placeId: 'ferry-stairs', ready: false, comms: true })).toBe('due');
    expect(waitDue(w, { now: 10, placeId: 'haes-noodles', ready: false, comms: true })).toBe('wait');
    expect(waitDue(w, { now: 200, placeId: 'ferry-stairs', ready: false, comms: true })).toBe('missed');
  });
});

describe('final review fixes', async () => {
  const { waitLine } = await import('./quests');
  it('I4: a comms wait says so on the panel', () => {
    const w = { to: 'stairs', from: 0, at: 'ferry-stairs', ready: false, by: 100, else: 'missed', next: null, comms: true as const };
    expect(waitLine(w, () => 'The Ferry Stairs')).toContain('on comms');
  });
});
