import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPlaythroughs, type LiveDbs, type SaveRequest } from '../src/playthroughs';
import type { SaveInfo } from '../../shared/types';
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

  it('prune keeps 10 checkpoints and every manual save', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const manual = [1, 2].map((i) => {
      t += 1000;
      return pts.save(pt.id, req({ name: `m${i}` }), fakeDbs({ nix: [0, i] }));
    });
    const cps = Array.from({ length: 15 }, (_, i) => {
      t += 1000;
      return pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'end', name: `c${i}` }), fakeDbs({ nix: [i + 1, 0] }));
    });
    const names = pts.saves(pt.id).map((s) => s.name);
    expect(names).toHaveLength(12);
    for (const m of manual) expect(names).toContain((m as { name: string }).name);
    for (const gone of cps.slice(0, 5)) expect(names).not.toContain((gone as { name: string }).name);
    expect(names).toContain('c5');
    expect(names[0]).toBe('c14');
  });

  it('a load checkpoint is written even when nothing changed', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const cp = req({ kind: 'checkpoint', trigger: 'load', name: 'Before loading x' });
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1] }))).not.toBe('unchanged');
    expect(pts.save(pt.id, cp, fakeDbs({ nix: [4, 1] }))).not.toBe('unchanged');
    expect(pts.saves(pt.id)).toHaveLength(2);
  });

  it('keeps 3 load checkpoints, outside the cap of 10', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    for (let i = 0; i < 12; i++) {
      t += 1000;
      pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'travel', name: `t${i}` }), fakeDbs({ nix: [i + 1, 0] }));
      if (i % 3 === 0 || i === 11) {
        t += 1000;
        pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'load', name: `l${i}` }), fakeDbs({ nix: [i + 1, 0] }));
      }
    }
    const all = pts.saves(pt.id);
    expect(all.filter((s) => s.trigger === 'travel')).toHaveLength(10);
    expect(all.filter((s) => s.trigger === 'load').map((s) => s.name)).toEqual(['l11', 'l9', 'l6']);
  });

  it('11 travel checkpoints never prune a load one', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'load', name: 'kept' }), fakeDbs({ nix: [0, 0] }));
    for (let i = 0; i < 11; i++) {
      t += 1000;
      pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'travel', name: `t${i}` }), fakeDbs({ nix: [i + 1, 0] }));
    }
    expect(pts.saves(pt.id).map((s) => s.name)).toContain('kept');
  });

  it('keep protects the save being loaded from the load cap', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const load = (name: string, keep?: string) => {
      t += 1000;
      return pts.save(pt.id, req({ kind: 'checkpoint', trigger: 'load', name }), fakeDbs({ nix: [1, 0] }), keep) as { id: string };
    };
    const oldest = load('l0');
    load('l1');
    load('l2');
    load('l3', oldest.id);
    expect(pts.saves(pt.id).map((s) => s.name)).toEqual(['l3', 'l2', 'l1', 'l0']);
    load('l4');
    expect(pts.saves(pt.id).map((s) => s.name)).toEqual(['l4', 'l3', 'l2']);
  });

  it('setStarred sets and clears; updatedAt stays', () => {
    let t = NOW;
    const { pts } = make({ now: () => t });
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    t += 5000;
    pts.setStarred(pt.id, true);
    expect(pts.get(pt.id)!.starred).toBe(true);
    expect(pts.get(pt.id)!.updatedAt).toBe(NOW);
    pts.setStarred(pt.id, false);
    expect('starred' in pts.get(pt.id)!).toBe(false);
  });

  it('fork takes the given name', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const s = pts.save(pt.id, req({ name: 'Keep' }), fakeDbs({ nix: [1, 1] })) as { id: string };
    const f = pts.fork(s.id, 'Main — branch 2');
    expect(f.name).toBe('Main — branch 2');
    expect(f.forkedFrom).toMatchObject({ playthrough: pt.id, save: s.id, name: 'Keep' });
  });

  describe('restore (load in place)', () => {
    /** A game with save A (nix:a), then story moved on: save B (nix:b), an outfit, a star, a new name, cass met. */
    function moved() {
      let t = NOW;
      const m = make({ now: () => t });
      const { pts } = m;
      const pt = pts.create({ player: 'hicks', startContact: 'nix' });
      fs.mkdirSync(path.join(pts.charsDir(pt.id), 'nix'), { recursive: true });
      fs.writeFileSync(path.join(pts.charsDir(pt.id), 'nix', 'identity.md'), 'override at A');
      t += 1000;
      const a = pts.save(pt.id, req({ name: 'A', location: { contactId: 'nix', sceneId: 'karasu/noodle-stall' } }), fakeDbs({ nix: [1, 0] }, 'a')) as SaveInfo;
      fs.writeFileSync(path.join(pts.charsDir(pt.id), 'nix', 'identity.md'), 'override later');
      fs.writeFileSync(path.join(pts.charsDir(pt.id), 'nix', 'room.db'), 'live');
      fs.mkdirSync(path.join(pts.charsDir(pt.id), 'cass'), { recursive: true });
      fs.writeFileSync(path.join(pts.charsDir(pt.id), 'cass', 'room.db'), 'cass live');
      pts.touch(pt.id, { contactId: 'cass', sceneId: 'karasu/rooftop' });
      pts.setOutfit(pt.id, 'home');
      pts.setStarred(pt.id, true);
      pts.rename(pt.id, 'Main');
      t += 1000;
      const b = pts.save(pt.id, req({ name: 'B' }), fakeDbs({ nix: [2, 0] }, 'b')) as SaveInfo;
      t += 1000;
      return { ...m, pt, a, b, later: () => (t += 1000) };
    }
    const read = (f: string) => fs.readFileSync(f, 'utf8');

    it('restore puts the game back to the save', () => {
      const { pts, pt, a, b } = moved();
      const before = pts.get(pt.id)!;
      const r = pts.restore(a.id);
      expect(read(path.join(pts.charsDir(pt.id), 'nix', 'room.db'))).toBe('nix:a');
      expect(r).toEqual(pts.get(pt.id));
      expect(r).toMatchObject({ id: pt.id, name: 'Main', createdAt: before.createdAt, forkedFrom: null, seed: before.seed, starred: true });
      expect(r.location).toEqual({ contactId: 'nix', sceneId: 'karasu/noodle-stall' });
      expect('outfit' in r).toBe(false);
      expect(r.updatedAt).toBeGreaterThan(before.updatedAt);
      expect(pts.saves(pt.id).map((s) => s.id)).toEqual([b.id, a.id]);
    });

    it('restore drops contacts met after the save', () => {
      const { pts, pt, a } = moved();
      pts.restore(a.id);
      expect(fs.existsSync(path.join(pts.charsDir(pt.id), 'cass'))).toBe(false);
    });

    it('restore copies identity overrides from the save', () => {
      const { pts, pt, a } = moved();
      pts.restore(a.id);
      expect(read(path.join(pts.charsDir(pt.id), 'nix', 'identity.md'))).toBe('override at A');
    });

    it('restore clears story fields the snapshot lacks', () => {
      const { pts, pt, a } = moved();
      pts.setOutages(pt.id, [{ contact: 'nix', from: 1, to: 2, by: 'narrator' } as never]);
      pts.setContactOutfit(pt.id, 'nix', 'work');
      pts.setSolo(pt.id, true);
      pts.setClockFloor(pt.id, 900);
      const live = JSON.parse(read(path.join(pts.charsDir(pt.id), '..', 'playthrough.json')));
      live.persona = { name: 'Later', bio: 'x', facts: [] };
      fs.writeFileSync(path.join(pts.charsDir(pt.id), '..', 'playthrough.json'), JSON.stringify(live));
      const r = pts.restore(a.id);
      for (const k of ['outages', 'contactOutfits', 'solo', 'persona', 'clockFloor', 'outfit']) expect(k in r, k).toBe(false);
    });

    it('restore takes solo from the save', () => {
      const { pts, pt } = moved();
      const s = pts.save(pt.id, req({ name: 'solo one', solo: true }), fakeDbs({ nix: [3, 0] })) as SaveInfo;
      pts.setSolo(pt.id, false);
      expect(pts.restore(s.id).solo).toBe(true);
    });

    it('restore of an unknown save throws and changes nothing', () => {
      const { pts, pt } = moved();
      const before = pts.get(pt.id);
      expect(() => pts.restore('sv-20261007-zzzz')).toThrow(/no save/);
      expect(pts.get(pt.id)).toEqual(before);
      expect(read(path.join(pts.charsDir(pt.id), 'nix', 'room.db'))).toBe('live');
    });

    it('a rename that fails mid-swap rolls back in place, whichever rename it is', () => {
      for (const failing of [1, 2, 3]) {
        const { pts, pt, a } = moved();
        const d = path.join(pts.charsDir(pt.id), '..');
        const real = fs.renameSync;
        let n = 0;
        const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
          if (++n === failing) throw Object.assign(new Error('EINVAL busy'), { code: 'EINVAL' });
          return real(from, to);
        });
        try {
          expect(() => pts.restore(a.id), `rename ${failing}`).toThrow('EINVAL busy');
        } finally {
          spy.mockRestore();
        }
        expect(read(path.join(d, 'chars', 'nix', 'room.db')), `rename ${failing}`).toBe('live');
        expect(pts.get(pt.id)!.name, `rename ${failing}`).toBe('Main');
        expect(fs.existsSync(path.join(d, 'chars.old')), `rename ${failing}`).toBe(false);
        expect(fs.existsSync(path.join(d, 'restore.tmp')), `rename ${failing}`).toBe(false);
      }
    });

    it('a busy rename (EPERM, EBUSY) is tried again before the restore gives up', () => {
      const { pts, pt, a } = moved();
      const real = fs.renameSync;
      let n = 0;
      const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (++n <= 2) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
        return real(from, to);
      });
      try {
        pts.restore(a.id);
      } finally {
        spy.mockRestore();
      }
      expect(read(path.join(pts.charsDir(pt.id), 'nix', 'room.db'))).toBe('nix:a');
    });

    it('a cleanup that fails after the swap still counts as loaded', () => {
      const { pts, pt, a } = moved();
      const real = fs.rmSync;
      const spy = vi.spyOn(fs, 'rmSync').mockImplementation((p, o) => {
        if (String(p).endsWith('chars.old')) throw new Error('EPERM');
        return real(p, o);
      });
      try {
        expect(pts.restore(a.id).id).toBe(pt.id);
      } finally {
        spy.mockRestore();
      }
      expect(read(path.join(pts.charsDir(pt.id), 'nix', 'room.db'))).toBe('nix:a');
    });

    it('a game whose unfinished load cannot be put right is warned about; the rest still open', () => {
      const { root, pts } = make();
      const bad = pts.create({ player: 'hicks', startContact: 'nix' });
      const good = pts.create({ player: 'hicks', startContact: 'nix' });
      fs.renameSync(path.join(root, bad.id, 'chars'), path.join(root, bad.id, 'chars.old'));
      const real = fs.renameSync;
      const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (String(from).includes(bad.id) && String(from).endsWith('chars.old')) throw Object.assign(new Error('EINVAL locked'), { code: 'EINVAL' });
        return real(from, to);
      });
      const warn = vi.fn();
      try {
        const again = createPlaythroughs(root, () => NOW, () => 'zzzz', warn);
        expect(again.get(good.id)).not.toBeNull();
      } finally {
        spy.mockRestore();
      }
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`playthrough ${bad.id}: an unfinished load couldn't be put right`));
    });

    it('a swap interrupted at each step is finished or rolled back on open', () => {
      const states: { name: string; build: (d: string) => void; expect: 'old' | 'new' }[] = [
        { name: 'staging only', expect: 'old', build: (d) => stage(d) },
        { name: 'chars moved aside, staged not in', expect: 'old', build: (d) => { stage(d); fs.renameSync(path.join(d, 'chars'), path.join(d, 'chars.old')); } },
        { name: 'chars in, json staged', expect: 'new', build: (d) => { stage(d); fs.renameSync(path.join(d, 'chars'), path.join(d, 'chars.old')); fs.renameSync(path.join(d, 'restore.tmp', 'chars'), path.join(d, 'chars')); } },
        { name: 'chars moved aside, an empty chars/ made since, staged not in', expect: 'old', build: (d) => { stage(d); fs.renameSync(path.join(d, 'chars'), path.join(d, 'chars.old')); fs.mkdirSync(path.join(d, 'chars', 'nix'), { recursive: true }); fs.writeFileSync(path.join(d, 'chars', 'nix', 'room.db'), 'empty'); } },
        { name: 'both in, old left', expect: 'new', build: (d) => { stage(d); fs.renameSync(path.join(d, 'chars'), path.join(d, 'chars.old')); fs.renameSync(path.join(d, 'restore.tmp', 'chars'), path.join(d, 'chars')); fs.renameSync(path.join(d, 'restore.tmp', 'playthrough.json'), path.join(d, 'playthrough.json')); fs.rmSync(path.join(d, 'restore.tmp'), { recursive: true }); } },
      ];
      function stage(d: string) {
        fs.mkdirSync(path.join(d, 'restore.tmp', 'chars', 'nix'), { recursive: true });
        fs.writeFileSync(path.join(d, 'restore.tmp', 'chars', 'nix', 'room.db'), 'new');
        const info = JSON.parse(read(path.join(d, 'playthrough.json')));
        fs.writeFileSync(path.join(d, 'restore.tmp', 'playthrough.json'), JSON.stringify({ ...info, name: 'NEW' }));
      }
      for (const st of states) {
        const { root, pts } = make();
        const pt = pts.create({ player: 'hicks', startContact: 'nix' });
        const d = path.join(root, pt.id);
        fs.mkdirSync(path.join(d, 'chars', 'nix'), { recursive: true });
        fs.writeFileSync(path.join(d, 'chars', 'nix', 'room.db'), 'old');
        st.build(d);
        const again = createPlaythroughs(root, () => NOW, () => 'zzzz', () => {});
        const db = read(path.join(d, 'chars', 'nix', 'room.db'));
        const name = again.get(pt.id)!.name;
        expect([db, name], st.name).toEqual(st.expect === 'old' ? ['old', pt.name] : ['new', 'NEW']);
        expect(fs.existsSync(path.join(d, 'chars.old')), st.name).toBe(false);
        expect(fs.existsSync(path.join(d, 'restore.tmp')), st.name).toBe(false);
      }
    });
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

  it('setContactOutfit picks per contact and clears to none; a save and its branch keep the picks', () => {
    const { root, pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    pts.setContactOutfit(pt.id, 'ember', 'home');
    pts.setContactOutfit(pt.id, 'nix', 'coat');
    expect(pts.get(pt.id)!.contactOutfits).toEqual({ ember: 'home', nix: 'coat' });
    const saved = pts.save(pt.id, req({ kind: 'manual' }), fakeDbs({ nix: [1, 1] }));
    if (saved === 'unchanged') throw new Error('expected a save');
    expect(pts.fork(saved.id).contactOutfits).toEqual({ ember: 'home', nix: 'coat' });
    pts.setContactOutfit(pt.id, 'ember', null);
    expect(pts.get(pt.id)!.contactOutfits).toEqual({ nix: 'coat' });
    pts.setContactOutfit(pt.id, 'nix', null);
    const file = JSON.parse(fs.readFileSync(path.join(root, pt.id, 'playthrough.json'), 'utf8'));
    expect('contactOutfits' in file).toBe(false);
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

  it('renameSave names a save in whichever playthrough holds it; a bad id throws', () => {
    const { pts } = make();
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    const sv = pts.save(pt.id, req({ name: 'Old' }), fakeDbs({ nix: [1, 1] }));
    if (sv === 'unchanged') throw new Error('expected a save');
    expect(pts.renameSave(sv.id, 'Before the weigh station')).toMatchObject({ id: sv.id, name: 'Before the weigh station' });
    expect(pts.saves(pt.id)[0].name).toBe('Before the weigh station');
    expect(pts.renameSave('sv-20260101-zzzz', 'x')).toBeNull();
    expect(() => pts.renameSave('../x', 'x')).toThrow('bad-id');
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

