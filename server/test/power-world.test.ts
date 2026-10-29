// Blackouts phase 3 §1–§2: the world answers who is dark, from the schedule and the narrator's power cuts.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const MAP = {
  version: 1,
  image: '/map/x.webp',
  panelAt: [50, 50],
  districts: [
    { id: 'karasu', name: 'Karasu', label: [1, 1] },
    { id: 'velvet', name: 'Velvet', label: [2, 2] },
  ],
  places: [
    { id: 'stall', name: "Hae's Noodles", district: 'karasu', pin: [2, 2], scene: 'karasu/noodle-stall' },
    { id: 'roof', name: 'Ribbon Rooftop', district: 'karasu', pin: [3, 3], scene: 'karasu/ribbon-rooftop', on: 'ribbon' },
  ],
};

const at = (day: number, h: number, m = 0) => (day - 1) * 1440 + h * 60 + m;

async function start(rates: Record<string, number>, forced: string[] = []) {
  const s = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
  cleanups.push(() => s.close());
  const { root, cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: s.url });
  cfg.mapFile = path.join(root, 'lowlight.json');
  fs.writeFileSync(cfg.mapFile, JSON.stringify(MAP));
  fs.mkdirSync(path.join(root, 'city', 'districts'), { recursive: true });
  for (const [id, outage] of Object.entries(rates)) fs.writeFileSync(path.join(root, 'city', 'districts', `${id}.json`), JSON.stringify({ blackout: { outage } }));
  if (forced.length > 0) cfg.forcedOutages = forced;
  // This test's own rates, from its map's city/districts/ (the fixture turns them off).
  delete cfg.outageRates;
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  const pt = built.world.active()!;
  const clockTo = (m: number) => built.playthroughs.setClockFloor(pt.id, m);
  return { built, pt, clockTo };
}

describe('the world knows who is dark', () => {
  it('Karasu dark at night by its rate, its Ribbon places too', async () => {
    const { built, clockTo } = await start({ _default: 0, karasu: 1 });
    clockTo(at(2, 23));
    expect(built.world.darkNow().map((o) => o.district)).toEqual(['karasu']);
    expect(built.world.powerOf('karasu/noodle-stall').outage?.district).toBe('karasu');
    expect(built.world.powerOf('karasu/ribbon-rooftop').outage?.district).toBe('karasu');
    expect(built.world.districtName('karasu')).toBe('Karasu');
  });

  it('a narrator cut darkens the district for 90 minutes and goes with its row', async () => {
    const { built, pt, clockTo } = await start({ _default: 0 });
    clockTo(at(2, 23));
    built.world.cutPower('nix', 'r1', at(2, 23), 'karasu/noodle-stall');
    expect(built.playthroughs.get(pt.id)!.outages).toEqual([{ district: 'karasu', from: at(2, 23), to: at(2, 23) + 90, by: 'narrator', contact: 'nix', row: 'r1' }]);
    expect(built.world.powerOf('karasu/noodle-stall').outage?.by).toBe('narrator');
    built.world.cutPower('nix', 'r2', at(2, 23, 10), 'karasu/noodle-stall');
    expect(built.playthroughs.get(pt.id)!.outages).toHaveLength(1);
    built.world.outagesAfterRebuild('nix', () => true);
    expect(built.playthroughs.get(pt.id)!.outages).toHaveLength(1);
    built.world.outagesAfterRebuild('nix', () => false);
    expect(built.playthroughs.get(pt.id)!.outages).toBeUndefined();
    expect(built.world.powerOf('karasu/noodle-stall').outage).toBeNull();
  });

  it("a rewind that takes the encounter row away undoes the cut; one that keeps it doesn't", async () => {
    const { built, pt, clockTo } = await start({ _default: 0 });
    clockTo(at(2, 23));
    const rt = (await built.runtime('nix'))!;
    rt.db.insertMessage(pt.player, { id: 'enc-1', role: 'user', mode: 'encounter', text: 'The lights die.', encounter: { title: 'Dark' }, toolLines: [], ts: 5, status: 'ok' });
    built.world.cutPower('nix', 'enc-1', at(2, 23), 'karasu/noodle-stall');
    const rebuild = () => rt.applyRebuild({ roomChanged: false, notes: [], recap: [], page: [], shares: false, leads: false, quests: false });
    rebuild();
    expect(built.playthroughs.get(pt.id)!.outages).toHaveLength(1);
    rt.db.deleteMessage(pt.player, 'enc-1');
    rebuild();
    expect(built.playthroughs.get(pt.id)!.outages).toBeUndefined();
  });

  it("her room goes out when the narrator cuts it and comes back when the cut is undone (§3)", async () => {
    const { built, pt, clockTo } = await start({ _default: 0 });
    clockTo(at(2, 23));
    const rt = (await built.runtime('nix'))!;
    rt.room.setScene({ id: 'noodle-stall' }, 'world');
    await new Promise((r) => setTimeout(r, 0));
    built.playthroughs.touch(pt.id, { contactId: 'nix', sceneId: rt.room.state.sceneId });
    const ops: string[] = [];
    rt.room.onChange((c) => ops.push(`${c.op.tool}:${String(c.op.args.state ?? '')}`));
    rt.db.insertMessage(pt.player, { id: 'enc-1', role: 'user', mode: 'encounter', text: 'The lights die.', encounter: { title: 'Dark' }, toolLines: [], ts: 5, status: 'ok' });
    built.world.cutPower('nix', 'enc-1', at(2, 23), rt.room.state.sceneId);
    expect(ops).toEqual(['power:out']);
    rt.db.deleteMessage(pt.player, 'enc-1');
    rt.applyRebuild({ roomChanged: false, notes: [], recap: [], page: [], shares: false, leads: false, quests: false });
    expect(ops).toEqual(['power:out', 'power:back']);
  });

  it('a rewind or swipe re-checks her room against the power now (review M1)', async () => {
    const { built, pt, clockTo } = await start({ _default: 0, karasu: 1 });
    clockTo(at(2, 23));
    const rt = (await built.runtime('nix'))!;
    rt.room.setScene({ id: 'noodle-stall' }, 'world');
    await new Promise((r) => setTimeout(r, 0));
    built.playthroughs.touch(pt.id, { contactId: 'nix', sceneId: rt.room.state.sceneId });
    // A rewind brought back a lit room (its saved state), in a dark district.
    rt.room.setPower({ out: false }, 'world');
    rt.db.deleteMeta('storyMood.power');
    const ops: string[] = [];
    rt.room.onChange((c) => ops.push(`${c.op.tool}:${String(c.op.args.state ?? '')}`));
    rt.applyRebuild({ roomChanged: false, notes: [], recap: [], page: [], shares: false, leads: false, quests: false });
    expect(ops).toEqual(['power:out']);
  });

  it("every tab hears the power: when the clock moves, when it's cut, and on walking somewhere (§4)", async () => {
    const { built, pt, clockTo } = await start({ _default: 0 });
    clockTo(at(2, 23));
    const rt = (await built.runtime('nix'))!;
    rt.room.setScene({ id: 'noodle-stall' }, 'world');
    await new Promise((r) => setTimeout(r, 0));
    built.playthroughs.touch(pt.id, { contactId: 'nix', sceneId: rt.room.state.sceneId });
    const sent: unknown[] = [];
    const emit = rt.hub.emit.bind(rt.hub);
    rt.hub.emit = (e) => {
      if (e.type === 'power') sent.push(e);
      emit(e);
    };
    built.world.clockChanged();
    expect(sent.at(-1)).toEqual({ type: 'power', dark: [], here: null });
    built.world.cutPower('nix', null, at(2, 23), rt.room.state.sceneId);
    expect(sent.at(-1)).toEqual({ type: 'power', dark: ['karasu'], here: { name: 'Karasu', since: at(2, 23) } });
    const n = sent.length;
    rt.room.setScene({ id: 'ribbon-rooftop' }, 'world');
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.length).toBe(n + 1);
    expect(sent.at(-1)).toEqual({ type: 'power', dark: ['karasu'], here: { name: 'Karasu', since: at(2, 23) } });
  });

  it('NIX_ROOM_OUTAGES keeps a district dark day and night, for checks', async () => {
    const { built, clockTo } = await start({ _default: 0 }, ['velvet']);
    clockTo(at(2, 12));
    expect(built.world.darkNow().map((o) => o.district)).toEqual(['velvet']);
  });

  it('a new playthrough (no location yet: her first scene) still puts her room out (live check)', async () => {
    const { built, pt, clockTo } = await start({ _default: 0 });
    clockTo(at(2, 23));
    expect(built.playthroughs.get(pt.id)!.location).toBeNull();
    const rt = (await built.runtime('nix'))!;
    const ops: string[] = [];
    rt.room.onChange((c) => ops.push(`${c.op.tool}:${String(c.op.args.state ?? '')}`));
    built.world.cutPower('nix', null, at(2, 23), rt.room.state.sceneId);
    expect(ops).toEqual(['power:out']);
  });

  it('a WAIT tells the tabs the power too (final review I1)', async () => {
    const { built, pt } = await start({ _default: 0, karasu: 1 });
    const rt = (await built.runtime('nix'))!;
    rt.room.setScene({ id: 'noodle-stall' }, 'world');
    await new Promise((r) => setTimeout(r, 0));
    built.playthroughs.touch(pt.id, { contactId: 'nix', sceneId: rt.room.state.sceneId });
    const sent: unknown[] = [];
    const emit = rt.hub.emit.bind(rt.hub);
    rt.hub.emit = (e) => {
      if (e.type === 'power') sent.push(e);
      emit(e);
    };
    built.world.wait({ until: '23:00' });
    expect(sent.at(-1)).toMatchObject({ type: 'power', dark: ['karasu'], here: { name: 'Karasu' } });
  });

  it("the narrator can't cut a Spine room's power: its cards come without it (final review M1)", async () => {
    const { built } = await start({ _default: 0 });
    expect(built.world.canCut('karasu/noodle-stall')).toBe(true);
    expect(built.world.canCut('spine/listening-post')).toBe(false);
  });
});
