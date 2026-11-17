import { describe, expect, it } from 'vitest';
import { parseRun, toldKey, type QuestStatus } from '../../shared/quests';
import { intakeRelay, OWN_TEXT, parse } from './fixtures/intake-relay';

// Job texts (spec 2026-11-09 §2): a contact's text: job stays off every board until she has told you.
const TEXTED = parse(OWN_TEXT.replace('starts: lowlight-intake', 'starts: lowlight-intake\nafter: gate=yes\ntext: Come up the stairs tonight.'), 'held-papers');
const opener = (flags: Record<string, string>): QuestStatus => {
  const run = parseRun(JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags, done: true, at: 1, day: 1 }));
  if (!run) throw new Error('bad run');
  return { id: 'opener@1', contact: 'nix-direct', run };
};
function texted(o: { gate?: boolean; place?: string; contact?: string; heard?: boolean } = {}) {
  const t = intakeRelay({ book: [TEXTED], place: o.place, contact: o.contact, others: () => (o.gate === false ? [] : [opener({ gate: 'yes' })]) });
  if (o.heard !== false) t.relay['deps'].quests!.heard = (k: string) => t.db.getMeta(k) !== null;
  const tell = () => t.db.setMeta(toldKey('hicks', 'held-papers'), JSON.stringify({ how: 'text', at: 1 }));
  return { ...t, tell };
}

describe('a text: job on the boards', () => {
  it("untold, it's off HERE and ELSEWHERE and won't start; told, it's on both", async () => {
    const here = texted();
    expect(here.relay.questState('hicks').open.map((q) => q.id)).not.toContain('held-papers');
    const away = texted({ place: 'the-tilt', contact: 'vesna' });
    expect(away.relay.questState('hicks').boards ?? []).toEqual([]);
    here.tell();
    away.tell();
    expect(here.relay.questState('hicks').open.map((q) => q.id)).toContain('held-papers');
    expect(away.relay.questState('hicks').boards![0].jobs.map((j) => j.id)).toContain('held-papers');
  });
  it('an untold one does not start', async () => {
    const t = texted();
    await t.relay.startQuest('hicks', 'held-papers');
    expect(t.run()).toBeNull();
  });
  it('without heard, a text: job stays hidden (Review Focus 5)', () => {
    const t = texted({ heard: false });
    expect(t.relay.questState('hicks').open.map((q) => q.id)).not.toContain('held-papers');
  });
});

describe('jobTextsDue', () => {
  it("lists her own gated untold jobs; not before the gate, not once told, not once started", async () => {
    expect(texted({ gate: false }).relay.jobTextsDue('hicks')).toEqual([]);
    const t = texted();
    expect(t.relay.jobTextsDue('hicks')).toEqual([{ id: 'held-papers', title: 'Held Papers', text: 'Come up the stairs tonight.' }]);
    t.tell();
    expect(t.relay.jobTextsDue('hicks')).toEqual([]);
  });
  it("another contact's job isn't hers to send", () => {
    expect(texted({ contact: 'vesna', place: 'the-tilt' }).relay.jobTextsDue('hicks')).toEqual([]);
  });
});

// Job texts (spec §4): with her when the gate opens, she raises it on her next plain turn in character.
describe('raising it in the room', () => {
  const ROOM = '[something you need from hicks, to raise now, in your own words: Come up the stairs tonight.]';
  const prompt = (t: ReturnType<typeof texted>) => JSON.stringify(t.backend.reqs.at(-1)!.messages);
  it('her next plain turn carries the room line once, and her reply tells it', async () => {
    const t = texted();
    t.db.setMeta('toldseeded.hicks', '1');
    await t.relay.send('hicks', 'Evening.');
    expect(prompt(t)).toContain(JSON.stringify(ROOM).slice(1, -1));
    expect(JSON.parse(t.db.getMeta(toldKey('hicks', 'held-papers'))!)).toMatchObject({ how: 'room' });
    await t.relay.send('hicks', 'So?');
    expect(prompt(t)).not.toContain('to raise now');
    expect(t.relay.questState('hicks').open.map((q) => q.id)).toContain('held-papers');
  });
  it('the room line rides only plain in-character turns', async () => {
    const t = texted();
    await t.relay.send('hicks', 'brb', 'ooc');
    expect(prompt(t)).not.toContain('to raise now');
    expect(t.db.getMeta(toldKey('hicks', 'held-papers'))).toBeNull();
  });
});

// Final review (2026-11-09): a REGEN of her in-room ask, and saves from before job texts.
describe('the room path, reviewed', () => {
  it('a REGEN of the reply that raised it raises it again, and the job stays told (Important 1)', async () => {
    const t = texted();
    t.db.setMeta('toldseeded.hicks', '1');
    await t.relay.send('hicks', 'Evening.');
    const reply = t.db.recentMessages('hicks', 5, 'scene').at(-1)!;
    expect(await t.relay.regenerate('hicks', reply.id)).toMatchObject({ ok: true });
    expect(JSON.stringify(t.backend.reqs.at(-1)!.messages)).toContain('to raise now');
    t.db.rebuild();
    expect(JSON.parse(t.db.getMeta(toldKey('hicks', 'held-papers'))!)).toMatchObject({ how: 'room' });
    expect(t.relay.questState('hicks').open.map((q) => q.id)).toContain('held-papers');
  });
  it("a save the checker hasn't seeded yet raises nothing in the room (Important 3)", async () => {
    const t = texted();
    await t.relay.send('hicks', 'Evening.');
    expect(JSON.stringify(t.backend.reqs.at(-1)!.messages)).not.toContain('to raise now');
    expect(t.db.getMeta(toldKey('hicks', 'held-papers'))).toBeNull();
  });
});
