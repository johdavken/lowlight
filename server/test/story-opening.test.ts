import { describe, expect, it } from 'vitest';
import { intakeRelay, OWN_TEXT, parse } from './fixtures/intake-relay';

// The arrival screen's STORY (2026-11-11): a for: job's authored opening, and why you're here, told to her.
const SCENE = 'Her message came at six: three words, "Come up tonight."';
const VIEW = 'You asked him up tonight about the papers.';
const STORY = parse(OWN_TEXT.replace('starts: lowlight-intake', `starts: lowlight-intake\nfor: hicks\nopening: '${SCENE}'\nopening-view: ${VIEW}`), 'held-papers');
const prompt = (t: ReturnType<typeof intakeRelay>) => JSON.stringify(t.backend.reqs.at(-1)!.messages);
const RAISE = '[why hicks is here tonight, to raise now, in your own words: You asked him up tonight about the papers.]';
const HELD = '[why hicks is here tonight: You asked him up tonight about the papers.]';

describe('storyFor', () => {
  it("answers her job's story for its player on a new game", () => {
    expect(intakeRelay({ book: [STORY] }).relay.storyFor('hicks')).toEqual({ job: 'held-papers', text: SCENE });
  });
  it('none for another player, another contact, or a game already under way', async () => {
    expect(intakeRelay({ book: [STORY] }).relay.storyFor('ember')).toBeNull();
    expect(intakeRelay({ book: [STORY], contact: 'vesna' }).relay.storyFor('hicks')).toBeNull();
    const t = intakeRelay({ book: [STORY] });
    await t.relay.send('hicks', 'Evening.');
    expect(t.relay.storyFor('hicks')).toBeNull();
  });
});

describe('greet with a story', () => {
  it("saves the job's own opening with its id, whatever was typed", async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', 'typed text', 'held-papers');
    const scene = t.db.recentMessages('hicks', 10).find((m) => m.mode === 'scene')!;
    expect(scene.text).toBe(SCENE);
    expect(scene.scene).toMatchObject({ job: 'held-papers' });
  });
  it('a stale or wrong id falls back to what was typed, with no job', async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', 'typed text', 'not-a-job');
    const scene = t.db.recentMessages('hicks', 10).find((m) => m.mode === 'scene')!;
    expect(scene.text).toBe('typed text');
    expect(scene.scene?.job).toBeUndefined();
  });
  it('her greeting raises it, a later turn holds it without raising, and an OOC aside hears neither', async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', undefined, 'held-papers');
    expect(prompt(t)).toContain(JSON.stringify(RAISE).slice(1, -1));
    await t.relay.send('hicks', 'Evening.');
    expect(prompt(t)).toContain(JSON.stringify(HELD).slice(1, -1));
    expect(prompt(t)).not.toContain('to raise now');
    await t.relay.send('hicks', 'brb', 'ooc');
    expect(prompt(t)).not.toContain('why hicks is here tonight');
  });
  it("her greeting's reply carries the job's line in the chat, once, even on a REGEN", async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', undefined, 'held-papers');
    const reply = () => t.db.recentMessages('hicks', 10).filter((m) => m.role === 'agent').at(-1)!;
    expect(reply().toolLines).toEqual(['// HELD PAPERS · NOW ON JOBS (ALT+Q)']);
    expect(t.events.some((e) => e.type === 'tool_line' && e.text === '// HELD PAPERS · NOW ON JOBS (ALT+Q)')).toBe(true);
    expect(await t.relay.regenerate('hicks', reply().id)).toMatchObject({ ok: true });
    expect(reply().toolLines.filter((l) => l.includes('NOW ON JOBS'))).toHaveLength(1);
    await t.relay.send('hicks', 'Evening.');
    expect(reply().toolLines).toEqual([]);
  });
  it('a typed opening tells her nothing of the job', async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', 'We meet by chance.');
    expect(prompt(t)).not.toContain('why hicks is here tonight');
  });
  it('once the job has started the line is gone', async () => {
    const t = intakeRelay({ book: [STORY] });
    await t.relay.greet('hicks', undefined, 'held-papers');
    t.db.setMeta('quest.hicks.held-papers@1', JSON.stringify({ beat: 'a', variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1, day: 1 }));
    expect(t.relay.storyFor('hicks')).toBeNull();
    await t.relay.send('hicks', 'Evening.', 'ooc');
    await t.relay.send('hicks', 'Evening.');
    expect(prompt(t)).not.toContain('why hicks is here tonight');
  });
});
