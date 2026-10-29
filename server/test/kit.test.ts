import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app';
import { openDb, type Db } from '../src/db';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { questKey } from '../../shared/quests';
import { MISSION } from '../../shared/quests.fixture';
import { fixerKey } from '../../shared/stock';
import { DEFAULT_STATS } from '../../shared/stats';
import type { ChatMessage } from '../../shared/types';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function start(o: { quests?: Record<string, string> } = {}) {
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
  cleanups.push(() => or.close());
  const { cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  if (o.quests) {
    cfg.questsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quests-'));
    for (const [id, text] of Object.entries(o.quests)) fs.writeFileSync(path.join(cfg.questsDir, `${id}.md`), text);
  }
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  const pt = built.world.active()!;
  const open = (ptId: string, contact: string): Db => {
    const file = path.join(cfg.playthroughsDir, ptId, 'chars', contact, 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: pt.player });
    cleanups.push(() => {
      try {
        db.close();
      } catch {
        // closed by the test
      }
    });
    return db;
  };
  return { built, pt, open };
}

const line = (id: string, ts: number): ChatMessage => ({ id, role: 'agent', text: `line ${id}`, toolLines: [], ts, status: 'ok' });
const runWith = (kit: object[]) => JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, kit });

describe('the kit across the playthrough', () => {
  it('kitOf folds events from every contact db', async () => {
    const s = await start();
    const player = s.pt.player;
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n10', 10));
    nix.setReplyStamp({ messageId: 'n10', take: 0 });
    nix.setMeta(questKey(player, 'job-a'), runWith([{ at: 1300, sol: 100 }]));
    nix.setReplyStamp(null);
    const cass = s.open(s.pt.id, 'cass');
    cass.insertMessage(player, line('c20', 20));
    cass.setReplyStamp({ messageId: 'c20', take: 0 });
    cass.setMeta(questKey(player, 'job-b'), runWith([{ at: 1310, sol: 50, heat: 2 }]));
    cass.setReplyStamp(null);
    expect(s.built.world.kitOf(player)).toMatchObject({ kit: { sol: 150, heat: { unknown: 2 }, deck: null }, stats: DEFAULT_STATS });
  });

  it('branch above a paying row drops its sol', async () => {
    const s = await start();
    const player = s.pt.player;
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n10', 10));
    nix.insertMessage(player, line('n30', 30));
    nix.setReplyStamp({ messageId: 'n30', take: 0 });
    nix.setMeta(questKey(player, 'job-a'), runWith([{ at: 1300, sol: 400 }]));
    nix.setReplyStamp(null);
    expect(s.built.world.kitOf(player)!.kit.sol).toBe(400);
    nix.close();
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(s.built.world.kitOf(player)!.kit.sol).toBe(0);
  });

  it('GET /api/kit', async () => {
    const s = await start();
    const res = await s.built.app.inject({ method: 'GET', url: '/api/kit' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      kit: { deck: null, sol: 0, heat: 0, heatHere: 0, hottest: null, rep: {}, cover: { burner: 0, 'fall-guy': 0 }, edgeLeft: 1, edgeMax: 1, stats: DEFAULT_STATS, crewLatest: null },
    });
  });

  it('GET /api/kit: heat in the room you stand in, and the hottest district', async () => {
    const s = await start();
    const player = s.pt.player;
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n10', 10));
    nix.setReplyStamp({ messageId: 'n10', take: 0 });
    await s.built.runtime(s.pt.startContact);
    nix.setMeta(questKey(player, 'job-a@0'), runWith([{ at: 1300, heat: 2, district: 'karasu' }, { at: 1300, heat: 5, district: 'velvet' }, { at: 1300, rep: { district: 'karasu', delta: 25 } }]));
    nix.setReplyStamp(null);
    const kit = JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/kit' })).body).kit;
    expect(kit).toMatchObject({ heatHere: 2, hottest: { district: 'velvet', heat: 5 }, rep: { karasu: 25 } });
  });

  it('kitOf folds fixer purchases with runs', async () => {
    const s = await start();
    const player = s.pt.player;
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n10', 10));
    nix.setReplyStamp({ messageId: 'n10', take: 0 });
    nix.setMeta(questKey(player, 'job-a@0'), runWith([{ at: 1300, sol: 1000 }]));
    nix.setMeta(fixerKey(player), JSON.stringify([{ at: 1310, sol: -500, cover: { id: 'burner', delta: 1 } }]));
    nix.setReplyStamp(null);
    expect(s.built.world.kitOf(player)!.kit).toMatchObject({ sol: 500, cover: { burner: 1, 'fall-guy': 0 } });
  });

  it("old missions' heat lands in their district", async () => {
    const s = await start({ quests: { 'night-clerk': MISSION.replace('with: [hicks, ember, nix-direct]', 'with: [nix]').replace('starts: haes-noodles', 'starts: second-socket') } });
    const player = s.pt.player;
    const nix = s.open(s.pt.id, 'nix');
    nix.insertMessage(player, line('n10', 10));
    nix.setReplyStamp({ messageId: 'n10', take: 0 });
    nix.setMeta(questKey(player, 'night-clerk'), runWith([{ at: 1300, heat: 2 }]));
    nix.setReplyStamp(null);
    expect(s.built.world.kitOf(player)!.kit.heat).toEqual({ karasu: 2 });
  });
});

describe('GET /api/quests/art/:file', () => {
  it("serves a quest picture from the quests folder's art/; 404 for a missing or unsafe name", async () => {
    const { cfg } = await makeFixture([{ id: 'nix', pack: 'karasu' }]);
    cfg.questsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quests-'));
    fs.mkdirSync(path.join(cfg.questsDir, 'art'));
    fs.writeFileSync(path.join(cfg.questsDir, 'art', 'night-shift.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const ok = await built.app.inject({ method: 'GET', url: '/api/quests/art/night-shift.png' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    for (const bad of ['missing.png', '..%2Fsecret.png', 'x.gif']) expect((await built.app.inject({ method: 'GET', url: `/api/quests/art/${bad}` })).statusCode, bad).toBe(404);
  });
});
