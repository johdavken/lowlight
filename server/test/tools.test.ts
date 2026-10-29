import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { Room, type RoomScenes } from '../src/room-state';
import type { RoomSoundDef } from '../../shared/types';
import { SceneRegistry } from '../src/scenes';
import { dispatchTool, toolsFor, type ToolContext } from '../src/tools';
import { generateScenes } from '../../tools/gen-placeholders';
import { standingControl } from '../src/standing';
import { DEFAULT_SHARED_STANDING, type StandingValues } from '../../shared/standing';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Nix mid-reply (r1) to hicks; she knows of Cass and Vee, and hicks already knows Vee. */
function setup(o: { replyId?: string | null } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
  const lines: string[] = [];
  const ctx: ToolContext = {
    room: new Room(registry),
    journal: new Journal(db),
    player: () => 'hicks',
    expressions: null,
    self: ['nix', 'Nix'],
    replyId: () => (o.replyId === undefined ? 'r1' : o.replyId),
    toolLine: (t) => lines.push(t),
    share: (r) => db.shareContact(r),
    contacts: {
      list: () => [
        { id: 'nix', name: 'Nix', pronoun: 'she' as const },
        { id: 'cass', name: 'Cass', pronoun: 'she' as const },
        { id: 'vee', name: 'Vee', pronoun: 'they' as const },
      ],
      isKnown: (id) => id === 'nix' || id === 'vee',
    },
  };
  return { db, ctx, lines };
}

const share = (ctx: ToolContext, args: unknown) => dispatchTool(ctx, 'share_contact', args, 'agent');
const rows = (db: Db) => db.sharedContacts('hicks');

describe('share_contact', () => {
  it('share_contact writes a row and a tool line', () => {
    const { db, ctx, lines } = setup();
    const result = share(ctx, { who: 'CASS', how: 'gave you her number' });
    expect(result.ok).toBe(true);
    expect(rows(db)).toEqual([{ contactId: 'cass', messageId: 'r1', how: 'gave you her number', at: expect.any(Number) }]);
    expect(lines).toEqual(['Nix shared a contact: CASS']);
  });

  it('matches the name as the list gives it, with its pronoun', () => {
    const { db, ctx } = setup();
    expect(share(ctx, { who: 'Cass (she)' }).ok).toBe(true);
    expect(rows(db).map((r) => r.contactId)).toEqual(['cass']);
  });

  it('the tool line names her; without a self it says Someone, never She', () => {
    const { ctx, lines } = setup();
    share({ ...ctx, self: undefined }, { who: 'Cass' });
    expect(lines).toEqual(['Someone shared a contact: CASS']);
  });

  it('a how over 120 characters is cut at a word, not refused (a refusal made GLM rewrite its reply)', () => {
    const { db, ctx } = setup();
    const how = `${'told you where she drinks '.repeat(8)}end`;
    const r = share(ctx, { who: 'Cass', how });
    expect(r.ok).toBe(true);
    const saved = rows(db)[0]!.how!;
    expect(saved.length).toBeLessThanOrEqual(120);
    expect(how.startsWith(saved)).toBe(true);
  });

  it('matches an id as well as a name', () => {
    const { db, ctx } = setup();
    expect(share(ctx, { who: 'cass' }).ok).toBe(true);
    expect(rows(db)).toMatchObject([{ contactId: 'cass', how: null }]);
  });

  it('refuses herself', () => {
    const { db, ctx, lines } = setup();
    expect(share(ctx, { who: 'Nix' })).toEqual({ ok: false, error: "that's you" });
    expect(rows(db)).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('refuses a fixed resident (hae)', () => {
    const { db, ctx } = setup();
    expect(share(ctx, { who: 'hae' })).toEqual({ ok: false, error: "no contact 'hae'" });
    expect(rows(db)).toEqual([]);
  });

  it('refuses an unknown name', () => {
    const { ctx, lines } = setup();
    expect(share(ctx, { who: 'Zed' })).toEqual({ ok: false, error: "no contact 'Zed'" });
    expect(lines).toEqual([]);
  });

  it('already known writes nothing', () => {
    const { db, ctx, lines } = setup();
    expect(share(ctx, { who: 'Vee' })).toEqual({ ok: true, text: 'already known' });
    expect(rows(db)).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('refuses outside a reply (no message to tie the share to)', () => {
    const { db, ctx } = setup({ replyId: null });
    expect(share(ctx, { who: 'Cass' }).ok).toBe(false);
    expect(rows(db)).toEqual([]);
  });

  it('is offered only with someone else to introduce, and lists them by name', () => {
    const { ctx } = setup();
    const tool = toolsFor(ctx).find((t) => t.name === 'share_contact')!;
    expect(tool.readOnly).toBe(false);
    expect(tool.description).toContain('Cass (she), Vee (they)');
    expect(tool.description).not.toContain('her number');
    expect(tool.description).not.toContain('Nix,');
    const alone = { ...ctx, contacts: { list: () => [{ id: 'nix', name: 'Nix', pronoun: 'she' as const }], isKnown: () => true } };
    expect(toolsFor(alone).map((t) => t.name)).not.toContain('share_contact');
    const { contacts: _, ...none } = ctx;
    expect(toolsFor(none).map((t) => t.name)).not.toContain('share_contact');
  });
});

describe('play_sound', () => {
  const sounds: RoomSoundDef[] = [
    { name: 'kettle', src: 'sound/keep/kettle.ogg', agent: { about: 'the kettle on the stove clicking off' } },
    { name: 'door', src: 'sound/keep/door.ogg', agent: { about: "the shop door's bell" } },
    { name: 'train', src: 'sound/keep/train.ogg', timer: { min: 3, max: 8 } },
  ];
  /** The registry with the first room given `list` as its sounds. */
  const scenesWith = (list: RoomSoundDef[]): RoomScenes => {
    const first = registry.first();
    const withSounds = { ...first, sound: { ...first.sound, sounds: list } };
    return { get: (id) => (id === first.id ? withSounds : registry.get(id)), list: () => registry.list().map((s) => (s.id === first.id ? withSounds : s)), first: () => withSounds };
  };
  function soundSetup(list = sounds, replyId: string | null = 'r1') {
    const base = setup({ replyId });
    let reply = replyId;
    const played: [string, string][] = [];
    const ctx: ToolContext = { ...base.ctx, room: new Room(scenesWith(list)), replyId: () => reply, playSound: (scene, name) => played.push([scene, name]) };
    return { ...base, ctx, played, setReply: (r: string | null) => (reply = r) };
  }
  const play = (ctx: ToolContext, name: string) => dispatchTool(ctx, 'play_sound', { name }, 'agent');

  it("is offered with the room's agent sounds in its description, and get_room lists them", () => {
    const { ctx } = soundSetup();
    const tool = toolsFor(ctx).find((t) => t.name === 'play_sound');
    expect(tool?.description).toBe("Play a sound in the room when the story makes it: kettle (the kettle on the stove clicking off), door (the shop door's bell).");
    expect(ctx.room.describe().split('\n').at(-1)).toBe("Sounds you can play: kettle (the kettle on the stove clicking off), door (the shop door's bell).");
  });

  it('is not offered in a room with no agent sounds; get_room says nothing of sounds', () => {
    const { ctx } = soundSetup([sounds[2]]);
    expect(toolsFor(ctx).map((t) => t.name)).not.toContain('play_sound');
    expect(ctx.room.describe()).not.toContain('Sounds you can play');
  });

  it('plays a sound by name (any case): the event and a ♪ tool line', () => {
    const { ctx, played, lines } = soundSetup();
    expect(play(ctx, 'Kettle').ok).toBe(true);
    expect(played).toEqual([[registry.first().id, 'kettle']]);
    expect(lines).toEqual(['♪ kettle']);
  });

  it("an unknown or timer-only sound is an error listing the room's sounds", () => {
    const { ctx, played, lines } = soundSetup();
    expect(play(ctx, 'train')).toEqual({ ok: false, error: "no sound 'train' here; the room's sounds: kettle, door" });
    expect(play(ctx, 'nope')).toEqual({ ok: false, error: "no sound 'nope' here; the room's sounds: kettle, door" });
    expect(played).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('a regenerated take (same message id, a new turn) may play the sound the old take played (final review)', () => {
    const { ctx, played } = soundSetup(sounds, 'r-regen');
    let turn = 1;
    const withTurn: ToolContext = { ...ctx, replyTurn: () => turn };
    expect(play(withTurn, 'kettle').ok).toBe(true);
    expect(play(withTurn, 'kettle').ok).toBe(false);
    turn = 2;
    expect(play(withTurn, 'kettle').ok).toBe(true);
    expect(played).toHaveLength(2);
  });

  it('the same sound twice in one reply is refused; a new reply plays it again; the dev panel (no reply) may repeat', () => {
    // Reply ids are message ids, unique in the app: this test's own, so another test's plays don't count.
    const { ctx, played, setReply } = soundSetup(sounds, 'r-repeat');
    expect(play(ctx, 'kettle').ok).toBe(true);
    expect(play(ctx, 'kettle')).toEqual({ ok: false, error: "already played 'kettle' this reply" });
    expect(play(ctx, 'door').ok).toBe(true);
    setReply('r2');
    expect(play(ctx, 'kettle').ok).toBe(true);
    setReply(null);
    expect(play(ctx, 'kettle').ok).toBe(true);
    expect(play(ctx, 'kettle').ok).toBe(true);
    expect(played).toHaveLength(5);
  });
});

describe('pass_time', () => {
  const withClock = () => {
    const { ctx } = setup();
    const pass = vi.fn((m: number) => 1205 + m);
    return { ctx: { ...ctx, clock: { now: () => 1205, pass } } as ToolContext, pass };
  };
  it('moves the clock by minutes, or to the next HH:MM', () => {
    const a = withClock();
    expect(dispatchTool(a.ctx, 'pass_time', { minutes: 90 }, 'agent')).toEqual({ ok: true, text: 'time passed: now Day 1, Thu 21:35' });
    expect(a.pass).toHaveBeenCalledWith(90);
    const b = withClock();
    expect(dispatchTool(b.ctx, 'pass_time', { until: '07:00' }, 'agent')).toEqual({ ok: true, text: 'time passed: now Day 2, Fri 07:00' });
    expect(b.pass).toHaveBeenCalledWith(1440 + 420 - 1205);
  });
  it('is offered also for a reply that moves to a later hour (time backstop 2026-10-20)', () => {
    const t = toolsFor(withClock().ctx).find((x) => x.name === 'pass_time')!;
    expect(t.description).toContain('or your reply moves to a later hour');
  });
  it('one of minutes or until, in range; nothing moves otherwise', () => {
    const a = withClock();
    expect(dispatchTool(a.ctx, 'pass_time', { minutes: 5, until: '07:00' }, 'agent')).toEqual({ ok: false, error: 'give minutes (1–1440) or until (HH:MM), not both' });
    expect(dispatchTool(a.ctx, 'pass_time', {}, 'agent')).toEqual({ ok: false, error: 'give minutes (1–1440) or until (HH:MM), not both' });
    expect(dispatchTool(a.ctx, 'pass_time', { until: '7am' }, 'agent')).toEqual({ ok: false, error: 'until must be HH:MM' });
    expect(dispatchTool(a.ctx, 'pass_time', { minutes: 0 }, 'agent').ok).toBe(false);
    expect(a.pass).not.toHaveBeenCalled();
  });
  it('outside a story (no clock) she has no pass_time; mid-turn without a stamp it refuses', () => {
    const { ctx } = setup();
    expect(toolsFor(ctx).map((t) => t.name)).not.toContain('pass_time');
    const off = { ...ctx, clock: { now: () => 1205, pass: () => null } } as ToolContext;
    expect(dispatchTool(off, 'pass_time', { minutes: 5 }, 'agent')).toEqual({ ok: false, error: 'pass_time only works in a story' });
  });
});

describe('lighting tools', () => {
  const tool = (name: string) => toolsFor(setup().ctx).find((t) => t.name === name)!;

  it('set_ambient says the color is a tint and the level is brightness', () => {
    const d = tool('set_ambient').description;
    expect(d).toContain('tint');
    expect(d).toContain('level is brightness');
    expect(d).toContain('lower the level');
  });

  it('set_light says turning lights off dims the room, and window light stays', () => {
    const d = tool('set_light').description;
    expect(d).toContain('dims the room');
    expect(d).toContain('outside');
  });
});

describe('give_lead', () => {
  /** Cass mid-reply (r1) to hicks, offering Teo's debt this turn. */
  function leadSetup(o: { replyId?: string | null; offered?: { id: string; title: string }[] } = {}) {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const lines: string[] = [];
    const ctx: ToolContext = {
      room: new Room(registry),
      journal: new Journal(db),
      player: () => 'hicks',
      expressions: null,
      self: ['cass', 'Cass'],
      replyId: () => (o.replyId === undefined ? 'r1' : o.replyId),
      toolLine: (t) => lines.push(t),
      leads: {
        offered: () => o.offered ?? [{ id: 'teo-debt', title: "Teo's debt" }],
        give: (id, details, messageId) => db.giveLead({ id, player: 'hicks', details, messageId, at: 1 }),
      },
    };
    return { db, ctx, lines };
  }
  const give = (ctx: ToolContext, args: unknown) => dispatchTool(ctx, 'give_lead', args, 'agent');

  it('give_lead is unavailable with nothing offered', () => {
    const { ctx } = leadSetup({ offered: [] });
    expect(toolsFor(ctx).map((t) => t.name)).not.toContain('give_lead');
    expect(give(ctx, { id: 'teo-debt', details: 'x' }).ok).toBe(false);
  });

  it('give_lead is offered with the lead named in its description', () => {
    const { ctx } = leadSetup();
    expect(toolsFor(ctx).find((t) => t.name === 'give_lead')?.description).toContain('teo-debt');
  });

  it(`give_lead writes the lead and a tool line "Cass gave you a lead: Teo's debt"`, () => {
    const { db, ctx, lines } = leadSetup();
    expect(give(ctx, { id: 'teo-debt', details: 'Teo, 4k, three weeks' })).toEqual({ ok: true, text: "gave the lead: Teo's debt" });
    expect(db.leadsGiven('hicks')).toEqual([{ id: 'teo-debt', details: 'Teo, 4k, three weeks', messageId: 'r1', at: 1 }]);
    expect(lines).toEqual(["Cass gave you a lead: Teo's debt"]);
  });

  it('give_lead keeps over-long details, cut at a word to 300 characters, and says so (refusing made GLM write its reply twice)', () => {
    const { db, ctx } = leadSetup();
    const long = `Renn, 19, youngest on the night crew. ${'He was at the valve with her during the surge and has not slept since. '.repeat(6)}`;
    expect(long.length).toBeGreaterThan(300);
    const r = give(ctx, { id: 'teo-debt', details: long });
    expect(r).toEqual({ ok: true, text: "gave the lead: Teo's debt (details shortened to 300 characters)" });
    const kept = db.leadsGiven('hicks')[0]!.details;
    expect(kept.length).toBeLessThanOrEqual(300);
    expect(long.startsWith(kept)).toBe(true);
    expect(long[kept.length]).toBe(' ');
  });

  it('give_lead refuses an id not offered this turn', () => {
    const { db, ctx, lines } = leadSetup();
    expect(give(ctx, { id: 'other', details: 'x' })).toEqual({ ok: false, error: "no lead 'other' to give now; you can give: teo-debt" });
    expect(db.leadsGiven('hicks')).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('give_lead refuses outside a reply', () => {
    const { db, ctx } = leadSetup({ replyId: null });
    expect(give(ctx, { id: 'teo-debt', details: 'x' }).ok).toBe(false);
    expect(db.leadsGiven('hicks')).toEqual([]);
  });

  it("give_lead for a lead already held is ok 'already given'", () => {
    const { ctx, lines } = leadSetup();
    give(ctx, { id: 'teo-debt', details: 'x' });
    expect(give(ctx, { id: 'teo-debt', details: 'y' })).toEqual({ ok: true, text: 'already given' });
    expect(lines).toHaveLength(1);
  });

  it('an unbroken 301-character detail is cut hard at 300, never left empty', () => {
    const { db, ctx } = leadSetup();
    expect(give(ctx, { id: 'teo-debt', details: 'x'.repeat(301) }).ok).toBe(true);
    expect(db.leadsGiven('hicks')[0]!.details).toBe('x'.repeat(300));
  });
});

describe('shift_standing', () => {
  /** Mother Rot mid-reply (r1, take 0) to hicks. */
  function standingSetup(o: { replyId?: string | null; start?: StandingValues | null; take?: number } = {}) {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    if (o.replyId !== null) db.setReplyStamp({ messageId: 'r1', take: o.take ?? 0 });
    const lines: string[] = [];
    const ctx: ToolContext = {
      room: new Room(registry),
      journal: new Journal(db),
      player: () => 'hicks',
      expressions: null,
      self: ['mother-rot', 'Mother Rot'],
      replyId: () => (o.replyId === undefined ? 'r1' : o.replyId),
      toolLine: (t) => lines.push(t),
      standing: standingControl({
        db,
        player: () => 'hicks',
        start: () => (o.start === undefined ? { trust: 0, warmth: 3 } : o.start),
        config: () => null,
        shared: () => DEFAULT_SHARED_STANDING,
      }),
    };
    return { db, ctx, lines };
  }
  // The scribe moves standing now; the tool itself still runs from the dev panel (scribe spec).
  const shift = (ctx: ToolContext, args: unknown) => dispatchTool(ctx, 'shift_standing', args, 'dev');

  it('unavailable when standing does not apply; offered when it does', () => {
    expect(toolsFor(standingSetup({ start: null }).ctx).map((t) => t.name)).not.toContain('shift_standing');
    expect(toolsFor(standingSetup().ctx).map((t) => t.name)).toContain('shift_standing');
  });

  it('the description', () => {
    expect(toolsFor(standingSetup().ctx).find((t) => t.name === 'shift_standing')?.description).toBe(
      "How the person you're talking to just landed with you. Most turns move nothing; ±1 for something that would stay with you. trust: whether you believe them and would tell them things. warmth: whether you like having them around. Call it after you've reacted in your reply, never instead of reacting. reason: a few words, for yourself.",
    );
  });

  it('out of range, both zero and an over-long reason are refused', () => {
    const { ctx, db } = standingSetup();
    expect(shift(ctx, { trust: 2, warmth: 0, reason: 'x' }).ok).toBe(false);
    expect(shift(ctx, { trust: 1.5, warmth: 0, reason: 'x' }).ok).toBe(false);
    expect(shift(ctx, { trust: 0, warmth: 0, reason: 'x' })).toEqual({ ok: false, error: 'move trust or warmth' });
    expect(db.getMeta('standing.hicks')).toBeNull();
  });

  it('a long reason is cut to 80 characters at a word, not refused (GLM writes 90–150; hand-check)', () => {
    const { ctx, db } = standingSetup();
    const long = 'Sentinel card with my name on it fell out of his pocket right after he said he never talked to them. Unexplained.';
    expect(shift(ctx, { trust: -1, warmth: -1, reason: long })).toMatchObject({ ok: true });
    const reason = JSON.parse(db.getMeta('standing.hicks')!).moves[0].reason as string;
    expect(reason.length).toBeLessThanOrEqual(80);
    expect(long.startsWith(reason.replace(/…$/, ''))).toBe(true);
  });

  it('a move that changes the word: the new word, and a tool line', () => {
    const { ctx, lines, db } = standingSetup({ start: { trust: 0, warmth: 4 } });
    expect(shift(ctx, { trust: 0, warmth: 1, reason: '  paid on time  ' })).toEqual({ ok: true, text: 'now: Warming to you' });
    expect(lines).toEqual(['Mother Rot · now: Warming to you']);
    expect(JSON.parse(db.getMeta('standing.hicks')!).moves[0]).toMatchObject({ trust: 0, warmth: 1, reason: 'paid on time', messageId: 'r1', take: 0 });
  });

  it('a move that keeps the word: no tool line', () => {
    const { ctx, lines } = standingSetup();
    expect(shift(ctx, { trust: 1, warmth: 0, reason: 'fair' })).toEqual({ ok: true, text: 'now: Sizing you up' });
    expect(lines).toEqual([]);
  });

  it('a failed first call does not use up the turn; the third is refused (Review Focus 5)', () => {
    const { ctx } = standingSetup();
    expect(shift(ctx, { trust: 5, warmth: 0, reason: 'x' }).ok).toBe(false);
    expect(shift(ctx, { trust: 1, warmth: 0, reason: 'x' })).toMatchObject({ ok: true });
    expect(shift(ctx, { trust: 1, warmth: 0, reason: 'x' })).toEqual({ ok: true, text: 'already moved this turn' });
  });

  it('a new take of the same reply may move again', () => {
    const t = standingSetup({ take: 0 });
    shift(t.ctx, { trust: 1, warmth: 0, reason: 'x' });
    t.db.setReplyStamp({ messageId: 'r1', take: 1 });
    expect(shift(t.ctx, { trust: 1, warmth: 0, reason: 'x' })).toMatchObject({ ok: true, text: 'now: Sizing you up' });
  });

  it('a stored value with a broken move list does not crash the turn (tool review, Minor 2)', () => {
    const { ctx, db } = standingSetup();
    db.setMeta('standing.hicks', JSON.stringify({ trust: 1, warmth: 0, moves: [null, { reason: 'x' }] }));
    expect(shift(ctx, { trust: 1, warmth: 0, reason: 'x' })).toMatchObject({ ok: true });
    expect(JSON.parse(db.getMeta('standing.hicks')!)).toMatchObject({ trust: 2 });
  });

  it('when standing stops applying mid-turn, the tool refuses instead of throwing (tool review, Minor 3)', () => {
    let start: StandingValues | null = { trust: 0, warmth: 0 };
    const { ctx } = standingSetup();
    const control = standingControl({ db: openDb(':memory:', { defaultPlayer: 'hicks' }), player: () => 'hicks', start: () => start, config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    start = null;
    expect(control.move({ trust: 1, warmth: 0, reason: 'x' }, 'r1')).toBe('off');
    void ctx;
  });

  it("a dev-panel call from another player's tab is refused; from the turn's player it works (deferred minor)", () => {
    const { ctx, db } = standingSetup();
    const otherTab = { ...ctx, player: () => 'someone-else' };
    expect(dispatchTool(otherTab, 'shift_standing', { trust: 1, warmth: 0, reason: 'x' }, 'dev')).toEqual({ ok: false, error: "standing belongs to this turn's player; open their tab" });
    expect(db.getMeta('standing.hicks')).toBeNull();
    expect(dispatchTool(ctx, 'shift_standing', { trust: 1, warmth: 0, reason: 'x' }, 'dev')).toMatchObject({ ok: true });
  });

  it('only inside a reply', () => {
    const { ctx } = standingSetup({ replyId: null });
    expect(shift(ctx, { trust: 1, warmth: 0, reason: 'x' })).toEqual({ ok: false, error: 'shift_standing only works inside a reply' });
  });

  it('values clamp at ±10 through the real move', () => {
    const { ctx, db } = standingSetup({ start: { trust: 10, warmth: -10 } });
    shift(ctx, { trust: 1, warmth: -1, reason: 'x' });
    expect(JSON.parse(db.getMeta('standing.hicks')!)).toMatchObject({ trust: 10, warmth: -10 });
  });
});

describe('apply_mood (was apply_preset: its name leaked into the story, "*applies the quiet preset*", 2026-10-15)', () => {
  it('is offered as apply_mood, never apply_preset, and answers in moods', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const ctx: ToolContext = { room: new Room(registry), journal: new Journal(db), player: () => 'hicks', expressions: null };
    const names = toolsFor(ctx).map((t) => t.name);
    expect(names).toContain('apply_mood');
    expect(names).not.toContain('apply_preset');
    const mood = toolsFor(ctx).find((t) => t.name === 'apply_mood')!;
    expect(mood.description).not.toMatch(/preset/i);
    // City weather (spec §3): only the weather moods change the rain, and the description says so.
    expect(mood.description).toContain('only storm, downpour, clear-night and fog-bank change the weather');
    const name = Object.keys(ctx.room.scene().presets)[0]!;
    const r = dispatchTool(ctx, 'apply_mood', { name }, 'agent');
    expect(r.ok && r.text).toMatch(new RegExp(`^applied: mood → ${name}`));
  });
});

describe('go_to (was set_scene: its name leaked into the story, "*sets the scene as we arrive*", 2026-10-15)', () => {
  it('is offered as go_to, never set_scene, and no tool description says "set the scene"', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const ctx: ToolContext = { room: new Room(registry), journal: new Journal(db), player: () => 'hicks', expressions: null };
    const tools = toolsFor(ctx);
    expect(tools.map((t) => t.name)).toContain('go_to');
    expect(tools.map((t) => t.name)).not.toContain('set_scene');
    for (const t of tools) expect(t.description).not.toMatch(/set_scene|sets? the scene/i);
  });
});

describe('go_to and list_scenes know the ways out (room exits spec §3)', () => {
  it("go_to's description names the room line's ways out", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const ctx: ToolContext = { room: new Room(registry), journal: new Journal(db), player: () => 'hicks', expressions: null };
    const go = toolsFor(ctx).find((t) => t.name === 'go_to')!;
    expect(go.description).toMatch(/ways out/);
  });
});

describe('comms (spec 2026-10-20 §2): no room tools from her desk', () => {
  const ROOM = ['go_to', 'list_scenes', 'set_light', 'set_ambient', 'set_atmosphere', 'apply_mood', 'play_sound'];
  it('her model loses the room tools on comms; the game keeps go_to', () => {
    const { ctx } = setup();
    const on: ToolContext = { ...ctx, comms: () => true };
    const names = toolsFor(on, { agent: true }).map((t) => t.name);
    for (const t of ROOM) expect(names).not.toContain(t);
    expect(dispatchTool(on, 'set_light', { light_id: 'x', intensity: 0 }, 'agent')).toMatchObject({ ok: false, error: expect.stringMatching(/comms/) });
    expect(dispatchTool(on, 'go_to', { id: 'karasu/noodle-stall' }, 'user').ok).not.toBe(undefined);
    expect(dispatchTool(on, 'go_to', { id: 'karasu/noodle-stall' }, 'agent')).toMatchObject({ ok: false });
    // Off comms, as before.
    expect(toolsFor({ ...ctx, comms: () => false }, { agent: true }).map((t) => t.name)).toContain('set_light');
  });
});
