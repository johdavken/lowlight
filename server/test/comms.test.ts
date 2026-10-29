import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { ownedBy, parseQuestFile, parseRun } from '../../shared/quests';
import { DESK, JOB } from '../../shared/quests.fixture';
import { arrangementKey } from '../../shared/arrangement';
import { commsKey, parseComms } from '../../shared/comms';
import { at, intakeRelay, lastUser, parse } from './fixtures/intake-relay';
import { COMMS_BACK_INSTRUCTIONS, COMMS_HANGUP_INSTRUCTIONS, COMMS_TRAVEL_INSTRUCTIONS, LEAVE_INSTRUCTIONS, LIGHTS_LINE, TRAVEL_INSTRUCTIONS, TRAVEL_LINE } from '../src/instructions';

const withDeal = (r: ReturnType<typeof intakeRelay>) => r.db.setMeta(arrangementKey('hicks'), JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 0 }));
const comms = (r: ReturnType<typeof intakeRelay>) => parseComms(r.db.getMeta(commsKey('hicks')));
const rows = (r: ReturnType<typeof intakeRelay>) => r.db.recentMessages('hicks', 80);

describe('comms: going on and off', () => {
  it('commsCan: only with the deal in force', () => {
    const none = intakeRelay({ trust: 5 });
    expect(none.relay.commsCan('hicks')).toBe(false);
    const on = intakeRelay({ trust: 5 });
    withDeal(on);
    expect(on.relay.commsCan('hicks')).toBe(true);
    const back = intakeRelay({ trust: 4 });
    withDeal(back);
    expect(back.relay.commsCan('hicks')).toBe(false);
  });

  it('the travel row on comms carries the line; rewind before it takes it back', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    await r.relay.send('hicks', 'hm');
    const before = rows(r).at(-1)!;
    await r.relay.travel('hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'karasu/lowlight-intake' } });
    const row = rows(r).find((m) => m.mode === 'travel')!;
    expect(row.text).toBe("*hicks heads from Lowlight Intake to Hae's Noodles, Nix on the line.*");
    expect(comms(r)).toEqual({ on: true, at: 'karasu/lowlight-intake' });
    expect(r.relay.commsNow('hicks')).toEqual({ on: true, at: 'karasu/lowlight-intake' });
    await r.relay.rewind('hicks', before.id);
    expect(comms(r)?.on ?? false).toBe(false);
  });

  it('walking back to her ends the line on that travel row', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    await r.relay.travel('hicks', { from: "Hae's Noodles", to: 'Lowlight Intake', contact: 'Nix', comms: { on: false } });
    expect(rows(r).find((m) => m.mode === 'travel')!.text).toBe("*hicks heads from Hae's Noodles back to Nix at Lowlight Intake.*");
    expect(comms(r)).toEqual({ on: false });
  });

  it('HANG UP (LEAVE on comms) ends the line on the leave row; rewind before it puts her back on', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    await r.relay.travel('hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'karasu/lowlight-intake' } });
    const before = rows(r).at(-1)!;
    await r.relay.send('hicks', '', 'end', { leave: true });
    expect(comms(r)).toEqual({ on: false, at: 'karasu/lowlight-intake' });
    await r.relay.rewind('hicks', before.id);
    expect(comms(r)).toEqual({ on: true, at: 'karasu/lowlight-intake' });
  });
});

describe('comms: her prompt', () => {
  const on = (r: ReturnType<typeof intakeRelay>) => {
    withDeal(r);
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    r.deps.commsPlaces = () => ({ her: 'Lowlight Intake', you: "Hae's Noodles" });
  };
  const last = (r: ReturnType<typeof intakeRelay>) => lastUser(r.backend.reqs.at(-1)!);

  it('her [comms] line on comms, right after the time line; none off comms or out of character', async () => {
    const r = intakeRelay({ trust: 5 });
    on(r);
    await r.relay.send('hicks', 'what do you see');
    expect(last(r)).toContain("[comms] You're at Lowlight Intake — not at Hae's Noodles. You see and hear it through hicks's eyes; only hicks hears you. Write the people there as hicks sees them; write yourself only as a voice in hicks's ear, never with a body there.");
    expect(last(r).indexOf('[comms]')).toBeGreaterThan(last(r).indexOf('[time:'));
    const ooc = intakeRelay({ trust: 5 });
    on(ooc);
    await ooc.relay.send('hicks', 'brb', 'ooc');
    expect(last(ooc)).not.toContain('[comms]');
    const off = intakeRelay({ trust: 5 });
    await off.relay.send('hicks', 'hm');
    expect(last(off)).not.toContain('[comms]');
  });

  it('no lights rule on comms', async () => {
    const r = intakeRelay({ trust: 5 });
    on(r);
    await r.relay.send('hicks', 'hm');
    expect(last(r)).not.toContain(LIGHTS_LINE);
  });

  it('the travel turn on comms, and HANG UP, carry their own notes', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.deps.commsPlaces = () => ({ her: 'Lowlight Intake', you: "Hae's Noodles" });
    await r.relay.travel('hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'karasu/lowlight-intake' } });
    expect(last(r)).toContain(COMMS_TRAVEL_INSTRUCTIONS);
    await r.relay.send('hicks', '', 'end', { leave: true });
    expect(last(r)).toContain(COMMS_HANGUP_INSTRUCTIONS);
    expect(last(r)).not.toContain(LEAVE_INSTRUCTIONS);
  });
});

describe('comms: dropping the line', () => {
  /** Back Door at the Intake with Nix among its crew (not one of her own), its desk path run without a roll. */
  const job = parse(JOB.replace('tier: 2', 'tier: 1').replace('starts: haes-noodles', 'starts: lowlight-intake'), 'back-door');
  async function finish(r: ReturnType<typeof intakeRelay>) {
    await r.relay.startQuest('hicks', 'back-door');
    const run = () => parseRun(r.db.metaWithPrefix('quest.hicks.back-door@').at(-1)?.v ?? null)!;
    await r.relay.chooseQuest('hicks', { id: 'back-door', beat: run().beat!, choice: 'wait' });
    await r.relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: 'skim' });
  }
  const onComms = (r: ReturnType<typeof intakeRelay>) => {
    withDeal(r);
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    r.deps.commsPlaces = () => ({ her: 'Lowlight Intake', you: "Hae's Noodles" });
    r.deps.goSolo = vi.fn();
  };
  const DROP = "[comms — dropping] The trust isn't there right now: sign off this line, in your own words, and end it.";

  it('suspended on comms: one sign-off, then solo', async () => {
    const r = intakeRelay({ book: [job], trust: 5, sol: 0 });
    onComms(r);
    await finish(r);
    expect(lastUser(r.backend.reqs.at(-1)!)).toContain(DROP);
    expect(comms(r)).toEqual({ on: false, at: 'karasu/lowlight-intake' });
    expect(r.deps.goSolo).toHaveBeenCalledTimes(1);
  });

  it('no drop while the deal holds', async () => {
    const r = intakeRelay({ book: [job], trust: 5, sol: 1000 });
    onComms(r);
    await finish(r);
    expect(lastUser(r.backend.reqs.at(-1)!)).not.toContain('[comms — dropping]');
    expect(comms(r)).toEqual({ on: true, at: 'karasu/lowlight-intake' });
    expect(r.deps.goSolo).not.toHaveBeenCalled();
  });

  it('not a loop: after the drop, the next turn carries no sign-off', async () => {
    const r = intakeRelay({ book: [job], trust: 5, sol: 0 });
    onComms(r);
    await finish(r);
    await r.relay.send('hicks', 'hello?');
    expect(lastUser(r.backend.reqs.at(-1)!)).not.toContain('[comms');
    expect(r.deps.goSolo).toHaveBeenCalledTimes(1);
  });
});

describe('desk jobs (comms spec §3)', () => {
  const desk = parse(DESK, 'out-by-water');
  const deskRun = (r: ReturnType<typeof intakeRelay>) => parseRun(r.db.metaWithPrefix('quest.hicks.out-by-water@').at(-1)?.v ?? null)!;

  it('START plays the first beat and waits; in person at the stairs nothing; on comms there the next beat', async () => {
    const r = intakeRelay({ book: [desk], trust: 5 });
    withDeal(r);
    await r.relay.startQuest('hicks', 'out-by-water');
    await r.relay.chooseQuest('hicks', { id: 'out-by-water', beat: 'client', choice: 'send' });
    expect(deskRun(r).wait).toMatchObject({ at: 'ferry-stairs', comms: true });
    // The pick took the job's minutes: the wait opens after them.
    r.setClock(at(22, 40));
    r.setPlace('ferry-stairs');
    expect(await r.relay.playDueQuest('hicks')).toBeNull();
    expect(deskRun(r).beat).toBeNull();
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    await r.relay.playDueQuest('hicks');
    expect(deskRun(r).beat).toBe('stairs');
  });

  it('the QUEST row and her clients line name where', async () => {
    const r = intakeRelay({ book: [desk], trust: 5 });
    withDeal(r);
    expect(r.relay.questState('hicks').open.find((o) => o.id === 'out-by-water')!.mission).toMatchObject({ own: 'Nix', comms: 'ferry-stairs', trust: true });
    await r.relay.send('hicks', 'quiet night?');
    expect(lastUser(r.backend.reqs.at(-1)!)).toContain('Out by Water — A man needs the night ferry. (at ferry-stairs)');
  });
});

describe('mid review fixes', () => {
  it('I4: comms travel carries no "arrived together" line; walking back to her has its own note', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.deps.commsPlaces = () => ({ her: 'Lowlight Intake', you: "Hae's Noodles" });
    await r.relay.travel('hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'karasu/lowlight-intake' } });
    expect(lastUser(r.backend.reqs.at(-1)!)).not.toContain(TRAVEL_LINE);
    await r.relay.travel('hicks', { from: "Hae's Noodles", to: 'Lowlight Intake', contact: 'Nix', comms: { on: false } });
    const back = lastUser(r.backend.reqs.at(-1)!);
    expect(back).toContain(COMMS_BACK_INSTRUCTIONS);
    expect(back).not.toContain(TRAVEL_INSTRUCTIONS);
  });

  it('I6: her [comms] line says the room is not hers to touch', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    r.deps.commsPlaces = () => ({ her: 'Lowlight Intake', you: "Hae's Noodles" });
    await r.relay.send('hicks', 'hm');
    expect(lastUser(r.backend.reqs.at(-1)!)).toContain("The room's lights, sounds and doors aren't yours from there.");
  });

  it('I6: no liar\'s dice with her on the line', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.db.setMeta(commsKey('hicks'), JSON.stringify({ on: true, at: 'karasu/lowlight-intake' }));
    expect(r.relay.diceRefusal('hicks')).toBe("she's on comms: no dice across the line");
    const off = intakeRelay({ trust: 5 });
    expect(off.relay.diceRefusal('hicks')).toBeNull();
  });
});

describe('the shipped desk jobs (world/quests)', () => {
  const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
  const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
  const SHIPPED = [
    { id: 'customs-line', at: 'ferry-stairs' },
    { id: 'the-marker', at: 'low-roller' },
    { id: 'second-ledger', at: 'counting-house' },
  ];
  for (const s of SHIPPED) {
    it(`${s.id}: a desk job at ${s.at} that parses clean, can blow, and starts`, async () => {
      const r = parseQuestFile(s.id, fs.readFileSync(`world/quests/${s.id}.md`, 'utf8'), live as never);
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      expect(r.warnings).toEqual([]);
      const q = r.entry;
      expect(q).toMatchObject({ kind: 'mission', tier: 1, starts: 'lowlight-intake', posts: [1200, 120], trust: [1, 1], commsAt: s.at });
      expect(ownedBy(q)).toBe('nix-direct');
      const first = q.beats.get(q.first)!.flatMap((b) => b.choices);
      for (const c of first) for (const id of [c.to, c.close, c.fail].filter((x): x is string => !!x)) {
        const w = q.outcomes.get(id)?.wait;
        expect(w, `${s.id}: ${id} waits for comms there`).toMatchObject({ at: s.at, comms: true });
        expect(w!.by).not.toBeNull();
      }
      expect([...q.outcomes.values()].some((o) => o.effects.blown)).toBe(true);
      for (const c of [...q.beats.values()].flat().flatMap((b) => b.choices)) {
        if (c.tags.some((t) => t.kind === 'needs' && t.all.some((x) => x.kind === 'with'))) expect(c.check ?? c.crack ?? null, `${s.id}: ${c.id}`).not.toBeNull();
      }
      const relay = intakeRelay({ book: [q], trust: 5 });
      withDeal(relay);
      expect(await relay.relay.startQuest('hicks', s.id)).toMatchObject({ ok: true });
    });
  }
});

describe('final review fixes', () => {
  it('I5: a desk job lists only while her deal is in force (it can only be played on comms)', () => {
    const desk = parse(DESK, 'out-by-water');
    const none = intakeRelay({ book: [desk], trust: 5 });
    expect(none.relay.questState('hicks').open.map((o) => o.id)).not.toContain('out-by-water');
    const dealt = intakeRelay({ book: [desk], trust: 5 });
    withDeal(dealt);
    expect(dealt.relay.questState('hicks').open.map((o) => o.id)).toContain('out-by-water');
  });

  it('I1: HANG UP goes solo after her sign-off, once', async () => {
    const r = intakeRelay({ trust: 5 });
    withDeal(r);
    r.deps.goSolo = vi.fn();
    await r.relay.travel('hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'karasu/lowlight-intake' } });
    expect(r.deps.goSolo).not.toHaveBeenCalled();
    await r.relay.send('hicks', '', 'end', { leave: true });
    expect(r.deps.goSolo).toHaveBeenCalledTimes(1);
    // An ordinary LEAVE (not on comms) still waits for WALK OUT.
    const plain = intakeRelay({ trust: 5 });
    plain.deps.goSolo = vi.fn();
    await plain.relay.send('hicks', '', 'end', { leave: true });
    expect(plain.deps.goSolo).not.toHaveBeenCalled();
  });

  it('I4: the waiting card carries comms', async () => {
    const r = intakeRelay({ book: [parse(DESK, 'out-by-water')], trust: 5 });
    withDeal(r);
    await r.relay.startQuest('hicks', 'out-by-water');
    await r.relay.chooseQuest('hicks', { id: 'out-by-water', beat: 'client', choice: 'send' });
    expect(r.relay.questState('hicks').waiting).toMatchObject({ id: 'out-by-water', comms: true });
  });
});
