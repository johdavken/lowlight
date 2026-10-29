import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { makeFixture } from './fixtures/agents';
import { openDb } from '../src/db';
import { pageLine } from '../src/journal';
import { commsKey } from '../../shared/comms';
import { planKey, parsePlan, planSeenKey } from '../../shared/plan';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';

const TOKEN = 'test-token-123456789';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const until = async (p: () => boolean) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > 3000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** nix on the OpenRouter stub; her chat reply waits for `release()` when `hold`. */
async function start(opts: { hold?: boolean; prepare?: (cfg: Config) => void; others?: string[] } = {}) {
  let release!: () => void;
  const released = opts.hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')], holdUntil: released } });
  cleanups.push(async () => {
    release?.();
    await or.close();
  });
  const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }, ...(opts.others ?? []).map((id) => ({ id, direct: true, pack: 'karasu' as const }))], undefined, { openrouterUrl: or.url });
  opts.prepare?.(cfg);
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const port = (built.app.server.address() as { port: number }).port;
  const api = async (method: string, url: string, payload?: unknown) => {
    const res = await built.app.inject({ method: method as 'GET', url, payload: payload as object | undefined });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
  };
  return { built, cfg, api, port, release: () => release() };
}

/** Starts a held turn so the world is busy. */
async function hold(s: Awaited<ReturnType<typeof start>>) {
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/nix?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
  ws.on('error', () => {});
  cleanups.push(() => ws.close());
  await new Promise<void>((r) => ws.on('open', () => r()));
  ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
  const rt = (await s.built.runtime('nix'))!;
  await until(() => rt.relay.busy);
  return rt;
}

describe('playthrough routes', () => {
  it('create activates', async () => {
    const { api, built } = await start();
    const first = built.world.active()!;
    const made = await api('POST', '/api/playthroughs', { player: first.player, startContact: 'nix' });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ player: first.player, startContact: 'nix' });
    expect(built.world.active()!.id).toBe(made.body.id);
    expect((await api('POST', '/api/playthroughs', { player: 3 })).status).toBe(400);
    expect((await api('POST', '/api/playthroughs', { player: 'x' })).body).toEqual({ error: 'bad-request' });
  });

  it('a runtime rebuilt in the new world checks its link without waiting for a poll', async () => {
    const { api, built } = await start();
    const before = (await built.runtime('nix'))!;
    await before.checkHealth(); // the server's start-up check
    expect(before.hub.linkStatus).toBe('ok');
    await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix' });
    const after = (await built.runtime('nix'))!;
    expect(after).not.toBe(before);
    await until(() => after.hub.linkStatus === 'ok');
  });

  it('around lists a stranger; going there moves you; the player himself and a resident stay refused (Review Focus 4)', async () => {
    const { api, built } = await start({ others: ['cass'] });
    const { player, startContact } = built.world.active()!;
    const stranger = startContact === 'nix' ? 'cass' : 'nix';
    const around = await api('GET', '/api/playthroughs/active/around');
    expect(around.status).toBe(200);
    expect(around.body.map((e: { contactId: string }) => e.contactId)).toEqual([stranger]);
    const go = await api('POST', '/api/playthroughs/active/location', { contactId: stranger });
    expect(go.status).toBe(200);
    expect(built.world.active()!.location?.contactId).toBe(stranger);
    expect(built.world.setLocation(player)).toBe('unknown');
    expect(built.world.setLocation('hae')).toBe('unknown');
  });

  it("standing in a stranger's room: CONTACTS doesn't move you back, and a SAVE there is at her room (Task 3 review 1)", async () => {
    const { api, built } = await start({ others: ['cass'] });
    const pt = (await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix' })).body;
    expect((await api('POST', '/api/playthroughs/active/location', { contactId: 'cass' })).status).toBe(200);
    await api('GET', '/api/playthroughs/active/contacts');
    expect(built.world.active()!.location?.contactId).toBe('cass');
    const saved = await api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'Here', contactId: 'cass' });
    expect(saved.body.location?.contactId).toBe('cass');
  });

  it('a save naming contacts no longer on the roster opens with the ones that are (old Hermes nix/dixie)', async () => {
    const { api, built, cfg } = await start({ others: ['cass'] });
    const pt = (await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'cass' })).body;
    // An old save: rooms for two characters that are gone, and her location on one of them. 'ghost'
    // stands in for the old Hermes nix, since this fixture keeps nix on the roster.
    for (const gone of ['ghost', 'dixie']) {
      const f = path.join(cfg.playthroughsDir, pt.id, 'chars', gone, 'room.db');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const db = openDb(f, { defaultPlayer: pt.player });
      db.close();
    }
    const file = path.join(cfg.playthroughsDir, pt.id, 'playthrough.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.location = { ...(json.location ?? { sceneId: 'karasu/lowlight-intake' }), contactId: 'ghost' };
    fs.writeFileSync(file, JSON.stringify(json));
    const other = (await api('POST', '/api/playthroughs', { player: pt.player, startContact: 'nix' })).body;
    expect(built.world.active()!.id).toBe(other.id);
    expect((await api('POST', `/api/playthroughs/${pt.id}/activate`)).status).toBe(200);
    const contacts = await api('GET', '/api/playthroughs/active/contacts');
    expect(contacts.status).toBe(200);
    // The location's contact is gone, so she falls back to the save's start contact.
    expect(built.world.active()!.location?.contactId).toBe('cass');
  });

  it('around with no playthrough is 409', async () => {
    const { api } = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect(await api('GET', '/api/playthroughs/active/around')).toEqual({ status: 409, body: { error: 'no-playthrough' } });
  });

  it("world.heldLeads reads the active playthrough's leads for its player only", async () => {
    const lead = `---\ntitle: Teo's debt\nfrom: nix\nto: cass\nkeys: [teo]\nfill: what he owes\n---\n## On her mind\nm\n## Giver knows\ng\n## Receiver knows\nr\n`;
    const { built, cfg } = await start({
      others: ['cass'],
      prepare: (c) => {
        fs.mkdirSync(c.leadsDir!, { recursive: true });
        fs.writeFileSync(path.join(c.leadsDir!, 'teo-debt.md'), lead);
      },
    });
    const pt = built.world.active()!;
    expect(built.world.heldLeads(pt.player)).toEqual([]);
    const file = path.join(cfg.playthroughsDir, pt.id, 'chars', 'nix', 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: pt.player });
    db.giveLead({ id: 'teo-debt', player: pt.player, details: 'Teo owes 4k', messageId: 'm1', at: 1 });
    db.close();
    expect(built.world.heldLeads(pt.player)).toEqual([{ id: 'teo-debt', givenBy: 'nix', details: 'Teo owes 4k', at: 1, followed: false }]);
    expect(built.world.heldLeads('someone-else')).toBeNull();
  });

  it("world.questStatus reads quest runs from every contact's db, for its player only", async () => {
    const { built, cfg } = await start({ others: ['cass'] });
    const pt = built.world.active()!;
    expect(built.world.questStatus(pt.player)).toEqual([]);
    const file = path.join(cfg.playthroughsDir, pt.id, 'chars', 'cass', 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: pt.player });
    const run = { beat: 'sentinel', picks: [], flags: { ledger: 'given' }, done: false, at: 5 };
    db.insertMessage(pt.player, { id: 'a0', role: 'user', text: 'x', toolLines: [], ts: 0, status: 'ok' });
    db.insertMessage(pt.player, { id: 'q1', role: 'user', text: 'x', toolLines: [], ts: 1, status: 'ok', mode: 'quest' });
    db.setMeta(`quest.${pt.player}.paper-trail`, JSON.stringify(run));
    db.setMeta('quest.someone-else.paper-trail', JSON.stringify(run));
    db.setMeta(`quest.${pt.player}.broken`, 'not json');
    // A run stored before variants and waits reads with their defaults.
    expect(built.world.questStatus(pt.player)).toEqual([{ id: 'paper-trail', contact: 'cass', run: { ...run, variant: 0, wait: null } }]);
    expect(built.world.questStatus('someone-else')).toBeNull();
    db.cutAfter(pt.player, 'a0');
    db.close();
    expect(built.world.questStatus(pt.player)).toEqual([]);
  });

  it('ties: as written and EDIT know from before; CUSTOM and an old persona do not (Review Focus 2)', async () => {
    const { api, built, cfg } = await start({ others: ['cass'] });
    const player = built.world.active()!.player;
    fs.mkdirSync(path.join(cfg.charactersDir, player), { recursive: true });
    fs.writeFileSync(path.join(cfg.charactersDir, player, 'character.json'), JSON.stringify({ name: 'P', knows: { cass: 'From before.' } }));
    const knows = async (persona?: object) => {
      await api('POST', '/api/playthroughs', { player, startContact: 'nix', ...(persona ? { persona } : {}) });
      return (await api('GET', '/api/playthroughs/active/contacts')).body.find((c: { id: string }) => c.id === 'cass')?.status;
    };
    expect(await knows()).toBe('knows');
    expect(built.world.tieFor('cass', player)).toBe('From before.');
    expect(await knows({ name: 'P2', background: '', kind: 'edit' })).toBe('knows');
    expect(await knows({ name: 'P3', background: '', kind: 'custom' })).toBeUndefined();
    expect(built.world.tieFor('cass', player)).toBeNull();
    expect(await knows({ name: 'P4', background: '' })).toBeUndefined();
  });

  it('standingStart: the tie start for the playthrough player, the Studio start for CUSTOM, null otherwise (Review Focus 2)', async () => {
    const { api, built, cfg } = await start({ others: ['cass'] });
    const player = built.world.active()!.player;
    fs.mkdirSync(path.join(cfg.charactersDir, player), { recursive: true });
    fs.writeFileSync(path.join(cfg.charactersDir, player, 'character.json'), JSON.stringify({ name: 'P', knows: { cass: { line: 'From before.', trust: 6 } } }));
    const cassFile = path.join(cfg.charactersDir, 'cass', 'character.json');
    const cass = fs.existsSync(cassFile) ? JSON.parse(fs.readFileSync(cassFile, 'utf8')) : { name: 'Cass' };
    fs.mkdirSync(path.dirname(cassFile), { recursive: true });
    fs.writeFileSync(cassFile, JSON.stringify({ ...cass, standing: { start: { trust: -3, warmth: 4 } } }));
    await api('POST', '/api/playthroughs', { player, startContact: 'nix' });
    expect(built.world.standingStart('cass', player)).toEqual({ trust: 6, warmth: 4 });
    const cassRow = (await api('GET', '/api/playthroughs/active/contacts')).body.find((c: { id: string }) => c.id === 'cass');
    expect(cassRow.standing).toEqual({ word: 'Trusts you', trust: 6, warmth: 4, last: null });
    expect(built.world.standingStart('nix', player)).toEqual({ trust: 0, warmth: 0 });
    expect(built.world.standingStart('cass', 'someone-else')).toBeNull();
    await api('POST', '/api/playthroughs', { player, startContact: 'nix', persona: { name: 'P3', background: '', kind: 'custom' } });
    expect(built.world.standingStart('cass', player)).toEqual({ trust: -3, warmth: 4 });
  });

  it('create takes a trimmed name', async () => {
    const { api, built } = await start();
    const r = await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix', name: '  My run  ' });
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('My run');
    expect(built.world.active()!.name).toBe('My run');
    expect((await api('POST', '/api/playthroughs', { player: 'x', startContact: 'nix', name: ' ' })).body).toEqual({ error: 'bad-name' });
  });

  it('create stores a persona', async () => {
    const { api, built } = await start();
    const r = await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix', persona: { name: ' Vee ', background: 'b' } });
    expect(r.status).toBe(200);
    expect(r.body.persona).toEqual({ name: 'Vee', background: 'b' });
    expect(built.world.active()!.persona).toEqual({ name: 'Vee', background: 'b' });
  });

  it('create with a bad persona is a 400 bad-persona and makes nothing', async () => {
    const { api, built } = await start();
    const player = built.world.active()!.player;
    const before = built.playthroughs.list().length;
    for (const persona of [{ name: '' }, { name: 'V', mode: 'x' }, 'Vee', null]) {
      expect(await api('POST', '/api/playthroughs', { player, startContact: 'nix', persona })).toEqual({ status: 400, body: { error: 'bad-persona' } });
    }
    expect(built.playthroughs.list().length).toBe(before);
  });

  it('create no longer takes a scene: the opening comes with the greeting (arrival screen spec §3)', async () => {
    const { api, built } = await start();
    const player = built.world.active()!.player;
    const before = built.playthroughs.list().length;
    expect(await api('POST', '/api/playthroughs', { player, startContact: 'nix', scene: { title: 'x', text: 'y', source: 'written' } })).toEqual({ status: 400, body: { error: 'bad-request' } });
    expect(built.playthroughs.list().length).toBe(before);
  });

  it('create refuses empty ids and contacts outside the roster', async () => {
    const { api, built } = await start();
    const player = built.world.active()!.player;
    const before = built.playthroughs.list().length;
    for (const body of [{ player: '', startContact: 'nix' }, { player, startContact: '' }, { player, startContact: 'ghost' }]) {
      expect(await api('POST', '/api/playthroughs', body)).toEqual({ status: 400, body: { error: 'bad-request' } });
    }
    expect(built.playthroughs.list().length).toBe(before);
  });

  it('load of a save whose snapshot is gone is 404', async () => {
    const { api, built, cfg } = await start();
    const id = built.world.active()!.id;
    const save = (await api('POST', `/api/playthroughs/${id}/saves`, { name: 'Keep' })).body;
    fs.rmSync(path.join(cfg.playthroughsDir, id, 'saves', save.id, 'playthrough.json'));
    expect(await api('POST', `/api/saves/${save.id}/load`)).toEqual({ status: 404, body: { error: 'not-found' } });
  });

  it('a save from a known contact\'s room is at her room, and moves the playthrough there', async () => {
    const { api, built } = await start({ others: ['cass'] });
    const pt = (await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix' })).body;
    const nix = (await built.runtime('nix'))!;
    nix.db.insertMessage(pt.player, { id: 'r1', role: 'agent', text: 'Call her.', toolLines: [], ts: 1, status: 'ok' });
    nix.db.shareContact({ contactId: 'cass', player: pt.player, messageId: 'r1', how: null, at: 2 });
    const cass = (await built.runtime('cass'))!;
    expect(cass.room.setScene({ id: 'karasu/noodle-stall' }, 'user').ok).toBe(true);
    // The playthrough is back with Nix; the SAVE comes from Cass's room.
    built.world.setLocation('nix');
    expect(built.world.active()!.location?.contactId).toBe('nix');

    const saved = await api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'Here', contactId: 'cass' });
    expect(saved.status).toBe(200);
    expect(saved.body.location).toEqual({ contactId: 'cass', sceneId: 'karasu/noodle-stall' });
    expect(built.world.active()!.location).toEqual({ contactId: 'cass', sceneId: 'karasu/noodle-stall' });
  });

  it('a save naming a contact the player doesn\'t know is at the playthrough\'s location', async () => {
    const { api, built } = await start({ others: ['cass'] });
    const pt = (await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix' })).body;
    const saved = await api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'Here', contactId: 'cass' });
    expect(saved.status).toBe(200);
    expect(saved.body.location?.contactId ?? 'nix').toBe('nix');
    expect(built.world.active()!.location?.contactId ?? 'nix').toBe('nix');
    expect((await api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'Here', contactId: 3 })).body).toEqual({ error: 'bad-request' });
  });

  it('list marks active', async () => {
    const { api, built } = await start();
    const first = built.world.active()!;
    const made = (await api('POST', '/api/playthroughs', { player: first.player, startContact: 'nix' })).body;
    const list = await api('GET', '/api/playthroughs');
    expect(list.body.active).toBe(made.id);
    expect(list.body.playthroughs.map((p: { id: string }) => p.id).sort()).toEqual([first.id, made.id].sort());
  });

  it('list counts each playthrough\'s known contacts', async () => {
    const { api, built } = await start();
    const made = (await api('POST', '/api/playthroughs', { player: built.world.active()!.player, startContact: 'nix' })).body;
    const list = await api('GET', '/api/playthroughs');
    // A new playthrough knows its start contact.
    expect(list.body.playthroughs.find((p: { id: string }) => p.id === made.id).contacts).toBe(1);
  });

  it("list says whether each playthrough's player has a sprite (the load screen asks only then)", async () => {
    const { api } = await start({
      prepare: (c) => {
        fs.mkdirSync(path.join(c.charactersDir, 'zed'), { recursive: true });
        fs.copyFileSync(path.join(__dirname, '..', '..', 'characters', 'hicks', 'hicks-outfit-outdoors.png'), path.join(c.charactersDir, 'zed', 'zed.png'));
        fs.writeFileSync(path.join(c.charactersDir, 'zed', 'character.json'), JSON.stringify({ name: 'Zed', sprite: { src: 'zed.png' } }));
      },
    });
    const zed = (await api('POST', '/api/playthroughs', { player: 'zed', startContact: 'nix' })).body;
    const ghost = (await api('POST', '/api/playthroughs', { player: 'ghost', startContact: 'nix' })).body;
    const list = (await api('GET', '/api/playthroughs')).body.playthroughs as { id: string; sprite: boolean }[];
    expect(list.find((p) => p.id === zed.id)!.sprite).toBe(true);
    expect(list.find((p) => p.id === ghost.id)!.sprite).toBe(false);
  });

  it('rename trims, and rejects empty, blank and over-long names with 400 bad-name', async () => {
    const { api, built } = await start();
    const id = built.world.active()!.id;
    for (const name of ['', '   ', 'x'.repeat(81), 5]) {
      const r = await api('PATCH', `/api/playthroughs/${id}`, { name });
      expect(r).toEqual({ status: 400, body: { error: 'bad-name' } });
    }
    const ok = await api('PATCH', `/api/playthroughs/${id}`, { name: '  Fresh start  ' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Fresh start');
    expect((await api('PATCH', `/api/playthroughs/${id}`, { name: 'x'.repeat(80) })).status).toBe(200);
    expect((await api('PATCH', '/api/playthroughs/pt-20260101-zzzz', { name: 'a' })).status).toBe(404);
    expect((await api('PATCH', '/api/playthroughs/nope', { name: 'a' })).body).toEqual({ error: 'not-found' });
  });

  it('delete active is 409 active', async () => {
    const { api, built } = await start();
    const first = built.world.active()!;
    expect(await api('DELETE', `/api/playthroughs/${first.id}`)).toEqual({ status: 409, body: { error: 'active' } });
    const other = (await api('POST', '/api/playthroughs', { player: first.player, startContact: 'nix' })).body;
    expect((await api('DELETE', `/api/playthroughs/${first.id}`)).status).toBe(204);
    expect(built.playthroughs.get(first.id)).toBeNull();
    expect(built.world.active()!.id).toBe(other.id);
    expect((await api('DELETE', `/api/playthroughs/${first.id}`)).status).toBe(404);
  });

  it('activate switches, 404s on unknown', async () => {
    const { api, built } = await start();
    const first = built.world.active()!;
    const other = built.playthroughs.create({ player: first.player, startContact: 'nix' });
    const r = await api('POST', `/api/playthroughs/${other.id}/activate`);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(other.id);
    expect(built.world.active()!.id).toBe(other.id);
    expect((await api('POST', '/api/playthroughs/pt-20260101-zzzz/activate')).status).toBe(404);
  });

  // One persona per playthrough: two games as the same player (cass), so the second comes up empty
  // only if the first's room.db kept her notes and page (moved here from two smoke e2e tests).
  it("two playthroughs as cass keep Nix's notes and her dossier page on Cass apart", async () => {
    const { api, built } = await start({ others: ['cass'] });
    const a = (await api('POST', '/api/playthroughs', { player: 'cass', startContact: 'nix' })).body;
    let nix = (await built.runtime('nix'))!;
    expect(nix.journal.note('cass', { text: 'cass owes 20', pinned: true }, 'agent').ok).toBe(true);
    expect(nix.journal.setPage('cass', 'Cass: tends bar, hard to rattle', 'agent').ok).toBe(true);
    const page = () => pageLine('Cass', nix.journal.page('cass').text);
    expect(nix.journal.journalLine('cass', [])).toContain('cass owes 20');

    const b = (await api('POST', '/api/playthroughs', { player: 'cass', startContact: 'nix' })).body;
    expect(b.id).not.toBe(a.id);
    nix = (await built.runtime('nix'))!;
    expect(nix.journal.journalLine('cass', [])).toBeNull();
    expect(page()).toBe('[your dossier on Cass: empty]');

    expect((await api('POST', `/api/playthroughs/${a.id}/activate`)).status).toBe(200);
    nix = (await built.runtime('nix'))!;
    expect(nix.journal.journalLine('cass', [])).toContain('cass owes 20');
    expect(page()).toBe('[your dossier on Cass: Cass: tends bar, hard to rattle]');
  });

  it('manual save returns SaveInfo', async () => {
    const { api, built } = await start();
    const id = built.world.active()!.id;
    const r = await api('POST', `/api/playthroughs/${id}/saves`, { name: '  Before the stall ' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ kind: 'manual', name: 'Before the stall', playthrough: id });
    const list = await api('GET', `/api/playthroughs/${id}/saves`);
    expect(list.body.map((x: { id: string }) => x.id)).toContain(r.body.id);
    expect((await api('POST', `/api/playthroughs/${id}/saves`, { name: ' ' })).body).toEqual({ error: 'bad-name' });
    const other = built.playthroughs.create({ player: 'x', startContact: 'nix' });
    expect(await api('POST', `/api/playthroughs/${other.id}/saves`, { name: 'a' })).toEqual({ status: 409, body: { error: 'not-active' } });
    expect((await api('GET', '/api/playthroughs/pt-20260101-zzzz/saves')).status).toBe(404);
  });

  it('load forks and activates; source untouched', async () => {
    const { api, built } = await start();
    const src = built.world.active()!;
    const save = (await api('POST', `/api/playthroughs/${src.id}/saves`, { name: 'Keep' })).body;
    const r = await api('POST', `/api/saves/${save.id}/load`);
    expect(r.status).toBe(200);
    expect(r.body.id).not.toBe(src.id);
    expect(r.body.forkedFrom).toMatchObject({ playthrough: src.id, save: save.id });
    expect(built.world.active()!.id).toBe(r.body.id);
    expect(built.playthroughs.get(src.id)).toEqual(src);
    expect(built.playthroughs.saves(src.id).map((x) => x.id)).toEqual([save.id]);
    expect((await api('POST', '/api/saves/sv-20260101-zzzz/load')).status).toBe(404);
  });

  it('load while busy is 409 and leaves no fork', async () => {
    const s = await start({ hold: true });
    const src = s.built.world.active()!;
    const save = (await s.api('POST', `/api/playthroughs/${src.id}/saves`, { name: 'Keep' })).body;
    const rt = await hold(s);
    const before = s.built.playthroughs.list().length;
    expect(await s.api('POST', `/api/saves/${save.id}/load`)).toEqual({ status: 409, body: { error: 'busy', contact: 'nix' } });
    expect(s.built.playthroughs.list().length).toBe(before);
    expect(s.built.world.active()!.id).toBe(src.id);
    expect(await s.api('POST', `/api/playthroughs/${src.id}/saves`, { name: 'x' })).toEqual({ status: 409, body: { error: 'busy', contact: 'nix' } });
    expect(await s.api('POST', '/api/playthroughs', { player: src.player, startContact: 'nix' })).toEqual({ status: 409, body: { error: 'busy', contact: 'nix' } });
    s.release();
    await until(() => !rt.relay.busy);
  });

  it('delete save removes it', async () => {
    const { api, built } = await start();
    const id = built.world.active()!.id;
    const save = (await api('POST', `/api/playthroughs/${id}/saves`, { name: 'Gone' })).body;
    expect((await api('DELETE', `/api/saves/${save.id}`)).status).toBe(204);
    expect(built.playthroughs.saves(id)).toEqual([]);
    // Deleting is idempotent; only a malformed id is refused.
    expect((await api('DELETE', `/api/saves/${save.id}`)).status).toBe(204);
    expect((await api('DELETE', '/api/saves/..%2Fx')).status).toBe(404);
  });

  it('leads lists held leads with the receiver\'s name and place, unmet without a portrait; followed last', async () => {
    const lead = (id: string, to: string) =>
      `---\ntitle: T ${id}\nfrom: nix\nto: ${to}\nkeys: [teo]\nfill: what he owes\nplace: The Marsh\n---\n## On her mind\nm\n## Giver knows\ng\n## Receiver knows\nr\n`;
    const { api, built, cfg } = await start({
      others: ['cass', 'vee'],
      prepare: (c) => {
        fs.mkdirSync(c.leadsDir!, { recursive: true });
        fs.writeFileSync(path.join(c.leadsDir!, 'a.md'), lead('a', 'cass'));
        fs.writeFileSync(path.join(c.leadsDir!, 'b.md'), lead('b', 'vee'));
      },
    });
    const pt = built.world.active()!;
    const dbFile = (c: string) => path.join(cfg.playthroughsDir, pt.id, 'chars', c, 'room.db');
    fs.mkdirSync(path.dirname(dbFile('nix')), { recursive: true });
    const nix = openDb(dbFile('nix'), { defaultPlayer: pt.player });
    nix.giveLead({ id: 'a', player: pt.player, details: 'Teo owes 4k. Three weeks to pay.', messageId: 'm1', at: 1 });
    nix.giveLead({ id: 'b', player: pt.player, details: 'Second.', messageId: 'm2', at: 2 });
    nix.close();
    fs.mkdirSync(path.dirname(dbFile('cass')), { recursive: true });
    const cass = openDb(dbFile('cass'), { defaultPlayer: pt.player });
    cass.setMeta(`lead.${pt.player}.a.followed`, '1');
    cass.insertMessage(pt.player, { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 3, status: 'ok' });
    cass.close();
    const r = await api('GET', '/api/playthroughs/active/leads');
    expect(r.status).toBe(200);
    // Her portrait as the contacts list has it (the fixture's Cass has none: null).
    const cassPortrait = (await api('GET', '/api/playthroughs/active/contacts')).body.find((c: { id: string }) => c.id === 'cass').portrait;
    expect(r.body).toEqual([
      { id: 'b', title: 'T b', details: 'Second.', to: 'vee', toName: 'Vee', place: 'The Marsh', portrait: null, met: false, followed: false },
      { id: 'a', title: 'T a', details: 'Teo owes 4k. Three weeks to pay.', to: 'cass', toName: 'Cass', place: 'The Marsh', portrait: cassPortrait, met: true, followed: true },
    ]);
  });

  it('leads with no playthrough is 409', async () => {
    const { api } = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect(await api('GET', '/api/playthroughs/active/leads')).toEqual({ status: 409, body: { error: 'no-playthrough' } });
  });

  it('contacts lists the known ones; location switches and refuses strangers', async () => {
    const { api, built } = await start();
    const c = await api('GET', '/api/playthroughs/active/contacts');
    expect(c.status).toBe(200);
    expect(c.body.map((x: { id: string }) => x.id)).toContain('nix');
    const ok = await api('POST', '/api/playthroughs/active/location', { contactId: 'nix' });
    expect(ok.status).toBe(200);
    expect(ok.body.contactId).toBe('nix');
    expect(built.world.active()!.location?.contactId).toBe('nix');
    expect(await api('POST', '/api/playthroughs/active/location', { contactId: 'ghost' })).toEqual({ status: 403, body: { error: 'unknown-contact' } });
    expect((await api('POST', '/api/playthroughs/active/location', {})).status).toBe(400);
  });

  it('solo sets the flag, twice is fine, and going to a contact clears it', async () => {
    const { api } = await start();
    const first = await api('POST', '/api/playthroughs/active/solo');
    expect(first.status).toBe(200);
    expect(first.body.solo).toBe(true);
    expect((await api('POST', '/api/playthroughs/active/solo')).status).toBe(200);
    expect((await api('POST', '/api/playthroughs/active/location', { contactId: 'nix' })).status).toBe(200);
    const list = await api('GET', '/api/playthroughs');
    const active = list.body.playthroughs.find((p: { id: string }) => p.id === list.body.active);
    expect('solo' in active).toBe(false);
  });

  it('loading a save made while solo comes back solo (final review 9)', async () => {
    const { api, built } = await start();
    const pt = built.world.active()!;
    await api('POST', '/api/playthroughs/active/solo');
    const saved = await api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'alone' });
    expect(saved.body.solo).toBe(true);
    const loaded = await api('POST', `/api/saves/${saved.body.id}/load`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.solo).toBe(true);
    expect(built.world.active()!.solo).toBe(true);
  });

  it('solo while a turn streams is 409 busy, and the playthrough stays as it was', async () => {
    const s = await start({ hold: true });
    await hold(s);
    expect(await s.api('POST', '/api/playthroughs/active/solo')).toEqual({ status: 409, body: { error: 'busy', contact: 'nix' } });
    expect(s.built.world.active()!.solo).toBeUndefined();
    s.release();
  });

  it('solo with no active playthrough is 409 no-playthrough', async () => {
    const { api } = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect(await api('POST', '/api/playthroughs/active/solo')).toEqual({ status: 409, body: { error: 'no-playthrough' } });
  });

  it('changes from another origin are refused; the page itself and requests without an Origin pass', async () => {
    const { built } = await start();
    const pt = built.world.active()!;
    const save = built.world.save('Keep') as { id: string };
    const as = async (origin: string | undefined, method: string, url: string, payload?: object) => {
      const res = await built.app.inject({ method: method as 'POST', url, payload, headers: origin ? { origin } : {} });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : undefined };
    };
    const evil = 'https://evil.example';
    const changes: [string, string, object?][] = [
      ['POST', '/api/playthroughs', { player: pt.player, startContact: 'nix' }],
      ['POST', `/api/playthroughs/${pt.id}/activate`],
      ['PATCH', `/api/playthroughs/${pt.id}`, { name: 'Renamed' }],
      ['DELETE', `/api/playthroughs/${pt.id}`],
      ['POST', `/api/playthroughs/${pt.id}/saves`, { name: 'x' }],
      ['POST', `/api/saves/${save.id}/load`],
      ['DELETE', `/api/saves/${save.id}`],
      ['POST', '/api/playthroughs/active/location', { contactId: 'nix' }],
    ];
    for (const [method, url, payload] of changes) {
      expect(await as(evil, method, url, payload), `${method} ${url}`).toEqual({ status: 403, body: { error: 'origin' } });
    }
    expect(built.playthroughs.list()).toHaveLength(1);
    expect(built.playthroughs.get(pt.id)!.name).toBe(pt.name);
    expect(built.playthroughs.saves(pt.id)).toHaveLength(1);
    // Reads aren't changes.
    expect((await as(evil, 'GET', '/api/playthroughs')).status).toBe(200);
    expect((await as('http://localhost:5173', 'PATCH', `/api/playthroughs/${pt.id}`, { name: 'Mine' })).status).toBe(200);
    expect((await as(undefined, 'PATCH', `/api/playthroughs/${pt.id}`, { name: 'Curl' })).status).toBe(200);
  });

  it('contacts and location with no playthrough are 409', async () => {
    const { api } = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect(await api('GET', '/api/playthroughs/active/contacts')).toEqual({ status: 409, body: { error: 'no-playthrough' } });
    expect(await api('POST', '/api/playthroughs/active/location', { contactId: 'nix' })).toEqual({ status: 409, body: { error: 'no-playthrough' } });
    expect((await api('GET', '/api/playthroughs')).body).toMatchObject({ active: null, playthroughs: [] });
  });
});

describe('the story clock', () => {
  /** One finished rp turn with `id` over her socket; returns her reply. */
  async function turn(s: Awaited<ReturnType<typeof start>>, id: string, text = 'hi') {
    const rt = (await s.built.runtime(id))!;
    const player = s.built.world.active()!.player;
    const before = rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok').length;
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws/${id}?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
    ws.on('error', () => {});
    cleanups.push(() => ws.close());
    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(JSON.stringify({ type: 'user_message', text }));
    await until(() => rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok').length > before && !rt.relay.busy);
    return rt.db.recentMessages(player).filter((m) => m.role === 'agent').at(-1)!;
  }
  const clock = async (s: Awaited<ReturnType<typeof start>>) => (await s.api('GET', '/api/playthroughs/active/clock')).body.clock;

  it('starts at Day 1 20:00; turns move it, on any contact (Review Focus 4)', async () => {
    const s = await start({ others: ['cass'] });
    expect(await clock(s)).toBe(1200);
    await turn(s, 'nix');
    expect(await clock(s)).toBe(1205);
    await turn(s, 'cass');
    expect(await clock(s)).toBe(1210);
  });

  it('the lobby has no clock (final review 2)', async () => {
    const none = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect(none.built.world.clockNow()).toBeNull();
  });

  it('WAIT moves it; a bad wait is 400; with no playthrough 409', async () => {
    const s = await start();
    expect(await s.api('POST', '/api/playthroughs/active/wait', { minutes: 60 })).toEqual({ status: 200, body: { clock: 1260 } });
    expect((await s.api('POST', '/api/playthroughs/active/wait', { until: '05:00' })).body).toEqual({ clock: 1440 + 300 });
    expect((await s.api('POST', '/api/playthroughs/active/wait', { minutes: 0 })).status).toBe(400);
    expect((await s.api('POST', '/api/playthroughs/active/wait', { until: '5am' })).status).toBe(400);
    expect((await s.api('POST', '/api/playthroughs/active/wait', { minutes: 5, until: '05:00' })).status).toBe(400);
    const none = await start({ prepare: (c) => (c.autoPlaythrough = false) });
    expect((await none.api('GET', '/api/playthroughs/active/clock')).status).toBe(409);
  });

  it("WAIT asks only the room you're in to play a quest waiting for this moment (quest waits spec §3; review C1)", async () => {
    const s = await start({ others: ['cass'] });
    await turn(s, 'nix'); // you're with Nix now
    const here = vi.spyOn((await s.built.runtime('nix'))!.relay, 'playDueQuest');
    const away = vi.spyOn((await s.built.runtime('cass'))!.relay, 'playDueQuest');
    const before = s.built.world.active()!.location;
    await s.api('POST', '/api/playthroughs/active/wait', { minutes: 60 });
    expect(here).toHaveBeenCalledWith(s.built.world.active()!.player);
    expect(away).not.toHaveBeenCalled();
    expect(s.built.world.active()!.location).toEqual(before);
  });

  it("a text to someone else never moves you (deck spec §2)", async () => {
    const s = await start({ others: ['cass'] });
    await turn(s, 'nix'); // you're with Nix
    const before = s.built.world.active()!;
    const cass = (await s.built.runtime('cass'))!;
    expect(await cass.relay.sendText(before.player, 'you up?', 'home')).toMatchObject({ ok: true });
    const after = s.built.world.active()!;
    expect(after.location).toEqual(before.location);
    expect(after.solo ?? false).toBe(before.solo ?? false);
    expect(after.parted ?? {}).toEqual(before.parted ?? {});
  });

  it('WAIT stops at the hour a quest here is waiting for (final review I1)', async () => {
    const s = await start();
    await turn(s, 'nix');
    const now = s.built.world.clockNow()!;
    vi.spyOn((await s.built.runtime('nix'))!.relay, 'questWaitStop').mockReturnValue(now + 30);
    expect((await s.api('POST', '/api/playthroughs/active/wait', { minutes: 120 })).body).toEqual({ clock: now + 30 });
  });

  it('WAIT past midnight turns the room you are in late once; walking into a room then opens it late (story moods)', async () => {
    const s = await start();
    await turn(s, 'nix');
    const rt = (await s.built.runtime('nix'))!;
    const player = s.built.world.active()!.player;
    const late = () => rt.room.scene().presets.late;
    expect(late()).toBeDefined();
    const applied = vi.spyOn(rt.room, 'applyPreset');
    const moods = () => applied.mock.calls.filter(([a, src]) => a.name === 'late' && src === 'world').length;
    await s.api('POST', '/api/playthroughs/active/wait', { until: '00:10' });
    expect(rt.db.getMeta('storyMood.key')).toBe('late@2');
    expect(moods()).toBe(1);
    if (late()!.ambientLevel !== undefined) expect(rt.room.state.atmosphere.ambientLevel).toBe(late()!.ambientLevel);
    // Another WAIT inside the same window changes nothing (her own mood would hold).
    await s.api('POST', '/api/playthroughs/active/wait', { minutes: 30 });
    expect(moods()).toBe(1);
    // Walking into another room: it resets to its defaults, then opens on late.
    const here = rt.room.state.sceneId;
    for (const sc of rt.room.listScenes().filter((x) => x.id !== here)) {
      const before = moods();
      rt.room.setScene({ id: sc.id }, 'user');
      await new Promise((r) => setTimeout(r, 0));
      if (!late()) continue;
      expect(moods()).toBe(before + 1);
      return;
    }
    throw new Error('no other room with a late mood in the fixture');
  });

  it('a move and her own mood in the same round: her mood stands (story moods, final review I1)', async () => {
    const s = await start();
    await turn(s, 'nix');
    const rt = (await s.built.runtime('nix'))!;
    await s.api('POST', '/api/playthroughs/active/wait', { until: '00:10' });
    const here = rt.room.state.sceneId;
    const other = rt.room.listScenes().find((x) => x.id !== here)!;
    rt.room.setScene({ id: other.id }, 'agent');
    rt.room.applyPreset({ name: 'quiet' }, 'agent');
    const { weather: _w, weatherLevel: _l, ...quiet } = rt.room.state.atmosphere;
    await new Promise((r) => setTimeout(r, 0));
    // Her mood stands (the weather is the city's: city weather spec §4).
    const { weather: _w2, weatherLevel: _l2, ...after } = rt.room.state.atmosphere;
    expect(after).toEqual(quiet);
    expect(rt.db.getMeta('storyMood.key')).toBe('late@2');
  });

  describe('city weather', () => {
    async function withNix(o: { others?: string[] } = {}) {
      const s = await start(o);
      await turn(s, 'nix');
      const rt = (await s.built.runtime('nix'))!;
      const move = async (id: string) => {
        rt.room.setScene({ id }, 'user');
        await new Promise((r) => setTimeout(r, 0));
      };
      const city = () => s.built.world.active()!.weather;
      const level = () => rt.room.state.atmosphere.weatherLevel;
      return { s, rt, move, city, level };
    }

    it('the rain follows you; a move never records its painted rain (Review Focus 1)', async () => {
      const { rt, move, city, level } = await withNix();
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
      await move('karasu/noodle-stall');
      expect(level()).toBe(1);
      expect(city()).toEqual({ weather: 'rain', level: 1 });
    });

    it("a non-weather mood and fog alone don't move it", async () => {
      const { rt, move, city, level } = await withNix();
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      rt.room.applyPreset({ name: 'quiet' }, 'agent');
      rt.room.setAtmosphere({ fog: 0.9 }, 'agent');
      expect(level()).toBe(1);
      expect(city()).toEqual({ weather: 'rain', level: 1 });
    });

    it('a rewind that undoes a storm brings the old rain back, and the next room takes it (Review Focus 2)', async () => {
      const { s, rt, move, city, level } = await withNix();
      const player = s.built.world.active()!.player;
      await move('karasu/lowlight-intake');
      const before = city()!;
      const line = await turn(s, 'nix');
      await turn(s, 'nix');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
      await rt.relay.rewind(player, line.id);
      await new Promise((r) => setTimeout(r, 0));
      expect(city()).toEqual(before);
      await move('karasu/ribbon-rooftop');
      expect(level()).toBe(before.level);
    });

    it("rewinding her chat past your join leaves the city's weather alone (minors)", async () => {
      const { s, rt, move, city } = await withNix({ others: ['cass'] });
      const player = s.built.world.active()!.player;
      await turn(s, 'cass');
      const cass = (await s.built.runtime('cass'))!;
      const early = cass.db.recentMessages(player).find((m) => m.role === 'user')!;
      await turn(s, 'nix');
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      await turn(s, 'cass'); // back with her: her room takes the storm
      await new Promise((r) => setTimeout(r, 0));
      expect(cass.room.state.atmosphere.weatherLevel).toBe(1);
      await cass.relay.rewind(player, early.id);
      await new Promise((r) => setTimeout(r, 0));
      expect(city()).toEqual({ weather: 'rain', level: 1 });
      expect(cass.room.state.atmosphere.weatherLevel).toBe(1);
    });

    it('on comms her room is away: it neither gives the city weather nor takes it (minors)', async () => {
      const { s, rt, move, city } = await withNix();
      const player = s.built.world.active()!.player;
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      rt.db.setMeta(commsKey(player), JSON.stringify({ on: true, at: 'karasu/noodle-stall' }));
      rt.room.setAtmosphere({ weather: 'rain', weather_level: 0.2 }, 'dev');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
    });

    it("the first room you're with gives the city its rain; the next room takes it (Review Focus 3)", async () => {
      const { rt, move, city, level } = await withNix();
      const first = rt.room.state.atmosphere;
      expect(city()).toEqual({ weather: first.weather, level: first.weatherLevel });
      const other = rt.room.listScenes().find((x) => x.id !== rt.room.state.sceneId)!;
      await move(other.id);
      expect(level()).toBe(first.weatherLevel);
    });

    it("the story mood's walk-in can't undo it (Review Focus 4)", async () => {
      const { s, rt, move, level } = await withNix();
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      await s.api('POST', '/api/playthroughs/active/wait', { until: '00:10' });
      await move('karasu/noodle-stall');
      expect(level()).toBe(1);
      expect(rt.db.getMeta('storyMood.key')).toMatch(/^late@/);
    });

    it('joining a contact takes the city weather even with no move; her room never gives it while you are away (Task 3 review I1)', async () => {
      const { s, rt, move, city } = await withNix({ others: ['cass'] });
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      const cass = (await s.built.runtime('cass'))!;
      cass.room.setAtmosphere({ weather: 'rain', weather_level: 0.2 }, 'dev');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
      await turn(s, 'cass');
      await new Promise((r) => setTimeout(r, 0));
      expect(cass.room.state.atmosphere.weatherLevel).toBe(1);
      cass.room.setLight({ light_id: cass.room.state.lights[0]!.id, intensity: 0.1 }, 'agent');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
    });

    it("a branch is as of its line: a storm that started after it isn't in the branch (final review I1)", async () => {
      const { s, rt, move } = await withNix();
      const player = s.built.world.active()!.player;
      const line = rt.db.recentMessages(player).find((m) => m.role === 'agent')!;
      await turn(s, 'nix');
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      expect(s.built.world.active()!.weather).toEqual({ weather: 'rain', level: 1 });
      const b = s.built.world.branch('nix', line.id);
      if (b === 'unknown' || 'busy' in b) throw new Error('branch failed');
      const branched = (await s.built.runtime('nix'))!;
      await new Promise((r) => setTimeout(r, 0));
      const a = branched.room.state.atmosphere;
      expect(a.weatherLevel).not.toBe(1);
      expect(s.built.world.active()!.weather).toEqual({ weather: a.weather, level: a.weatherLevel });
    });

    it('a room painted with no weather neither takes nor gives (Review Focus 5)', async () => {
      const { rt, move, city, level } = await withNix();
      await move('karasu/lowlight-intake');
      rt.room.applyPreset({ name: 'storm' }, 'dev');
      const real = rt.room.scene.bind(rt.room);
      const dry = vi.spyOn(rt.room, 'scene').mockImplementation(() => ({ ...real(), defaults: { ...real().defaults, weather: 'none' } }));
      await move('karasu/ribbon-rooftop');
      expect(level()).toBe(0.8); // its own, not the city's storm
      rt.room.setAtmosphere({ weather: 'rain', weather_level: 0.2 }, 'agent');
      expect(city()).toEqual({ weather: 'rain', level: 1 });
      dry.mockRestore();
      await move('karasu/noodle-stall');
      expect(level()).toBe(1);
    });
  });

  it('a rewind takes the clock back, but never past a WAIT (Review Focus 3); a branch from a line is at its time', async () => {
    const s = await start();
    const first = await turn(s, 'nix');
    await turn(s, 'nix');
    await turn(s, 'nix');
    expect(await clock(s)).toBe(1215);
    const rt = (await s.built.runtime('nix'))!;
    const player = s.built.world.active()!.player;
    await rt.relay.rewind(player, first.id);
    expect(await clock(s)).toBe(1205);
    await turn(s, 'nix');
    await s.api('POST', '/api/playthroughs/active/wait', { minutes: 60 });
    expect(await clock(s)).toBe(1270);
    await rt.relay.rewind(player, first.id);
    expect(await clock(s)).toBe(1270);
    const b = s.built.world.branch('nix', first.id);
    if (b === 'unknown' || 'busy' in b) throw new Error('branch failed');
    expect(await clock(s)).toBe(1205);
  });

  it('rewind, delete and undo tell the tabs the clock (Task 2 review 2)', async () => {
    const s = await start();
    const first = await turn(s, 'nix');
    await turn(s, 'nix');
    const rt = (await s.built.runtime('nix'))!;
    const player = s.built.world.active()!.player;
    const seen: number[] = [];
    const hub = rt.hub as unknown as { emit: (e: { type: string; clock?: number }) => void };
    const emit = hub.emit.bind(rt.hub);
    hub.emit = (e) => {
      if (e.type === 'clock') seen.push(e.clock!);
      emit(e as never);
    };
    await rt.relay.rewind(player, first.id);
    expect(seen.at(-1)).toBe(1205);
    const [u] = rt.db.recentMessages(player).filter((m) => m.role === 'user');
    const her = rt.db.recentMessages(player).find((m) => m.role === 'agent')!;
    await rt.relay.remove(player, her.id);
    await rt.relay.remove(player, u!.id);
    expect(seen.at(-1)).toBe(1200);
    await rt.relay.restore(player, u!);
    expect(seen.at(-1)).toBe(1205);
  });

  it('WAIT while a turn streams is 409 busy', async () => {
    const s = await start({ hold: true });
    await hold(s);
    expect((await s.api('POST', '/api/playthroughs/active/wait', { minutes: 60 })).status).toBe(409);
    s.release();
  });

  it('a save records the clock', async () => {
    const s = await start();
    await turn(s, 'nix');
    const pt = s.built.world.active()!;
    expect((await s.api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'x' })).body.clock).toBe(1205);
  });
});

describe('schedules', () => {
  // Nix: Noodle Stall 20:00–04:00, The Roof 04:00–08:00; free in the day. Cass has none. (The fixture has three rooms: the Intake stands in for the Public Landing, the place you leave her.)
  const SCHEDULE = [
    { from: '20:00', to: '04:00', room: 'karasu/noodle-stall' },
    { from: '04:00', to: '08:00', room: 'karasu/ribbon-rooftop' },
  ];
  const prepare = (c: Config) => {
    const file = path.join(c.charactersDir, 'nix', 'character.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const was = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    fs.writeFileSync(file, JSON.stringify({ ...was, schedule: SCHEDULE }));
  };
  async function world() {
    const s = await start({ others: ['cass'], prepare });
    const player = s.built.world.active()!.player;
    await s.api('POST', '/api/playthroughs', { player, startContact: 'cass' });
    // Nix known from the start, so she's listed as a contact (a tie).
    return s;
  }
  const whereIs = (s: Awaited<ReturnType<typeof start>>, id: string) =>
    (s.built.world.around().find((e) => e.contactId === id)?.sceneId ?? s.built.world.contacts().find((c) => c.id === id)?.sceneId) as string;
  const wait = (s: Awaited<ReturnType<typeof start>>, b: object) => s.api('POST', '/api/playthroughs/active/wait', b);

  it("who's here follows the clock: Nix is at the stall in her block, gone after, back at an earlier clock", async () => {
    const s = await world();
    const w = s.built.world;
    expect(w.othersHere('cass', 'karasu/noodle-stall')).toEqual([expect.objectContaining({ id: 'nix', kind: 'contact' })]);
    const at2000 = w.clockNow()!;
    await wait(s, { until: '05:00' });
    expect(w.othersHere('cass', 'karasu/noodle-stall')).toEqual([]);
    expect(w.othersHere('cass', 'karasu/noodle-stall', at2000).map((p) => p.id)).toEqual(['nix']);
  });

  it("who's here never lists the contact you're with, even when her schedule puts her there", async () => {
    const s = await world();
    expect(s.built.world.othersHere('nix', 'karasu/noodle-stall')).toEqual([]);
  });

  it("her model hears about Nix from Nix's file and voice.md, never her identity.md", async () => {
    const s = await start({
      others: ['cass'],
      prepare: (c) => {
        prepare(c);
        const dir = path.join(c.charactersDir, 'nix');
        fs.writeFileSync(path.join(dir, 'identity.md'), 'IDENTITY-SENTINEL');
        fs.writeFileSync(path.join(dir, 'voice.md'), 'Quick, dry, warm underneath.');
        const file = path.join(dir, 'character.json');
        fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), voice: 'voice.md' }));
      },
    });
    await s.api('POST', '/api/playthroughs', { player: s.built.world.active()!.player, startContact: 'cass' });
    const rt = (await s.built.runtime('cass'))!;
    rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
    const [nix] = rt.othersNow();
    expect(nix).toMatchObject({ id: 'nix', kind: 'contact', voice: 'Quick, dry, warm underneath.' });
    expect(nix.file).toContain("[who's here: Nix");
    expect(JSON.stringify(nix)).not.toContain('IDENTITY-SENTINEL');
  });

  it("the room tells its tabs who's here when the clock moves, and never the same list twice", async () => {
    const s = await world();
    const rt = (await s.built.runtime('cass'))!;
    rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
    const seen: string[][] = [];
    const hub = rt.hub as unknown as { emit: (e: { type: string; others?: { id: string }[] }) => void };
    const emit = hub.emit.bind(rt.hub);
    hub.emit = (e) => {
      if (e.type === 'others') seen.push(e.others!.map((o) => o.id));
      emit(e as never);
    };
    await wait(s, { minutes: 10 });
    await wait(s, { until: '05:00' });
    await wait(s, { minutes: 10 });
    // Moving to the stall already sent [nix]; ten more minutes change nothing; 05:00 takes her away.
    expect(seen).toEqual([[]]);
  });

  it("someone who leaves keeps their tile until her next reply ends, so their goodbye is theirs (final review C1)", async () => {
    const s = await world();
    const rt = (await s.built.runtime('cass'))!;
    rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
    const player = s.built.world.active()!.player;
    const at = s.built.world.clockNow()!;
    rt.db.insertMessage(player, { id: 'r1', role: 'agent', text: 'Hi.', toolLines: [], ts: 1, status: 'ok', clock: at });
    const seen: string[][] = [];
    const hub = rt.hub as unknown as { emit: (e: { type: string; others?: { id: string }[] }) => void };
    const emit = hub.emit.bind(rt.hub);
    hub.emit = (e) => {
      if (e.type === 'others') seen.push(e.others!.map((o) => o.id));
      emit(e as never);
    };
    await wait(s, { until: '05:00' });
    expect(seen).toEqual([]);
    rt.db.insertMessage(player, { id: 'r2', role: 'agent', text: 'Nix: Bye.', toolLines: [], ts: 2, status: 'ok', clock: s.built.world.clockNow()! });
    rt.refreshOthers();
    expect(seen).toEqual([[]]);
  });

  it("the room's voices: everyone who could speak in her replies, whoever's here now, never her, you or a namesake (final review C1)", async () => {
    const s = await world();
    const rt = (await s.built.runtime('cass'))!;
    await wait(s, { until: '05:00' });
    const ids = rt.voices().map((v) => v.id);
    expect(ids).toContain('nix');
    expect(ids).not.toContain('cass');
    expect(ids).not.toContain(s.built.world.active()!.player);
  });

  it("someone leaving can still have their face set on the reply that plays their goodbye (final review M1)", async () => {
    const s = await start({
      others: ['cass'],
      prepare: (c) => {
        prepare(c);
        const dir = path.join(c.charactersDir, 'nix');
        const art = path.join(__dirname, '..', '..', 'characters', 'nix');
        fs.copyFileSync(path.join(art, fs.readdirSync(art).find((f) => f.endsWith('-happy.png'))!), path.join(dir, 'happy.png'));
        fs.copyFileSync(path.join(art, fs.readdirSync(art).find((f) => f.includes('-outfit-') && f.endsWith('.png'))!), path.join(dir, 'sprite.png'));
        const file = path.join(dir, 'character.json');
        fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), sprite: { src: 'sprite.png' }, expressions: { happy: 'happy.png' } }));
      },
    });
    await s.api('POST', '/api/playthroughs', { player: s.built.world.active()!.player, startContact: 'cass' });
    const rt = (await s.built.runtime('cass'))!;
    rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
    const player = s.built.world.active()!.player;
    expect(rt.tools.others?.().map((o) => o.id)).toEqual(['nix']);
    rt.db.insertMessage(player, { id: 'r1', role: 'agent', text: 'Hi.', toolLines: [], ts: 1, status: 'ok', clock: s.built.world.clockNow()! });
    await wait(s, { until: '05:00' });
    expect(rt.tools.others?.().map((o) => o.id)).toEqual(['nix']);
  });

  it("nextPlaceOf: her next block's place, or null without a schedule", async () => {
    const s = await world();
    const w = s.built.world;
    expect(w.nextPlaceOf('nix', w.clockNow()!)).toBe(w.placeName('karasu/ribbon-rooftop'));
    expect(w.nextPlaceOf('cass', w.clockNow()!)).toBeNull();
  });

  it('never parted: she is where her schedule says', async () => {
    const s = await world();
    expect(whereIs(s, 'nix')).toBe('karasu/noodle-stall');
    await wait(s, { until: '05:00' });
    expect(whereIs(s, 'nix')).toBe('karasu/ribbon-rooftop');
    await wait(s, { until: '10:00' });
    // Free: wherever she last was (her own room as it is — her start room here).
    expect(whereIs(s, 'nix')).not.toBe('karasu/ribbon-rooftop');
  });

  it("walking in moves her room to her scheduled place quietly: no travel line, no checkpoint (Review Focus 5); a room opened after is there too", async () => {
    const s = await world();
    const pt = s.built.world.active()!;
    const saves = () => s.built.playthroughs.saves(pt.id).length;
    const before = saves();
    expect(s.built.world.setLocation('nix')).toMatchObject({ contactId: 'nix', sceneId: 'karasu/noodle-stall' });
    const rt = (await s.built.runtime('nix'))!;
    expect(rt.room.state.sceneId).toBe('karasu/noodle-stall');
    expect(rt.db.recentMessages(pt.player).some((m) => m.mode === 'travel')).toBe(false);
    expect(saves()).toBe(before);
  });

  it('the Public Landing example: left behind mid-block she stays until her next block starts', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    expect(rt.room.setScene({ id: 'karasu/lowlight-intake' }, 'user').ok).toBe(true);
    await wait(s, { minutes: 120 }); // 22:00
    s.built.world.setLocation('cass');
    expect(whereIs(s, 'nix')).toBe('karasu/lowlight-intake');
    await wait(s, { minutes: 60 }); // 23:00, still the 20:00 block
    expect(whereIs(s, 'nix')).toBe('karasu/lowlight-intake');
    await wait(s, { until: '05:00' }); // the 04:00 block started
    expect(whereIs(s, 'nix')).toBe('karasu/ribbon-rooftop');
  });

  it('her place on comms: her schedule, never your room (comms plan Task 1)', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    // You went on comms from the stall to the Intake: her room follows you, she stays on her schedule.
    rt.db.setMeta(`comms.${w.active()!.player}`, JSON.stringify({ on: true, at: 'karasu/noodle-stall' }));
    expect(rt.room.setScene({ id: 'karasu/lowlight-intake' }, 'user').ok).toBe(true);
    expect(whereIs(s, 'nix')).toBe('karasu/noodle-stall');
    expect(w.othersHere('cass', 'karasu/noodle-stall').map((p) => p.id)).toContain('nix');
    expect(w.othersHere('nix', 'karasu/lowlight-intake').map((p) => p.id)).not.toContain('nix');
    await wait(s, { until: '05:00' });
    expect(whereIs(s, 'nix')).toBe('karasu/ribbon-rooftop');
  });

  it('the line ended, then solo: she is back where the line began, not where you were (comms plan Task 4)', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('cass');
    const rt = (await s.built.runtime('cass'))!;
    const was = rt.room.state.sceneId;
    const other = was === 'karasu/noodle-stall' ? 'karasu/lowlight-intake' : 'karasu/noodle-stall';
    expect(rt.room.setScene({ id: other }, 'user').ok).toBe(true);
    // HANG UP wrote the line off, remembering where it began.
    rt.db.setMeta(`comms.${w.active()!.player}`, JSON.stringify({ on: false, at: was }));
    w.goSolo();
    expect(whereIs(s, 'cass')).toBe(was);
  });

  it('C1: SAVE from her room on comms keeps you where you are', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    rt.db.setMeta(`comms.${w.active()!.player}`, JSON.stringify({ on: true, at: 'karasu/noodle-stall' }));
    expect(rt.room.setScene({ id: 'karasu/lowlight-intake' }, 'user').ok).toBe(true);
    const pt = w.active()!;
    expect((await s.api('POST', `/api/playthroughs/${pt.id}/saves`, { name: 'x', contactId: 'nix' })).status).toBe(200);
    expect(rt.room.state.sceneId).toBe('karasu/lowlight-intake');
  });

  it('I2: a comms move is stamped to its travel row, so rewinding past it takes the move and the line back', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    const player = w.active()!.player;
    const from = rt.room.state.sceneId;
    // A room that has been written before (a real playthrough's always has): the rewind has something to restore.
    rt.room.setScene({ id: 'karasu/ribbon-rooftop' }, 'user');
    rt.room.setScene({ id: from }, 'user');
    // Her deal in force (trust high), or the line would drop at once.
    rt.db.setMeta(`standing.${player}`, JSON.stringify({ trust: 6, warmth: 0, moves: [] }));
    rt.db.setMeta(`arrangement.${player}`, JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 0 }));
    await rt.relay.send(player, 'hi');
    const before = rt.db.recentMessages(player).at(-1)!;
    await rt.relay.travel(player, { from: 'A', to: 'B', contact: 'Nix', comms: { on: true, at: from }, move: () => rt.room.setScene({ id: 'karasu/lowlight-intake' }, 'user') });
    expect(rt.room.state.sceneId).toBe('karasu/lowlight-intake');
    await rt.relay.rewind(player, before.id);
    expect(rt.room.state.sceneId).toBe(from);
    expect(rt.relay.commsNow(player)?.on ?? false).toBe(false);
  });

  it('on comms with no schedule: where the line began', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('cass');
    const rt = (await s.built.runtime('cass'))!;
    const was = rt.room.state.sceneId;
    rt.db.setMeta(`comms.${w.active()!.player}`, JSON.stringify({ on: true, at: was }));
    expect(rt.room.setScene({ id: was === 'karasu/noodle-stall' ? 'karasu/lowlight-intake' : 'karasu/noodle-stall' }, 'user').ok).toBe(true);
    expect(whereIs(s, 'cass')).toBe(was);
  });

  it('with you she stays; her prompt has her schedule, or free (Review Focus 5)', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const place = (id: string) => s.built.world.placeName(id);
    expect(s.built.world.scheduleLine('nix')).toBe(`[your schedule: ${place('karasu/noodle-stall')} until 04:00; then ${place('karasu/ribbon-rooftop')} 04:00–08:00]`);
    await wait(s, { until: '05:00' });
    const rt = (await s.built.runtime('nix'))!;
    expect(rt.room.state.sceneId).toBe('karasu/noodle-stall');
    await wait(s, { until: '10:00' });
    expect(s.built.world.scheduleLine('nix')).toBe(`[your schedule: free until 20:00, then ${place('karasu/noodle-stall')}]`);
    expect(s.built.world.scheduleLine('cass')).toBeNull();
  });

  it('weekdays (spec 2026-10-20): a weeknights block leaves her free on Saturday, and her line names Monday', async () => {
    const s = await start({
      others: ['cass'],
      prepare: (c) => {
        prepare(c);
        const file = path.join(c.charactersDir, 'nix', 'character.json');
        const was = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(file, JSON.stringify({ ...was, schedule: [{ from: '20:00', to: '04:00', room: 'karasu/noodle-stall', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }] }));
      },
    });
    await s.api('POST', '/api/playthroughs', { player: s.built.world.active()!.player, startContact: 'cass' });
    const w = s.built.world;
    const place = (id: string) => w.placeName(id);
    // Day 1 is a Thursday: on shift, back tomorrow, as a daily block reads. Friday she's off till Monday.
    expect(w.scheduledRoomOf('nix')).toBe('karasu/noodle-stall');
    expect(w.scheduleLine('nix', 1260)).toBe(`[your schedule: ${place('karasu/noodle-stall')} until 04:00]`);
    // On the very minute it starts (WAIT until 20:00 lands there), tomorrow's start is exactly a day off: still plain (final review I1).
    expect(w.scheduleLine('nix', 1200)).toBe(`[your schedule: ${place('karasu/noodle-stall')} until 04:00]`);
    expect(w.scheduleLine('nix', 1440 + 1260)).toBe(`[your schedule: ${place('karasu/noodle-stall')} until 04:00; then ${place('karasu/noodle-stall')} Monday 20:00–04:00]`);
    // Friday's night still holds Saturday 02:00; Saturday 21:00 she's off.
    expect(w.scheduleLine('nix', 2 * 1440 + 120)).toBe(`[your schedule: ${place('karasu/noodle-stall')} until 04:00; then ${place('karasu/noodle-stall')} Monday 20:00–04:00]`);
    expect(w.scheduleLine('nix', 2 * 1440 + 1260)).toBe(`[your schedule: free until Monday 20:00, then ${place('karasu/noodle-stall')}]`);
    await wait(s, { minutes: 1440 });
    await wait(s, { minutes: 1440 });
    expect(w.clockNow()).toBe(2 * 1440 + 1200); // Saturday 20:00
    expect(w.scheduledRoomOf('nix')).toBeNull();
  });

  it('a rewind to before you parted: the parting never happened, her schedule applies (Review Focus 2)', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    const player = s.built.world.active()!.player;
    // Two lines with her (stamps 1205, 1210), then she walks you to the landing and you part.
    for (const [id, clock] of [['u1', 1205], ['u2', 1210]] as const) rt.db.insertMessage(player, { id, role: 'user', text: 'hi', toolLines: [], ts: clock, status: 'ok', clock });
    rt.room.setScene({ id: 'karasu/lowlight-intake' }, 'user');
    s.built.world.setLocation('cass');
    expect(whereIs(s, 'nix')).toBe('karasu/lowlight-intake');
    await rt.relay.rewind(player, 'u1');
    expect(s.built.world.clock()).toBe(1205);
    expect(whereIs(s, 'nix')).toBe('karasu/noodle-stall');
  });

  it("a room page opened on her (a typed URL) puts you with her and leaves the other one where she was", async () => {
    const s = await world();
    s.built.world.setLocation('cass');
    await wait(s, { minutes: 30 });
    s.built.world.entered('nix');
    const pt = s.built.world.active()!;
    expect(pt.location?.contactId).toBe('nix');
    expect(pt.parted?.cass).toBe(1230);
    expect(pt.parted?.nix).toBeUndefined();
  });

  it('a turn ending in another tab moves you and records leaving her (final review 3)', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    await wait(s, { minutes: 30 });
    await s.built.runtime('cass');
    s.built.world.turnEnded('cass');
    const pt = s.built.world.active()!;
    expect(pt.location?.contactId).toBe('cass');
    expect(pt.parted?.nix).toBe(1230);
  });

  it('a rewound parting is dropped, not just ignored (final review minor 1); a branch keeps the partings up to its line (minor 2)', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const rt = (await s.built.runtime('nix'))!;
    const player = s.built.world.active()!.player;
    for (const [id, clock] of [['u1', 1205], ['u2', 1210]] as const) rt.db.insertMessage(player, { id, role: 'user', text: 'hi', toolLines: [], ts: clock, status: 'ok', clock });
    s.built.world.setLocation('cass');
    expect(s.built.world.active()!.parted?.nix).toBe(1210);
    const b = s.built.world.branch('nix', 'u2');
    if (b === 'unknown' || 'busy' in b) throw new Error('branch failed');
    expect(s.built.world.active()!.parted?.nix).toBe(1210);
    const rt2 = (await s.built.runtime('nix'))!;
    await rt2.relay.rewind(player, 'u1');
    expect(s.built.world.active()!.parted?.nix).toBeUndefined();
  });

  it('a stranger, or a contact with no schedule, never moves when you walk in', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const cass = (await s.built.runtime('cass'))!;
    const was = cass.room.state.sceneId;
    s.built.world.setLocation('cass');
    expect(cass.room.state.sceneId).toBe(was);
  });
});

describe('her plans (spec 2026-10-21 §3)', () => {
  // Nix: Noodle Stall 20:00–04:00, The Roof 04:00–08:00. Cass has no schedule. The clock starts at Day 1 20:00 (1200).
  const SCHEDULE = [
    { from: '20:00', to: '04:00', room: 'karasu/noodle-stall' },
    { from: '04:00', to: '08:00', room: 'karasu/ribbon-rooftop' },
  ];
  const prepare = (c: Config) => {
    const file = path.join(c.charactersDir, 'nix', 'character.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const was = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    fs.writeFileSync(file, JSON.stringify({ ...was, schedule: SCHEDULE }));
  };
  async function world() {
    const s = await start({ others: ['cass'], prepare });
    await s.api('POST', '/api/playthroughs', { player: s.built.world.active()!.player, startContact: 'cass' });
    // Every room is open in the game; a closed one keeps its saved scene.
    await s.built.runtime('nix');
    await s.built.runtime('cass');
    return s;
  }
  type S = Awaited<ReturnType<typeof start>>;
  const whereIs = (s: S, id: string) => (s.built.world.around().find((e) => e.contactId === id)?.sceneId ?? s.built.world.contacts().find((c) => c.id === id)?.sceneId) as string;
  const wait = (s: S, b: object) => s.api('POST', '/api/playthroughs/active/wait', b);
  const setPlan = async (s: S, id: string, plan: object) => {
    const rt = (await s.built.runtime(id))!;
    rt.db.setMeta(planKey(s.built.world.active()!.player), JSON.stringify({ from: 'r1', ...plan }));
    return rt;
  };
  const ROOF = 'karasu/ribbon-rooftop';
  const INTAKE = 'karasu/lowlight-intake';
  const STALL = 'karasu/noodle-stall';

  it('no plan, or a broken one: schedule as before', async () => {
    const s = await world();
    expect(whereIs(s, 'nix')).toBe(STALL);
    await setPlan(s, 'nix', { going: 'nonsense' });
    expect(whereIs(s, 'nix')).toBe(STALL);
  });

  it('going beats the schedule, the gap goes back to the left-behind rule, then the meeting window, then the schedule', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass'); // parted from Nix at 20:00, at the stall
    await setPlan(s, 'nix', { going: { place: ROOF, until: 1260 }, meet: { place: INTAKE, at: 1320 } });
    expect(whereIs(s, 'nix')).toBe(ROOF);
    await wait(s, { until: '21:30' });
    expect(whereIs(s, 'nix')).toBe(STALL);
    await wait(s, { until: '22:00' });
    expect(whereIs(s, 'nix')).toBe(INTAKE);
    await wait(s, { until: '23:00' });
    expect(whereIs(s, 'nix')).toBe(STALL);
  });

  it('no schedule blocks: the plan still places her', async () => {
    const s = await world();
    s.built.world.setLocation('nix'); // parted from Cass
    await setPlan(s, 'cass', { going: { place: ROOF, until: 1300 }, meet: null });
    expect(whereIs(s, 'cass')).toBe(ROOF);
  });

  it('with you: her room stays yours, plan or not', async () => {
    const s = await world();
    s.built.world.setLocation('nix');
    const rt = await setPlan(s, 'nix', { going: { place: ROOF, until: 1300 }, meet: null });
    expect(whereIs(s, 'nix')).toBe(rt.room.state.sceneId);
    expect(whereIs(s, 'nix')).not.toBe(ROOF);
  });

  it('walking in on her during the meeting marks it met', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    const rt = await setPlan(s, 'nix', { going: null, meet: { place: INTAKE, at: 1230 } });
    await wait(s, { until: '20:40' });
    expect(w.setLocation('nix')).toMatchObject({ sceneId: INTAKE });
    expect(JSON.parse(rt.db.getMeta(planSeenKey(w.active()!.player))!)).toMatchObject({ from: 'r1', met: 1240 });
  });

  it('the card: a going plan while she is with you; none once you part or her going time is up', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    await setPlan(s, 'nix', { going: { place: ROOF, until: 1260 }, meet: { place: INTAKE, at: 1320 } });
    expect(w.planCard('nix')).toEqual({ going: w.placeName(ROOF), meet: { place: w.placeName(INTAKE), time: '22:00' }, from: 'r1' });
    w.setLocation('cass');
    expect(w.planCard('nix')).toBeNull();
    w.setLocation('nix');
    await wait(s, { until: '21:10' });
    expect(w.planCard('nix')).toBeNull();
  });

  it('turning up: walking in during the meeting, her greet hears you said you would meet', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    await setPlan(s, 'nix', { going: null, meet: { place: INTAKE, at: 1230 } });
    await wait(s, { until: '20:40' });
    w.setLocation('nix');
    expect(w.planNote('nix', 'greet')).toEqual({ line: "[plan: you said you'd meet them here at 20:30]", spend: false });
    expect(w.planNote('nix', 'rp')).toBeNull();
  });

  it("not turning up: back with her after the window, she says she waited, once the reply spends it", async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass'); // parted at 20:00, before the meeting
    await setPlan(s, 'nix', { going: null, meet: { place: INTAKE, at: 1230 } });
    await wait(s, { until: '22:00' });
    w.setLocation('nix');
    expect(w.planNote('nix', 'greet')).toEqual({ line: `[you waited at ${w.placeName(INTAKE)} from 20:30 to 21:30; they never came]`, spend: true });
  });

  it('together at the meeting time: no line, spent quietly', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix'); // with her the whole time
    await setPlan(s, 'nix', { going: null, meet: { place: INTAKE, at: 1230 } });
    await wait(s, { until: '22:00' });
    expect(w.planNote('nix', 'rp')).toEqual({ line: null, spend: true });
    // Parted after the meeting time, back later: still together at it.
    w.setLocation('cass');
    w.setLocation('nix');
    expect(w.planNote('nix', 'greet')).toEqual({ line: null, spend: true });
  });

  it('a met mark from after the clock (a rewind took the clock back), or for another plan, does not count (final review I1)', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    const rt = await setPlan(s, 'nix', { going: null, meet: { place: INTAKE, at: 1230 } });
    const player = w.active()!.player;
    await wait(s, { until: '20:40' });
    // Marked later than now: a rewind took the clock back past walking in.
    rt.db.setMeta(planSeenKey(player), JSON.stringify({ from: 'r1', met: 1300 }));
    w.setLocation('nix');
    expect(w.planNote('nix', 'greet')?.line).toBe("[plan: you said you'd meet them here at 20:30]");
    expect(JSON.parse(rt.db.getMeta(planSeenKey(player))!)).toMatchObject({ from: 'r1', met: 1240 });
    // Another plan's mark: not this one's.
    rt.db.setMeta(planSeenKey(player), JSON.stringify({ from: 'r0', met: 1240 }));
    expect(w.planNote('nix', 'greet')).toBeNull();
    // The plan itself is never rewritten by walking in.
    expect(parsePlan(rt.db.getMeta(planKey(player)))).toEqual({ going: null, meet: { place: INTAKE, at: 1230 }, from: 'r1' });
  });

  it("walking in on her at the place she went to: no card (final review I2)", async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    await setPlan(s, 'nix', { going: { place: ROOF, until: 1300 }, meet: { place: INTAKE, at: 1320 } });
    expect(w.setLocation('nix')).toMatchObject({ sceneId: ROOF });
    expect(w.planCard('nix')).toBeNull();
  });

  it('joined at the place she went: the card stays down when you walk on with her (final review M3)', async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    const rt = await setPlan(s, 'nix', { going: { place: ROOF, until: 1300 }, meet: null });
    w.setLocation('nix');
    rt.room.setScene({ id: STALL }, 'user');
    s.built.playthroughs.touch(w.active()!.id, { contactId: 'nix', sceneId: STALL });
    expect(w.planCard('nix')).toBeNull();
  });

  it("her contact row carries the plan's tail", async () => {
    const s = await world();
    const w = s.built.world;
    w.setLocation('nix');
    w.setLocation('cass');
    await setPlan(s, 'nix', { going: { place: ROOF, until: 1320 }, meet: { place: INTAKE, at: 1320 } });
    // Nix is a stranger here (AROUND LOWLIGHT); Cass is a contact.
    const nix = w.around().find((e) => e.contactId === 'nix')!;
    expect(nix.placeName).toBe(w.placeName(ROOF));
    expect(nix.planTail).toBe(`${w.placeName(INTAKE)} 22:00`);
    // With her, she's right there: no tail (final review M7).
    w.setLocation('nix');
    expect(w.contacts().concat().find((c) => c.id === 'nix')?.planTail ?? w.around().find((e) => e.contactId === 'nix')?.planTail ?? null).toBeNull();
    expect(w.contacts().find((c) => c.id === 'cass')?.planTail ?? null).toBeNull();
  });
});
