import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPlaythroughs, type LiveDbs, type SaveRequest } from '../src/playthroughs';
import { tempDir } from './fixtures/temp-dir';

const NOW = new Date(2026, 9, 7, 21, 40).getTime();

function make(opts: { now?: () => number; warn?: (m: string) => void } = {}) {
  const root = tempDir('nix-pt-');
  let n = 0;
  const rand = () => String(n++).padStart(4, '0');
  return { root, pts: createPlaythroughs(root, opts.now ?? (() => NOW), rand, opts.warn ?? (() => {})) };
}

/** A fake open db per contact: vacuumInto writes a file, fingerprint is whatever the test says. */
function fakeDbs(prints: Record<string, number[]>, content = 'db'): LiveDbs {
  return new Map(
    Object.entries(prints).map(([id, print]) => [
      id,
      { vacuumInto: (p: string) => fs.writeFileSync(p, `${id}:${content}`), fingerprint: () => print },
    ]),
  );
}

const req = (o: Partial<SaveRequest> = {}): SaveRequest => ({
  kind: 'manual',
  trigger: 'manual',
  name: 'a save',
  location: { contactId: 'nix', sceneId: 'karasu/noodle-stall' },
  timeOfDay: 'dusk',
  participants: ['nix'],
  lastLine: { speaker: 'Nix', text: 'Say it, then.' },
  ...o,
});

describe('playthroughs', () => {
  it('create then get/list/active', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix', personaName: 'Hicks' });
    expect(pt.id).toMatch(/^pt-\d{8}-[a-z0-9]{4}$/);
    expect(pt.name).toBe('Hicks — Oct 7, 21:40');
    expect(pts.get(pt.id)).toEqual(pt);
    expect(pts.list().map((p) => p.id)).toEqual([pt.id]);
    expect(pts.active()).toBeNull();
    pts.setActive(pt.id);
    expect(pts.active()?.id).toBe(pt.id);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))).toEqual({ active: pt.id });
  });

  it("keeps the city's weather, across a reopen (city weather spec §5)", () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix', personaName: 'Hicks' });
    pts.setWeather(pt.id, { weather: 'rain', level: 1 });
    expect(pts.get(pt.id)!.weather).toEqual({ weather: 'rain', level: 1 });
    expect(createPlaythroughs(root).get(pt.id)!.weather).toEqual({ weather: 'rain', level: 1 });
  });

  it("keeps the narrator's power cuts, across a reopen; none clears the field (blackouts phase 3 §2)", () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix', personaName: 'Hicks' });
    const cut = { district: 'karasu', from: 2700, to: 2790, by: 'narrator' as const, contact: 'nix', row: 'r1' };
    pts.setOutages(pt.id, [cut]);
    expect(createPlaythroughs(root).get(pt.id)!.outages).toEqual([cut]);
    pts.setOutages(pt.id, []);
    expect(createPlaythroughs(root).get(pt.id)!.outages).toBeUndefined();
  });

  it('a new playthrough seeds its blackouts with its id; a load keeps the seed (review I3)', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    expect(pt.seed).toBe(pt.id);
    const saved = pts.save(pt.id, req({ kind: 'manual' }), fakeDbs({ nix: [1, 1] }));
    if (saved === 'unchanged') throw new Error('expected a save');
    expect(pts.fork(saved.id).seed).toBe(pt.id);
  });

  it('a load of a playthrough from before seeds kept its old id as the seed (review I3)', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const f = path.join(root, pt.id, 'playthrough.json');
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    delete raw.seed;
    fs.writeFileSync(f, JSON.stringify(raw));
    const saved = createPlaythroughs(root).save(pt.id, req({ kind: 'manual' }), fakeDbs({ nix: [1, 1] }));
    if (saved === 'unchanged') throw new Error('expected a save');
    expect(createPlaythroughs(root).fork(saved.id).seed).toBe(pt.id);
  });

  it('names a playthrough after the capitalised player id when no persona name is given', () => {
    const { pts } = make();
    expect(pts.create({ player: 'hicks', startContact: 'nix' }).name).toBe('Hicks — Oct 7, 21:40');
  });

  it('lists newest updatedAt first and touch moves the location and updatedAt', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const a = pts.create({ player: 'hicks', startContact: 'nix' });
    t += 1000;
    const b = pts.create({ player: 'hicks', startContact: 'nix' });
    expect(pts.list().map((p) => p.id)).toEqual([b.id, a.id]);
    t += 1000;
    pts.touch(a.id, { contactId: 'cass', sceneId: 'karasu/x' });
    expect(pts.list().map((p) => p.id)).toEqual([a.id, b.id]);
    expect(pts.get(a.id)).toMatchObject({ location: { contactId: 'cass', sceneId: 'karasu/x' }, updatedAt: t });
  });

  it('list skips dot folders and broken playthrough.json', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    fs.mkdirSync(path.join(root, '.lobby', 'chars'), { recursive: true });
    fs.mkdirSync(path.join(root, 'pt-broken'));
    fs.writeFileSync(path.join(root, 'pt-broken', 'playthrough.json'), '{}');
    expect(pts.list().map((p) => p.id)).toEqual([pt.id]);
  });

  it('lobbyCharsDir is under .lobby', () => {
    const { root, pts } = make();
    expect(pts.lobbyCharsDir()).toBe(path.join(root, '.lobby', 'chars'));
  });

  it('rename changes the name; remove deletes the folder but refuses the active one', () => {
    const { pts } = make();
    const a = pts.create({ player: 'hicks', startContact: 'nix' });
    const b = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.rename(a.id, 'Mine');
    expect(pts.get(a.id)?.name).toBe('Mine');
    pts.setActive(a.id);
    expect(() => pts.remove(a.id)).toThrow('active');
    pts.remove(b.id);
    expect(pts.get(b.id)).toBeNull();
  });

  it('rejects ids that are not playthrough or save ids, and deletes nothing', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    for (const bad of ['', '../x', '.', 'pt-x']) {
      expect(() => pts.remove(bad)).toThrow('bad-id');
      expect(() => pts.rename(bad, 'x')).toThrow('bad-id');
      expect(() => pts.setActive(bad)).toThrow('bad-id');
      expect(() => pts.saves(bad)).toThrow('bad-id');
      expect(() => pts.save(bad, req(), fakeDbs({}))).toThrow('bad-id');
      expect(() => pts.fork(bad)).toThrow('bad-id');
      expect(() => pts.removeSave(bad)).toThrow('bad-id');
      expect(pts.get(bad)).toBeNull();
    }
    expect(pts.get(pt.id)).not.toBeNull();
    expect(fs.existsSync(root)).toBe(true);
  });

  it('save on an unknown playthrough throws and creates nothing', () => {
    const { root, pts } = make();
    expect(() => pts.save('pt-20261007-zzzz', req(), fakeDbs({ nix: [1, 1] }))).toThrow('no-playthrough');
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('save writes a full folder and returns SaveInfo', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const info = pts.save(pt.id, req({ name: 'before the truth' }), fakeDbs({ nix: [4, 1] }));
    if (info === 'unchanged') throw new Error('expected a save');
    const dir = path.join(pts.charsDir(pt.id), '..', 'saves', info.id);
    expect(fs.readFileSync(path.join(dir, 'chars', 'nix', 'room.db'), 'utf8')).toBe('nix:db');
    expect(fs.existsSync(path.join(dir, 'save.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'playthrough.json'))).toBe(true);
    expect(info).toMatchObject({ playthrough: pt.id, at: NOW, fingerprint: { nix: [4, 1] } });
    expect(pts.saves(pt.id)[0].name).toBe('before the truth');
  });

  it('a rewind checkpoint is written even when nothing changed (the rewind says one is saved)', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    expect(pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'travel' }), fakeDbs({ nix: [5, 3, 0] }))).not.toBe('unchanged');
    expect(pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'rewind', name: 'Before rewind' }), fakeDbs({ nix: [5, 3, 0] }))).not.toBe('unchanged');
    expect(pts.saves(pt.id).map((s) => s.trigger)).toEqual(['rewind', 'travel']);
  });

  it('old two-number fingerprints never match', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    expect(pts.save(pt.id, req(), fakeDbs({ nix: [5, 3] }))).not.toBe('unchanged');
    expect(pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'end' }), fakeDbs({ nix: [5, 3, 0] }))).not.toBe('unchanged');
  });

  it("checkpoint with unchanged fingerprint returns 'unchanged'", () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const cp = req({ kind: 'checkpoint', trigger: 'end' });
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1] }))).not.toBe('unchanged');
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1] }))).toBe('unchanged');
    expect(pts.saves(pt.id)).toHaveLength(1);
    // a manual save is always written, and a checkpoint compares against the newest save of any kind
    expect(pts.save(pt.id, req(), fakeDbs({ nix: [4, 1] }))).not.toBe('unchanged');
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1] }))).toBe('unchanged');
    expect(pts.saves(pt.id)).toHaveLength(2);
    // a new contact db counts as a change
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1], cass: [1, 0] }))).not.toBe('unchanged');
  });

  it('prune keeps 20 checkpoints and every manual save', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const manual = [1, 2].map((i) => {
      t += 1000;
      return pts.save(pt.id, req({ name: `m${i}` }), fakeDbs({ nix: [0, i] }));
    });
    const cps = Array.from({ length: 25 }, (_, i) => {
      t += 1000;
      return pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'end', name: `c${i}` }), fakeDbs({ nix: [i + 1, 0] }));
    });
    const names = pts.saves(pt.id).map((s) => s.name);
    expect(names).toHaveLength(22);
    for (const m of manual) expect(names).toContain((m as { name: string }).name);
    for (const gone of cps.slice(0, 5)) expect(names).not.toContain((gone as { name: string }).name);
    expect(names).toContain('c5');
    expect(names[0]).toBe('c24');
  });

  it('failed copy removes the half-written save', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const dbs: LiveDbs = new Map([
      ['nix', { vacuumInto: () => { throw new Error('disk full'); }, fingerprint: () => [1, 1] }],
    ]);
    expect(() => pts.save(pt.id, req(), dbs)).toThrow('disk full');
    const saves = path.join(pts.charsDir(pt.id), '..', 'saves');
    expect(fs.readdirSync(saves)).toEqual([]);
    expect(pts.saves(pt.id)).toEqual([]);
  });

  it('saves skips a folder without save.json', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.save(pt.id, req(), fakeDbs({ nix: [1, 1] }));
    fs.mkdirSync(path.join(pts.charsDir(pt.id), '..', 'saves', 'sv-half'), { recursive: true });
    expect(pts.saves(pt.id)).toHaveLength(1);
  });

  it('setSolo sets and clears the flag; touch keeps it', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.setSolo(pt.id, true);
    expect(pts.get(pt.id)!.solo).toBe(true);
    pts.touch(pt.id, { contactId: 'nix', sceneId: 'ribbon/noodle-stall' });
    expect(pts.get(pt.id)!.solo).toBe(true);
    pts.setSolo(pt.id, false);
    const file = JSON.parse(fs.readFileSync(path.join(root, pt.id, 'playthrough.json'), 'utf8'));
    expect('solo' in file).toBe(false);
  });

  it('setOutfit sets and clears the outfit; a save and its branch keep it', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.setOutfit(pt.id, 'indoors');
    expect(pts.get(pt.id)!.outfit).toBe('indoors');
    const saved = pts.save(pt.id, req({ kind: 'manual' }), fakeDbs({ nix: [1, 1] }));
    if (saved === 'unchanged') throw new Error('expected a save');
    expect(pts.fork(saved.id).outfit).toBe('indoors');
    pts.setOutfit(pt.id, null);
    const file = JSON.parse(fs.readFileSync(path.join(root, pt.id, 'playthrough.json'), 'utf8'));
    expect('outfit' in file).toBe(false);
  });

  it('a checkpoint with the same fingerprint but a different solo is written (final review 3)', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const cp = (o: Partial<SaveRequest>) => pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'end', ...o }), fakeDbs({ nix: [1, 1] }));
    expect(cp({})).not.toBe('unchanged');
    expect(cp({ solo: true })).not.toBe('unchanged');
    expect(cp({ solo: true })).toBe('unchanged');
    expect(cp({})).not.toBe('unchanged');
  });

  it('touch with solo false moves and ends solo in one write', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.setSolo(pt.id, true);
    pts.touch(pt.id, { contactId: 'cass', sceneId: 'ribbon/the-tilt' }, { solo: false });
    const file = JSON.parse(fs.readFileSync(path.join(root, pt.id, 'playthrough.json'), 'utf8'));
    expect(file.location).toEqual({ contactId: 'cass', sceneId: 'ribbon/the-tilt' });
    expect('solo' in file).toBe(false);
  });

  it('a checkpoint after a WAIT (same databases, a later clock) is written (Task 2 review 3)', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const cp = (o: Partial<SaveRequest>) => pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'end', ...o }), fakeDbs({ nix: [1, 1] }));
    expect(cp({ clock: 1205 })).not.toBe('unchanged');
    expect(cp({ clock: 1205 })).toBe('unchanged');
    expect(cp({ clock: 1265 })).not.toBe('unchanged');
  });

  it('fork takes solo from the save', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const solo = pts.save(pt.id, req({ name: 'alone', solo: true }), fakeDbs({ nix: [1, 1] }));
    const not = pts.save(pt.id, req({ name: 'with her' }), fakeDbs({ nix: [1, 2] }));
    if (solo === 'unchanged' || not === 'unchanged') throw new Error('expected saves');
    expect(pts.fork(solo.id).solo).toBe(true);
    expect('solo' in pts.fork(not.id)).toBe(false);
  });

  it('fork copies a save into a new playthrough', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const sv = pts.save(pt.id, req({ name: 'before' }), fakeDbs({ nix: [1, 1] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    const copy = pts.fork(sv.id);
    expect(copy.id).not.toBe(pt.id);
    expect(copy.name).toBe('before (branch)');
    expect(copy.forkedFrom).toEqual({ playthrough: pt.id, save: sv.id, name: 'before' });
    expect(copy.location).toEqual(sv.location);
    expect(pts.get(copy.id)).toEqual(copy);
    const forked = path.join(pts.charsDir(copy.id), 'nix', 'room.db');
    const saved = path.join(pts.charsDir(pt.id), '..', 'saves', sv.id, 'chars', 'nix', 'room.db');
    expect(fs.readFileSync(forked)).toEqual(fs.readFileSync(saved));
    fs.writeFileSync(forked, 'changed');
    expect(fs.existsSync(path.join(pts.charsDir(pt.id), 'nix'))).toBe(false);
    expect(fs.readFileSync(saved, 'utf8')).toBe('nix:db');
  });

  it('create writes the persona and names the playthrough after it', () => {
    const { pts } = make();
    const persona = { name: 'Vee', background: 'Ex-courier.' };
    const pt = pts.create({ player: 'nix', startContact: 'cass', personaName: 'Nix', persona });
    expect(pt.name).toBe('Vee — Oct 7, 21:40');
    expect(pts.get(pt.id)!.persona).toEqual(persona);
  });

  it('a playthrough without a persona reads as none', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'nix', startContact: 'cass' });
    expect(pts.get(pt.id)!.persona).toBeUndefined();
    expect('persona' in pts.get(pt.id)!).toBe(false);
  });

  it('a bad stored persona is dropped with one warning, and the rest still loads', () => {
    const warned: string[] = [];
    const { root, pts } = make({ warn: (m) => warned.push(m) });
    const pt = pts.create({ player: 'nix', startContact: 'cass' });
    const file = path.join(root, pt.id, 'playthrough.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), persona: { name: '' } }));
    expect(pts.get(pt.id)!.persona).toBeUndefined();
    expect(pts.get(pt.id)!.player).toBe('nix');
    expect(warned).toEqual([`playthrough ${pt.id}: bad persona; playing as the character`]);
  });

  it('fork keeps the persona', () => {
    const { pts } = make();
    const persona = { name: 'Vee', background: '' };
    const pt = pts.create({ player: 'nix', startContact: 'cass', persona });
    const sv = pts.save(pt.id, req(), fakeDbs({ nix: [1, 1] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    expect(pts.fork(sv.id).persona).toEqual(persona);
  });

  it("fork works when the save's location contact has no db", () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const sv = pts.save(pt.id, req({ location: { contactId: 'cass', sceneId: 'karasu/x' } }), fakeDbs({ nix: [1, 1] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    const copy = pts.fork(sv.id);
    expect(fs.existsSync(pts.charsDir(copy.id))).toBe(true);
    expect(fs.existsSync(path.join(pts.charsDir(copy.id), 'cass'))).toBe(false);
  });

  it('fork works for a save with no databases at all', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const sv = pts.save(pt.id, req(), fakeDbs({}));
    if (sv === 'unchanged') throw new Error('expected a save');
    expect(fs.existsSync(pts.charsDir(pts.fork(sv.id).id))).toBe(true);
  });

  it('removeSave deletes a save from whichever playthrough holds it', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const sv = pts.save(pt.id, req(), fakeDbs({ nix: [1, 1] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    pts.removeSave(sv.id);
    expect(pts.saves(pt.id)).toEqual([]);
  });

  it('json writes are atomic: no .tmp files remain', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.setActive(pt.id);
    pts.rename(pt.id, 'x');
    pts.touch(pt.id, { contactId: 'nix', sceneId: 'ribbon/a' });
    pts.save(pt.id, req(), fakeDbs({ nix: [1, 1] }));
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]));
    expect(walk(root).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('active pointing at a missing folder is cleared on open', () => {
    const root = tempDir('nix-pt-');
    fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ active: 'pt-x' }));
    expect(createPlaythroughs(root).active()).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'))).toEqual({ active: null });
  });
});

describe('old ribbon/ room ids in playthroughs and saves', () => {
  it('get, list, saves and a fork all read karasu/', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix', personaName: 'Hicks' });
    pts.touch(pt.id, { contactId: 'nix', sceneId: 'ribbon/noodle-stall' });
    const sv = pts.save(pt.id, req({ location: { contactId: 'nix', sceneId: 'ribbon/noodle-stall' } }), fakeDbs({ nix: [1, 0, 0] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    expect(pts.get(pt.id)?.location?.sceneId).toBe('karasu/noodle-stall');
    expect(pts.list().find((p) => p.id === pt.id)?.location?.sceneId).toBe('karasu/noodle-stall');
    expect(pts.saves(pt.id)[0]?.location?.sceneId).toBe('karasu/noodle-stall');
    expect(pts.fork(sv.id).location?.sceneId).toBe('karasu/noodle-stall');
  });
});

