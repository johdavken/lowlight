/** RECOMMENDED through the world (Kroll's desk spec): the quest book, her standing and the playthrough feed the known list. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app';
import { createPlaythroughs } from '../src/playthroughs';
import { openDb } from '../src/db';
import { questKey, toldKey } from '../../shared/quests';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { JOB } from '../../shared/quests.fixture';
import { tempDir } from './fixtures/temp-dir';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.unstubAllEnvs();
});

/** A fixture job of Cass's alone, for `player`, once only. */
const standingOrder = (player: string, o: Opts = {}) =>
  JOB.replace('tier: 2', `tier: ${o.tier ?? 1}${o.text ? '\ntext: Come by the stall.\nafter: gate != shut' : ''}`).replace('with: [hicks, ember, nix-direct]', `with: [cass]\nfor: ${player}\nonce: true\npitch: A courier owes the floor a name.`).replace('title: Back Door', 'title: Come Up');

/** The job's tier and a `text:` line; whether Cass has told Nix of it; Nix's rep in Karasu (Hae's stall's district). */
type Opts = { tier?: 1 | 2; text?: boolean; told?: boolean; rep?: number; /** Karasu rep a run won, and the story minute it landed. */ won?: { delta: number; at: number } };

/** Nix plays; Cass, her start contact, has the job (`for:` names a roster character). */
async function start(player: string, o: Opts = {}) {
  if (o.rep !== undefined) vi.stubEnv('NIX_TEST_REP', `nix@karasu:${o.rep}`);
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
  cleanups.push(() => or.close());
  const { cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  cfg.questsDir = path.join(tempDir('rec-quests-'), 'quests');
  fs.mkdirSync(cfg.questsDir);
  fs.writeFileSync(path.join(cfg.questsDir, 'come-up.md'), standingOrder(player, o));
  const pts = createPlaythroughs(cfg.playthroughsDir);
  const id = pts.create({ player: 'nix', startContact: 'cass' }).id;
  pts.setActive(id);
  if (o.told || o.won) {
    const file = path.join(pts.charsDir(id), 'cass', 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: 'nix' });
    if (o.told) db.setMeta(toldKey('nix', 'come-up'), '1');
    // Another job's run, ended, that won Karasu rep at `won.at`.
    if (o.won) db.setMeta(questKey('nix', 'other-job@0'), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, kit: [{ at: o.won.at, rep: { district: 'karasu', delta: o.won.delta } }] }));
    db.close();
  }
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  const pt = built.world.active()!;
  return { built, pt };
}

describe('RECOMMENDED through the world', () => {
  it('her open job puts her first, tagged; not for another player; not while you are with her', async () => {
    // Another player's job: nobody recommended.
    const other = await start('cass');
    expect(other.built.world.contacts().some((c) => c.recommended)).toBe(false);

    const s = await start('nix');
    expect(s.pt.player).toBe('nix');
    const list = s.built.world.contacts();
    expect(list[0]).toMatchObject({ id: 'cass', recommended: { title: 'Come Up', pitch: 'A courier owes the floor a name.', place: 'haes-noodles' } });
    // With her now: no tag.
    s.built.world.setLocation('cass');
    expect(s.built.world.contacts().find((c) => c.id === 'cass')!.recommended).toBeUndefined();
  });

  const tagged = async (player: string, o: Opts) => (await start(player, o)).built.world.contacts().some((c) => c.id === 'cass' && c.recommended);
  it('a text: job only once she has told you (as her desk lists it)', async () => {
    expect(await tagged('nix', { text: true })).toBe(false);
    expect(await tagged('nix', { text: true, told: true })).toBe(true);
  });
  it('a tier 2 job only once your rep in its district reaches tier 2', async () => {
    expect(await tagged('nix', { tier: 2 })).toBe(false);
    expect(await tagged('nix', { tier: 2, rep: 19 })).toBe(false);
    expect(await tagged('nix', { tier: 2, rep: 20 })).toBe(true);
  });
  it('the tier is read as her desk reads it, from rep at 06:00: rep won tonight tags nothing until the morning', async () => {
    // The story opens on day 0 at 20:00; its 06:00 was at minute 360.
    expect(await tagged('nix', { tier: 2, won: { delta: 20, at: 1210 } })).toBe(false);
    expect(await tagged('nix', { tier: 2, won: { delta: 20, at: 300 } })).toBe(true);
  });
});
