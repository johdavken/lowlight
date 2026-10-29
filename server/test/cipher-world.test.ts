import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { buildApp } from '../src/app';
import { openDb, type Db } from '../src/db';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { cipherDue, cipherKey, type CipherEvent } from '../../shared/cipher';
import type { ChatMessage } from '../../shared/types';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function start() {
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
  cleanups.push(() => or.close());
  const { cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  const pt = built.world.active()!;
  const open = (contact: string): Db => {
    const file = path.join(cfg.playthroughsDir, pt.id, 'chars', contact, 'room.db');
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

const reply = (id: string, ts: number): ChatMessage => ({ id, role: 'agent', text: `line ${id}`, toolLines: [], ts, status: 'ok' });
const said = (id: string, ts: number): ChatMessage => ({ id, role: 'user', text: `hi ${id}`, toolLines: [], ts, status: 'ok' });
const truth = (id: string, knownBy: string[], seq: number): CipherEvent => ({ t: 'truth', id, kind: seq === 1 ? 'self' : 'place', truth: `t ${id}`, knownBy, comesOutWhen: 'w', changes: 'c', clueIdeas: 'i', seq });

describe('Cipher across the playthrough (cipher spec §2.1)', () => {
  it('folds every contact db into one Cipher, and counts her replies across them', async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    nix.insertMessage(p, said('u1', 1));
    nix.insertMessage(p, reply('n1', 2));
    nix.setMeta(cipherKey(p), JSON.stringify([truth('nix-1', ['nix'], 1)]));
    const cass = s.open('cass');
    cass.insertMessage(p, reply('c1', 3));
    cass.insertMessage(p, { ...reply('c2', 4), mode: 'ooc' });
    cass.setMeta(cipherKey(p), JSON.stringify([truth('cass-1', ['cass'], 2)]));
    const c = s.built.world.cipherOf(p)!;
    expect(c.truths.map((t) => t.id)).toEqual(['nix-1', 'cass-1']);
    expect(c.replies).toBe(2);
  });

  it('a playthrough from before Cipher: no keys anywhere, nothing breaks, and a run is due', async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    for (let i = 0; i < 7; i++) nix.insertMessage(p, reply(`n${i}`, i + 1));
    const c = s.built.world.cipherOf(p)!;
    expect(c).toEqual({ truths: [], replies: 7, lastRun: null });
    expect(cipherDue(c)).toBe(true);
  });

  it('deleting an older reply drops its clue at once, not on the next message (minor 5)', async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    nix.insertMessage(p, said('u1', 1));
    nix.insertMessage(p, reply('n1', 2));
    nix.withStamp({ messageId: 'n1', take: 0 }, () => nix.setMeta(cipherKey(p), JSON.stringify([truth('nix-1', ['nix'], 1)])));
    nix.insertMessage(p, said('u2', 3));
    nix.insertMessage(p, reply('n2', 4));
    expect(s.built.world.cipherOf(p)!.truths).toHaveLength(1);
    nix.deleteMessage(p, 'n1');
    nix.rebuild();
    const c = s.built.world.cipherOf(p)!;
    expect(c.truths).toHaveLength(0);
    expect(c.replies).toBe(1);
  });

  it("anyone but the playthrough's player: null", async () => {
    const s = await start();
    expect(s.built.world.cipherOf('someone-else')).toBeNull();
  });

  it('the cast: who the player has met, never the player, with her authored secret', async () => {
    const s = await start();
    const p = s.pt.player;
    s.open('nix').insertMessage(p, reply('n1', 1));
    s.open('cass').insertMessage(p, reply('c1', 2));
    const cast = s.built.world.cipherCast(p);
    expect(cast.map((c) => c.id)).not.toContain(p);
    expect(cast.length).toBeGreaterThan(0);
    for (const c of cast) {
      expect(typeof c.name).toBe('string');
      expect(c.about.length).toBeLessThanOrEqual(200);
      expect(c).toHaveProperty('secret');
    }
  });
});
