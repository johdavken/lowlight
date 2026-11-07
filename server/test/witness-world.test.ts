import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { buildApp } from '../src/app';
import { openDb, type Db } from '../src/db';
import { residualMessages } from '../src/residual';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { at, intakeRelay, lastUser } from './fixtures/intake-relay';
import { witnessKey } from '../../shared/witness';
import { storyDay } from '../../shared/board';

// Witness lines spec §3: their room reads what they were there for, live from every room.
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
    { id: 'ines', direct: true, pack: 'karasu' },
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

const CLOCK = 360 + 1440 * 5 + 900;
const entry = (text: string, clock: number) => JSON.stringify({ text, at: clock, scene: 'karasu/zhou-flat' });

describe('world.witnessedLine', () => {
  it('reads entries from every room, newest first', async () => {
    const s = await start();
    const p = s.pt.player;
    s.open('nix').setMeta(witnessKey(p, 'ines', 4), entry('older', CLOCK - 1440));
    s.open('cass').setMeta(witnessKey(p, 'ines', 5), entry('newer', CLOCK));
    const line = s.built.world.witnessedLine(p, 'ines', CLOCK)!;
    expect(line.indexOf('newer')).toBeGreaterThan(-1);
    expect(line.indexOf('newer')).toBeLessThan(line.indexOf('older'));
    expect(line).toContain(`${s.built.world.players.resolve(p).name} saw you there`);
  });
  it("keeps to the player and the witness: other entries stay out", async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    nix.setMeta(witnessKey('someone-else', 'ines', 5), entry('theirs', CLOCK));
    nix.setMeta(witnessKey(p, 'cass', 5), entry('cass saw', CLOCK));
    expect(s.built.world.witnessedLine(p, 'ines', CLOCK)).toBeNull();
    expect(s.built.world.witnessedLine('someone-else', 'ines', CLOCK)).toBeNull();
  });
  it('skips a damaged entry', async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    nix.setMeta(witnessKey(p, 'ines', 4), 'not json');
    nix.setMeta(witnessKey(p, 'ines', 5), entry('good', CLOCK));
    expect(s.built.world.witnessedLine(p, 'ines', CLOCK)).toContain('good');
  });
  it("a rewind in the other room is gone from the witness's line", async () => {
    const s = await start();
    const p = s.pt.player;
    const nix = s.open('nix');
    nix.insertMessage(p, { id: 'a0', role: 'agent', text: 'Hey.', toolLines: [], ts: 1, status: 'ok' });
    nix.insertMessage(p, { id: 'a1', role: 'agent', text: 'Sure.', toolLines: [], ts: 2, status: 'ok' });
    nix.withStamp({ messageId: 'a1', take: 0 }, () => nix.setMeta(witnessKey(p, 'ines', storyDay(CLOCK)), entry('heard it', CLOCK)));
    expect(s.built.world.witnessedLine(p, 'ines', CLOCK)).toContain('heard it');
    nix.cutAfter(p, 'a0');
    expect(s.built.world.witnessedLine(p, 'ines', CLOCK)).toBeNull();
  });
});

describe('world.witnessedScene', () => {
  const said = (id: string, text: string, clock: number) => ({ id, role: 'agent' as const, text, toolLines: [], ts: clock, status: 'ok' as const, clock });
  it("gives the newest entry's night, from the room it happened in", async () => {
    const s = await start();
    const p = s.pt.player;
    const cass = s.open('cass');
    cass.insertMessage(p, said('a', 'The flag followed me out.', CLOCK));
    cass.setMeta(witnessKey(p, 'ines', storyDay(CLOCK)), entry('I heard it.', CLOCK));
    expect(s.built.world.witnessedScene(p, 'ines', CLOCK)).toContain('The flag followed me out.');
  });
  it('nothing after a night has passed', async () => {
    const s = await start();
    const p = s.pt.player;
    const cass = s.open('cass');
    cass.insertMessage(p, said('a', 'Old news.', CLOCK));
    cass.setMeta(witnessKey(p, 'ines', storyDay(CLOCK)), entry('I heard it.', CLOCK));
    expect(s.built.world.witnessedScene(p, 'ines', CLOCK + 1440)).not.toBeNull();
    expect(s.built.world.witnessedScene(p, 'ines', CLOCK + 2880)).toBeNull();
  });
  it("nothing for anyone but the playthrough's player", async () => {
    const s = await start();
    expect(s.built.world.witnessedScene('someone-else', 'ines', CLOCK)).toBeNull();
  });
});

describe('her turn', () => {
  const LINE = '[you were there: at the flat, last night — I heard it. You were in the room for this yourself.]';
  const SCENE = '[what was said in that room: Silas: Nothing.]';
  const relay = () => {
    const t = intakeRelay({ contact: 'nix-direct', clock: at(23, 0) });
    t.deps.witnessedLine = () => LINE;
    t.deps.witnessedScene = () => SCENE;
    return t;
  };
  it('the line comes on a plain turn', async () => {
    const t = relay();
    await t.relay.send('hicks', 'hey');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain(LINE);
  });
  it('the scene comes with it', async () => {
    const t = relay();
    await t.relay.send('hicks', 'hey');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain(SCENE);
  });
  it('not the scene out of character', async () => {
    const t = relay();
    await t.relay.send('hicks', 'quick question', 'ooc');
    expect(lastUser(t.backend.reqs.at(-1)!)).not.toContain(SCENE);
  });
  it('and on her greeting', async () => {
    const t = relay();
    await t.relay.greet('hicks');
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain(LINE);
  });
  it('not out of character', async () => {
    const t = relay();
    await t.relay.send('hicks', 'quick question', 'ooc');
    expect(lastUser(t.backend.reqs.at(-1)!)).not.toContain('[you were there:');
  });
  it('not on an END SCENE', async () => {
    const t = relay();
    await t.relay.send('hicks', 'hey');
    await t.relay.send('hicks', 'bye', 'end', { leave: true, parting: 'her' });
    expect(lastUser(t.backend.reqs.at(-1)!)).not.toContain('[you were there:');
  });
});

it('her Residual sees what she remembers', () => {
  const all = residualMessages({
    kind: 'turn',
    self: { name: 'Ember', pronoun: 'she' },
    player: { id: 'hicks', name: 'Hicks' },
    roomLine: '[room: the landing]',
    standing: null,
    notes: [],
    exchanges: [{ speaker: 'Ember', text: 'Well?' }],
    recap: null,
    page: null,
    remembered: '[you were there: x]',
  }).map((m) => m.content).join('\n');
  expect(all).toContain('[you were there: x]');
  expect(all).toContain('note it if it still matters when it comes up');
});
