import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db';
import { loadQuestBook } from '../src/quests';
import { loadCrewBook } from '../src/crew-book-load';
import { GUEST_ABILITIES } from '../../shared/contract';
import { chooseVariant, parseQuestFile } from '../../shared/quests';
import type { LeadEntry } from '../../shared/leads';
import { CONTRACT } from '../../shared/quests.contract.fixture';
import { TRAIL } from '../../shared/quests.fixture';
import type { ChatMessage } from '../../shared/types';

const row = (id: string, ts: number, o: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', text: 'x', toolLines: [], ts, status: 'ok', ...o });
const KEY = 'quest.cass.paper-trail';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'quests-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('a quest run as story meta', () => {
  it('is stamped to the row before it, and a rewind past that row undoes it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'cass' });
    db.insertMessage('cass', row('a', 1));
    db.insertMessage('cass', row('q', 2, { mode: 'quest', quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel' } }));
    db.setMeta(KEY, '{"beat":"sentinel"}');
    expect(db.writes().find((w) => w.key === KEY)?.messageId).toBe('q');
    const { rebuilt } = db.cutAfter('cass', 'a');
    expect(db.getMeta(KEY)).toBeNull();
    expect(rebuilt.quests).toBe(true);
  });

  it('survives a rebuild that keeps its row', () => {
    const db = openDb(':memory:', { defaultPlayer: 'cass' });
    db.insertMessage('cass', row('q', 2, { mode: 'quest' }));
    db.setMeta(KEY, 'v1');
    const r = db.rebuild();
    expect(db.getMeta(KEY)).toBe('v1');
    expect(r.quests).toBe(false);
  });
});

describe('The Recut', () => {
  const q = () => {
    const r = parseQuestFile('the-recut', fs.readFileSync('./world/quests/the-recut.md', 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r.entry;
  };
  const ending = (flags: Record<string, string>) => chooseVariant(q(), 'fallout', { flags, trust: null, warmth: null, with: 'silas' })!.beat.choices[0].to;
  it('getting out before the turn has an ending of its own (final review I2)', () => {
    expect(ending({ grade: 'messy' })).toBe('done-none');
    expect(ending({ grade: 'clean', turn: 'whole' })).toBe('done-whole');
    expect(ending({ grade: 'blown' })).toBe('done-blown');
  });
  it('the archive beats are in the archive, and the way there and out are not', () => {
    const room = (id: string) => q().beats.get(id)![0].room;
    for (const id of ['stacks', 'vault', 'reel', 'turn']) expect(room(id)).toBe('nexus/spectra-archive');
    for (const id of ['night', 'lift', 'down', 'street']) expect(room(id)).toBeUndefined();
  });
  it('the offer knows Ember: anyone here holds her lead', () => {
    const offer = q().beats.get('offer')!;
    expect(offer.map((b) => b.text).join(' ')).toContain('Ember');
    expect(offer.at(-1)!.text).not.toContain('pink in her hair');
  });
});

describe('The Subtraction', () => {
  it('the pump house and the intake are real rooms, and the way there and back are not', () => {
    const r = parseQuestFile('the-subtraction', fs.readFileSync('world/quests/the-subtraction.md', 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const room = (id: string) => r.entry.beats.get(id)![0].room;
    expect(room('floor')).toBe('drownworks/pump-house-nine');
    for (const id of ['find', 'turn', 'out']) expect(room(id)).toBe('drownworks/old-intake');
    for (const id of ['night', 'fence', 'bays', 'last']) expect(room(id)).toBeUndefined();
    expect(r.entry.beats.get('last')!.flatMap((b) => b.onLine ?? [])).toHaveLength(3);
    for (const scene of ['drownworks/pump-house-nine', 'drownworks/old-intake']) expect(fs.existsSync(`scenes/${scene}/scene.json`)).toBe(true);
  });
});

describe("Soren's arc", () => {
  const read = (id: string) => {
    const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r;
  };
  it('all three are his, built to their tiers, and only rue_two opens the last', () => {
    for (const id of ['run-sheet', 'arrears', 'the-last-one']) {
      const r = read(id);
      expect(r.warnings).toEqual([]);
      expect(r.entry.for).toBe('soren');
      expect(r.entry.with).toEqual(['rue']);
    }
    expect(read('the-last-one').entry.contract?.lead).toBe('adebayo-close-rue');
  });
  it('every ending of the night settles it for Rue and for Adebayo, and none is silent', () => {
    const e = read('the-last-one').entry;
    for (const id of ['done-blown', 'done-truth', 'done-hers', 'done-close']) expect(e.outcomes.get(id)?.effects.settles?.map((s) => s.who)).toEqual(['rue', 'adebayo']);
  });
  it('every room on a beat is a real room', () => {
    for (const id of ['run-sheet', 'arrears', 'the-last-one']) for (const variants of read(id).entry.beats.values()) for (const b of variants) if (b.room) expect(fs.existsSync(`scenes/${b.room}/scene.json`)).toBe(true);
  });
  it('a blown Run Sheet leaves its mark', () => {
    const e = read('run-sheet').entry;
    expect(e.outcomes.get('called')?.effects.take).toBe('none');
    expect(e.beats.get('burned')![0].choices.map((c) => c.to)).toEqual(['owned', 'silent']);
  });
});

describe('lead openings', () => {
  const read = (id: string) => {
    const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r;
  };
  /** The shape every opening shares (spec 2026-11-07-lead-openings): structure only, never prose, so Studio edits keep it green. */
  const opening = (id: string, o: { lead: string; contact: string; starts: string; rooms: string[]; recruit: { spec: string; grade: number; sex?: string } }) => {
    const r = read(id);
    const e = r.entry;
    expect(r.warnings).toEqual([]);
    expect([e.kind, e.tier, e.for, e.with, e.starts, e.once, e.template]).toEqual(['mission', 1, o.lead, [o.contact], o.starts, true, true]);
    const beats = [...e.beats.values()].flat();
    for (const b of beats) expect(b.views.map((v) => v.contact), `${b.id} has a view for ${o.contact}`).toContain(o.contact);
    const rooms = new Set(beats.flatMap((b) => (b.room ? [b.room] : [])));
    expect([...rooms].sort()).toEqual([...o.rooms].sort());
    for (const room of rooms) expect(fs.existsSync(`scenes/${room}/scene.json`)).toBe(true);
    expect([...e.outcomes.values()].some((x) => x.effects.recruit && x.effects.recruit.spec === o.recruit.spec && x.effects.recruit.grade === o.recruit.grade && x.effects.recruit.sex === o.recruit.sex)).toBe(true);
    // A blown night leaves its mark: the last rolled beat's fail leads to a no-roll beat whose every pick sets a flag.
    const rolled = beats.filter((b) => b.id !== 'getaway' && b.choices.some((c) => c.check));
    const last = rolled[rolled.length - 1]!;
    const fail = e.outcomes.get(last.choices.find((c) => c.fail)!.fail!)!;
    const after = e.beats.get(fail.to)![0]!;
    expect(after.choices.every((c) => !c.check && c.tags.some((t) => t.kind === 'set'))).toBe(true);
    return { entry: e, text: fs.readFileSync(`world/quests/${id}.md`, 'utf8') };
  };
  it('Nix knows Ember by sight, with no standing of her own yet', () => {
    // A tie's numbers seed the contact's standing toward the player (world.ts tieStarts), and Nix has never spoken to her.
    const ember = JSON.parse(fs.readFileSync('characters/ember/character.json', 'utf8'));
    expect(typeof ember.knows['nix-direct']).toBe('string');
  });
  it("Rue's Run Sheet is hers, with Soren, and agrees with his", () => {
    const { text } = opening('run-sheet-rue', { lead: 'rue', contact: 'soren', starts: 'soren-hab', rooms: ['spine/long-haul'], recruit: { spec: 'muscle', grade: 0, sex: 'man' } });
    // The same night as Soren's Run Sheet: the rig ahead of her father's is the same rig in both files, whatever either calls it next.
    const rig = (s: string) => /Kestrel (\d{4}), the rig ahead/.exec(s)?.[1];
    expect(rig(text)).toBeDefined();
    expect(rig(text)).toBe(rig(fs.readFileSync('world/quests/run-sheet.md', 'utf8')));
  });
  it("Found is Hicks's, with Ember on his ear", () => {
    const { text } = opening('found', { lead: 'hicks', contact: 'ember', starts: 'zhou-flat', rooms: ['karasu/dead-blocks', 'karasu/sixth-floor'], recruit: { spec: 'ears', grade: 0 } });
    // Wren stays closed (his identity): the job names that he runs alone, never the breakup.
    expect(text).not.toMatch(/breakup|broke up/i);
  });
  // A getaway's outcomes must end the job, so a mark that holds however it goes is set on its cards.
  const getawaySets = (id: string) => read(id).entry.beats.get('getaway')![0]!.choices.map((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : [])));
  it('a getaway out of Found leaves Pell on the list, and one out of Signed leaves the sparkle in the log', () => {
    for (const sets of getawaySets('found')) expect(sets).toContain('pell=listed');
    for (const sets of getawaySets('signed')) expect(sets).toContain('spark=left');
  });
  it("Signed is Ember's, with Hicks on her ear", () => {
    opening('signed', { lead: 'ember', contact: 'hicks', starts: 'the-tilt', rooms: ['velvet/under-the-cat'], recruit: { spec: 'face', grade: 0, sex: 'man' } });
  });
});

describe("a guest's abilities", () => {
  it('are all in the real book, or their cards would quietly be missing', () => {
    const ids = loadCrewBook('./world/crew', () => {}).abilities.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(Object.values(GUEST_ABILITIES).flat()));
  });
});

describe('loadQuestBook', () => {
  const known = { roster: new Set(['nix-direct', 'hicks']), places: new Set(['lowlight-intake']) };
  it('loads the good files and warns about the bad', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'paper-trail.md'), TRAIL);
    fs.writeFileSync(path.join(dir, 'broken.md'), TRAIL.replace('starts: lowlight-intake', 'starts: the-moon'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const warnings: string[] = [];
    const book = loadQuestBook(dir, known, (m) => warnings.push(m));
    expect(book.map((q) => q.id)).toEqual(['paper-trail']);
    expect(warnings).toEqual(["quest broken.md: starts: no place 'the-moon' on the map; skipping it"]);
  });
  describe("a contract's lead", () => {
    const load = (leads: LeadEntry[], extra = '') => {
      const dir = tmp();
      fs.writeFileSync(path.join(dir, 'the-contract.md'), CONTRACT.replace('posts-at: 45', `lead: teo-debt\n${extra}posts-at: 45`));
      const warnings: string[] = [];
      const book = loadQuestBook(dir, { roster: new Set(['mother-rot']), places: new Set(['haes-noodles']) }, (m) => warnings.push(m), leads);
      return { ids: book.map((q) => q.id), warnings };
    };
    const lead = (to: string, from = 'cass') => ({ id: 'teo-debt', from, to }) as LeadEntry;
    it('loads when the lead goes to its contact', () => {
      expect(load([lead('mother-rot')])).toEqual({ ids: ['the-contract'], warnings: [] });
    });
    it('is skipped when the guest did not give the lead', () => {
      expect(load([lead('mother-rot')], 'guest: ember VET\n')).toEqual({ ids: [], warnings: ["quest the-contract.md: lead: 'teo-debt' comes from cass, not guest ember; skipping it"] });
    });
    it('loads when the guest gave the lead', () => {
      expect(load([lead('mother-rot', 'ember')], 'guest: ember VET\n')).toEqual({ ids: ['the-contract'], warnings: [] });
    });
    it('is skipped with a lead that does not exist', () => {
      expect(load([])).toEqual({ ids: [], warnings: ["quest the-contract.md: lead: no lead 'teo-debt'; skipping it"] });
    });
    it('is skipped when the lead goes to someone else', () => {
      expect(load([lead('ines')])).toEqual({ ids: [], warnings: ["quest the-contract.md: lead: 'teo-debt' goes to ines, not mother-rot; skipping it"] });
    });
  });
  it('is empty without a folder', () => {
    expect(loadQuestBook(path.join(tmp(), 'none'), known, () => {})).toEqual([]);
  });
});
