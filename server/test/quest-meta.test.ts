import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db';
import { loadQuestBook } from '../src/quests';
import { loadCrewBook } from '../src/crew-book-load';
import { GUEST_ABILITIES } from '../../shared/contract';
import { chooseVariant, parseQuestFile, type Choice, settledFor } from '../../shared/quests';
import { offTemplate, rolledBeats } from '../../shared/job-template';
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
    // Two Stories (2026-11-10): conditional lines ride on top; the plain ones still settle both, and any verdict leaves one each.
    for (const id of ['done-blown', 'done-truth', 'done-hers', 'done-told', 'done-close']) {
      const lines = e.outcomes.get(id)?.effects.settles ?? [];
      expect(lines.filter((s) => !s.when).map((s) => s.who), id).toEqual(['rue', 'adebayo']);
      for (const rue of ['held', 'thin', 'caught'])
        for (const adebayo of ['held', 'thin', 'caught'])
          for (const t of ['yes', 'no'])
            expect(settledFor(lines, { flags: { 'story.rue': rue, 'story.adebayo': adebayo, 'story.rue-true': t, 'story.adebayo-true': t }, trust: null, warmth: null, with: 'rue' }).map((s) => s.who).sort(), id).toEqual(['adebayo', 'rue']);
    }
  });
  it('telling Rue about Kade on the board reaches the crate and the ending, whatever else was covered (live check)', () => {
    const e = read('the-last-one').entry;
    const ctx = (flags: Record<string, string>) => ({ flags, trust: null, warmth: null, with: 'rue' });
    // hers: Kade told with a cover elsewhere still plays the told crate, and the told ending's Rue line.
    const told = chooseVariant(e, 'crate', ctx({ turn: 'hers', kade: 'told', 'story.rue': 'thin', 'story.rue-true': 'no' }))!;
    expect(told.beat.choices.map((c) => c.to)).toEqual(['done-told', 'done-told']);
    expect(chooseVariant(e, 'crate', ctx({ turn: 'hers', 'story.rue': 'thin', 'story.rue-true': 'no' }))!.beat.choices.map((c) => c.to)).toEqual(['done-hers', 'done-hers']);
    const doneTold = e.outcomes.get('done-told')!.effects.settles ?? [];
    expect(settledFor(doneTold, ctx({ 'story.rue': 'caught' })).find((s) => s.who === 'rue')!.text).toMatch(/Kade/);
    expect(settledFor(doneTold, ctx({ 'story.rue': 'caught' })).find((s) => s.who === 'rue')!.text).not.toEqual(settledFor(doneTold, ctx({ 'story.rue': 'thin' })).find((s) => s.who === 'rue')!.text);
    // close: she signs knowing what he did to Kade.
    const close = chooseVariant(e, 'crate', ctx({ turn: 'close', kade: 'told' }))!;
    expect(close.beat.segments.some((g) => g.when?.some((c) => c.kind === 'flag' && c.name === 'kade') && /Kade/.test(g.text))).toBe(true);
    const doneClose = e.outcomes.get('done-close')!.effects.settles ?? [];
    expect(settledFor(doneClose, ctx({ 'story.rue': 'thin', kade: 'told' })).find((s) => s.who === 'rue')!.text).toMatch(/Kade/);
    expect(settledFor(doneClose, ctx({ 'story.rue': 'thin' })).find((s) => s.who === 'rue')!.text).not.toMatch(/Kade/);
  });
  it('a getaway before the turn pick gets its own crate and ending, not the close scene (final review)', () => {
    const e = read('the-last-one').entry;
    const ctx = (flags: Record<string, string>) => ({ flags, trust: null, warmth: null, with: 'rue' });
    expect(chooseVariant(e, 'crate', ctx({ 'story.rue': 'held' }))!.beat.choices.map((c) => c.to)).toEqual(['done-out', 'done-out']);
    expect(chooseVariant(e, 'crate', ctx({ turn: 'close' }))!.beat.choices.map((c) => c.to)).toEqual(['done-close', 'done-close']);
    const out = e.outcomes.get('done-out')!.effects.settles ?? [];
    for (const v of ['held', 'thin', 'caught']) expect(settledFor(out, ctx({ 'story.rue': v, 'story.adebayo': v })).map((s) => s.who).sort()).toEqual(['adebayo', 'rue']);
    expect(settledFor(out, ctx({ 'story.rue': 'held' })).find((s) => s.who === 'rue')!.text).not.toMatch(/signed\./);
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
  it("The Passenger is Hicks's, with Ember on his ear", () => {
    const { text } = opening('the-passenger', { lead: 'hicks', contact: 'ember', starts: 'zhou-flat', rooms: ['karasu/ripper-clinic', 'karasu/dead-blocks', 'karasu/sixth-floor'], recruit: { spec: 'ears', grade: 0 } });
    // Wren stays closed (his identity): the job names that he runs alone, never the breakup.
    expect(text).not.toMatch(/breakup|broke up/i);
  });
  // A getaway's outcomes must end the job, so a mark that holds however it goes is set on its cards.
  const getawaySets = (id: string) => read(id).entry.beats.get('getaway')![0]!.choices.map((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : [])));
  it('Paper Trail and Declared Dead are gone: House Glass replaced them (2026-11-08)', () => {
    expect(fs.existsSync('world/quests/paper-trail.md')).toBe(false);
    expect(fs.existsSync('world/quests/declared-dead.md')).toBe(false);
    for (const f of fs.readdirSync('world/quests').filter((n) => n.endsWith('.md'))) expect(fs.readFileSync(`world/quests/${f}`, 'utf8'), f).not.toMatch(/intake_ledger|\blund\b/);
  });
  it('Found is gone: The Passenger replaced it (2026-11-08)', () => {
    expect(fs.existsSync('world/quests/found.md')).toBe(false);
  });
  it('a getaway out of The Passenger leaves Noa seen, and one out of Signed leaves the sparkle in the log', () => {
    for (const sets of getawaySets('the-passenger')) expect(sets).toEqual(expect.arrayContaining(['passenger_one=yes', 'noa=seen']));
    for (const sets of getawaySets('signed')) expect(sets).toContain('spark=left');
  });
  it("House Glass is Hicks's, with Nix on his ear (House Glass spec)", () => {
    opening('house-glass', { lead: 'hicks', contact: 'nix-direct', starts: 'lowlight-intake', rooms: ['velvet/glass-orchid', 'karasu/second-socket', 'karasu/intake-back-alley'], recruit: { spec: 'face', grade: 0, sex: 'woman' } });
    for (const sets of getawaySets('house-glass')) expect(sets).toEqual(expect.arrayContaining(['lark_one=yes', 'lark=seen']));
    const ask = read('house-glass').entry.beats.get('ask')![0].choices.map((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : [])));
    expect(ask).toEqual([expect.arrayContaining(['nix1=asked', 'nix_asked=yes']), ['nix1=dug']]);
  });
  it("Signed is Ember's, with Hicks on her ear", () => {
    opening('signed', { lead: 'ember', contact: 'hicks', starts: 'the-tilt', rooms: ['velvet/under-the-cat'], recruit: { spec: 'face', grade: 0, sex: 'man' } });
  });
});

describe("The Passenger, Hicks's arc (spec 2026-11-08)", () => {
  const read = (id: string) => {
    const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r.entry;
  };
  const sets = (e: ReturnType<typeof read>) => [
    ...[...e.beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : [])))),
  ];
  const needsNoa = (c: Choice) => c.tags.some((t) => t.kind === 'needs' && t.all.some((x) => x.kind === 'flag' && x.name === 'guest.noa'));
  /** An act after the opening: Hicks's, with Ember, after the last act's flag, Noa on a foil card, every beat whole without her. */
  const act = (id: string, o: { after: string; sets: string }) => {
    const e = read(id);
    expect([e.kind, e.tier, e.for, e.with, e.once, e.template]).toEqual(['mission', 1, 'hicks', ['ember'], true, true]);
    expect(JSON.stringify(e.after)).toContain(o.after);
    expect(e.guest).toEqual({ id: 'noa', grade: 0 });
    const beats = [...e.beats.values()].flat();
    for (const b of beats) expect(b.views.map((v) => v.contact), `${b.id} has a view for ember`).toContain('ember');
    const rolled = rolledBeats(e).map((r) => r.beat);
    expect(rolled.filter((b) => b.choices.some(needsNoa)).length).toBeGreaterThanOrEqual(2);
    for (const b of rolled) expect(b.choices.filter((c) => c.check && !needsNoa(c)).length, `${b.id} stands without her`).toBe(2);
    for (const b of rolled) for (const c of b.choices.filter(needsNoa)) expect(c.check?.angle, `${b.id}/${c.id} is an angle`).toBe(true);
    expect(sets(e)).toContain(o.sets);
    expect(offTemplate(e)).toEqual([]);
    for (const b of beats) if (b.room) expect(fs.existsSync(`scenes/${b.room}/scene.json`)).toBe(true);
    return e;
  };
  /** A House Glass act after the opening: Hicks's, with Nix on his ear, after the last act's flag, no guest, Nix physically there on `here`. */
  const nixAct = (id: string, o: { after: string; sets: string; here: string[] }) => {
    const e = read(id);
    expect([e.kind, e.tier, e.for, e.with, e.once, e.template]).toEqual(['mission', 1, 'hicks', ['nix-direct'], true, true]);
    expect(JSON.stringify(e.after)).toContain(o.after);
    expect(e.guest).toBeUndefined();
    const beats = [...e.beats.values()].flat();
    for (const b of beats) expect(b.views.map((v) => v.contact), `${b.id} has a view for nix-direct`).toContain('nix-direct');
    expect(offTemplate(e)).toEqual([]);
    for (const b of beats) if (b.room) expect(fs.existsSync(`scenes/${b.room}/scene.json`)).toBe(true);
    expect(sets(e)).toContain(o.sets);
    expect([...new Set(beats.filter((b) => b.here).map((b) => b.id))].sort()).toEqual([...o.here].sort());
    return e;
  };
  it('Returned to Stock follows House Glass (House Glass spec)', () => {
    const e = nixAct('returned-to-stock', { after: 'lark_one', sets: 'lark_two=yes', here: ['home'] });
    for (const c of e.beats.get('burned')![0].choices) expect((e.outcomes.get(c.to)!.effects.settles ?? []).map((x) => x.who)).toContain('nix-direct');
    const ask = cardSets(e, 'ask');
    expect(ask.find((c) => c.sets.includes('nix2=asked'))!.sets).toContain('nix_asked=yes');
  });
  it('Lark ends it four ways, and only an asked night opens the door (House Glass spec)', () => {
    const e = nixAct('lark', { after: 'lark_two', sets: 'lark=hers', here: ['floor', 'vault', 'out', 'home', 'burned', 'getaway'] });
    expect(sets(e)).toEqual(expect.arrayContaining(['lark=sold', 'lark=crushed', 'lark=hers', 'lark=house']));
    const [door, plain] = e.beats.get('home')!;
    expect(JSON.stringify(door.when)).toContain('door');
    expect(plain.when).toBeNull();
    const settledBy = (beat: typeof door, id: string) => (e.outcomes.get(beat.choices.find((c) => c.id === id)!.to)!.effects.settles ?? []).filter((x) => x.who === 'nix-direct').map((x) => x.text);
    for (const id of ['crush', 'hers']) {
      expect(settledBy(door, id), id).toHaveLength(1);
      expect(settledBy(plain, id), id).toHaveLength(1);
      expect(settledBy(door, id)[0]).not.toBe(settledBy(plain, id)[0]);
    }
    for (const beat of [door, plain]) expect(e.outcomes.get(beat.choices.find((c) => c.id === 'venn')!.to)!.effects.payKind).toBe('full');
    // door=open only from a card that needs an earlier asked.
    for (const c of [...e.beats.values()].flat().flatMap((b) => b.choices)) {
      if (c.tags.some((t) => t.kind === 'set' && t.name === 'door')) expect(c.tags.some((t) => t.kind === 'needs' && t.all.some((x) => x.kind === 'flag' && x.name === 'nix_asked' && x.op === '=' && x.value === 'yes')), c.id).toBe(true);
    }
  });
  // A reward for Lark (2026-11-09, playtest call): her coat, for every ending that gets her home; the blown ones don't.
  it('Lark gives her coat on every ending home, and nowhere else', () => {
    const e = read('lark');
    const homes = e.beats.get('home')!.flatMap((b) => b.choices.map((c) => c.to));
    expect(new Set(homes).size).toBe(6);
    for (const [id, o] of e.outcomes) expect(o.effects.outfit ?? null, id).toEqual(homes.includes(id) ? { who: 'nix-direct', name: 'coat' } : null);
    // Locked until earned, so no room dresses her in it.
    const nix = JSON.parse(fs.readFileSync('characters/nix-direct/character.json', 'utf8')) as { outfitByScene: Record<string, string> };
    expect(Object.values(nix.outfitByScene)).not.toContain('coat');
  });
  it('Off Script follows The Passenger, with Noa on a foil card', () => {
    act('off-script', { after: 'passenger_one', sets: 'passenger_two=yes' });
  });
  const cardSets = (e: ReturnType<typeof read>, beat: string) => e.beats.get(beat)![0].choices.map((c) => ({ id: c.id, needs: c.tags.flatMap((t) => (t.kind === 'needs' ? t.all.map((x) => (x.kind === 'flag' ? `${x.name}${x.op}${x.value}` : x.kind)) : [])), sets: c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : [])) }));
  it('Off Script marks the edit only when it came home (final review I1)', () => {
    const e = read('off-script');
    for (const c of cardSets(e, 'home')) expect(c.sets).toContain('script=yes');
    for (const c of cardSets(e, 'burned')) expect(c.sets).not.toContain('script=yes');
  });
  it("Check-In's ferry speaks of the edit only when there is one (final review I1)", () => {
    const e = read('check-in');
    const home = cardSets(e, 'home');
    expect(home.filter((c) => c.sets.includes('passenger=ran')).map((c) => c.needs)).toEqual([['script=yes'], ['script!=yes']]);
    const dry = e.beats.get('home')![0].choices.find((c) => c.tags.some((t) => t.kind === 'needs' && t.all.some((x) => x.kind === 'flag' && x.op === '!=')))!;
    const out = e.outcomes.get(dry.to)!;
    expect(`${out.text} ${dry.line} ${(out.effects.settles ?? []).map((x) => x.text).join(' ')}`).not.toMatch(/script|edit/i);
    expect(e.outcomes.get('loose')!.text).not.toMatch(/script|edit/i);
  });
  it('a getaway with Noa marks her seen (final review I2)', () => {
    const off = cardSets(read('off-script'), 'getaway');
    expect(off.filter((c) => c.needs.includes('guest.noa=yes')).every((c) => c.sets.includes('noa=seen'))).toBe(true);
    expect(off.filter((c) => c.needs.includes('guest.noa!=yes')).every((c) => !c.sets.includes('noa=seen'))).toBe(true);
    expect(off.some((c) => c.needs.includes('guest.noa=yes'))).toBe(true);
    // In Check-In she's in every beat, card or no card.
    for (const c of cardSets(read('check-in'), 'getaway')) expect(c.sets).toContain('noa=seen');
  });
  it('every Check-In ending sets passenger, so Last Call opens after any of them (Yes Book spec)', () => {
    const e = read('check-in');
    for (const beat of ['home', 'burned', 'getaway']) for (const c of cardSets(e, beat)) expect(c.sets.some((s) => s.startsWith('passenger=')), `${beat}/${c.id}`).toBe(true);
    expect(cardSets(e, 'choice').find((c) => c.id === 'hand')!.sets).toContain('passenger=sold');
  });
  it('Check-In follows Off Script and ends the hunt three ways', () => {
    const e = act('check-in', { after: 'passenger_two', sets: 'passenger=hidden' });
    expect(sets(e)).toEqual(expect.arrayContaining(['passenger=sold', 'passenger=hidden', 'passenger=ran', 'switchboard=burned']));
    const hand = e.beats.get('choice')![0].choices.find((c) => c.id === 'hand')!;
    const handed = e.outcomes.get(hand.to)!;
    expect([handed.to, handed.effects.payKind]).toEqual(['end', 'full']);
    expect(handed.effects.settles?.map((x) => x.who)).toEqual(['ember']);
    // The choice is no roll, and only the relay is rolled after it: the deliver path is two rolled beats, the bury path three.
    expect(e.beats.get('choice')![0].choices.every((c) => !c.check)).toBe(true);
    expect(rolledBeats(e).map((r) => r.id)).toEqual(['out', 'meet', 'relay']);
  });
});

describe("The Yes Book, Hicks's tier 2 case (spec 2026-11-08)", () => {
  const read = (id: string) => {
    const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    return r;
  };
  const tagSets = (c: Choice) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : []));
  const tagNeeds = (c: Choice) => c.tags.flatMap((t) => (t.kind === 'needs' ? t.all.map((x) => (x.kind === 'flag' ? `${x.name}${x.op}${x.value}` : x.kind)) : []));
  const cards = (e: ReturnType<typeof read>['entry'], beat: string) => e.beats.get(beat)!.flatMap((b) => b.choices);
  /** A tier 2 act of the case: Hicks's, with Ember, from the twins', on the tier 2 template, after the last act's flag. */
  const case2 = (id: string, o: { after: string; sets: string; rooms: string[]; guest?: string }) => {
    const r = read(id);
    const e = r.entry;
    expect(r.warnings).toEqual([]);
    expect([e.kind, e.tier, e.for, e.with, e.starts, e.once, e.template]).toEqual(['mission', 2, 'hicks', ['ember'], 'zhou-flat', true, true]);
    expect(JSON.stringify(e.after)).toContain(o.after);
    expect(e.guest ?? null).toEqual(o.guest ? { id: o.guest, grade: 1 } : null);
    const beats = [...e.beats.values()].flat();
    for (const b of beats) expect(b.views.map((v) => v.contact), `${b.id} has a view for ember`).toContain('ember');
    expect(offTemplate(e)).toEqual([]);
    const rooms = new Set(beats.flatMap((b) => (b.room ? [b.room] : [])));
    expect([...rooms].sort()).toEqual([...o.rooms].sort());
    for (const room of rooms) expect(fs.existsSync(`scenes/${room}/scene.json`)).toBe(true);
    expect(beats.flatMap((b) => b.choices.flatMap(tagSets))).toContain(o.sets);
    const text = fs.readFileSync(`world/quests/${id}.md`, 'utf8');
    expect(text).not.toMatch(/breakup|broke up/i);
    expect(text).not.toMatch(/\bICE\b/);
    return { e, text };
  };
  it('Last Call opens after Check-In, at the Tilt', () => {
    const { e } = case2('last-call', { after: 'passenger', sets: 'wren_one=told', rooms: ['karasu/the-tilt', 'spine/deck-market', 'spine/long-haul', 'velvet/bathhouse', 'velvet/under-the-cat', 'drownworks/old-intake'] });
    expect(rolledBeats(e).map((r) => r.id)).toEqual(['market', 'haul', 'bath', 'tail', 'camp']);
    for (const c of [...cards(e, 'blown'), ...cards(e, 'getaway')]) expect(tagSets(c)).toEqual(expect.arrayContaining(['wren_one=kept', 'ashdown=seen']));
  });
  const needsWren = (c: Choice) => tagNeeds(c).some((n) => n.startsWith('guest.wren'));
  it('Torn Page follows Last Call, with Wren on a foil card', () => {
    const { e } = case2('torn-page', { after: 'wren_one', sets: 'wren_two=yes', guest: 'wren', rooms: ['tidal/ferry-stairs', 'strand/old-pier', 'karasu/walk-up-landing'] });
    const rolled = rolledBeats(e).map((r) => r.beat);
    expect(rolled.map((b) => b.id)).toEqual(['arrivals', 'hut', 'wall', 'bay', 'stair']);
    for (const b of rolled) expect(b.choices.filter((c) => c.check && !needsWren(c)).length, `${b.id} stands without her`).toBe(2);
    for (const b of rolled) for (const c of b.choices.filter(needsWren)) expect(c.check?.angle, `${b.id}/${c.id} is an angle`).toBe(true);
    expect(rolled.filter((b) => b.choices.some(needsWren)).length).toBe(5);
  });
  it('every way out of Torn Page remembers whose ear it was', () => {
    const e = read('torn-page').entry;
    for (const beat of ['home', 'blown', 'getaway']) {
      for (const c of cards(e, beat)) {
        const needs = tagNeeds(c);
        const sets = tagSets(c);
        if (needs.includes('guest.wren=yes')) expect(sets, `${beat}/${c.id}`).toContain('wren_ear=yes');
        else if (needs.includes('guest.wren!=yes')) expect(sets, `${beat}/${c.id}`).toContain('wren_ear=no');
        else throw new Error(`${beat}/${c.id} doesn't say whose ear it was`);
        expect(sets).toContain('wren_two=yes');
        expect(sets).toContain(beat === 'home' ? 'dace=held' : 'dace=loose');
      }
    }
  });
  it("Torn Page never reads the back of Wren's page", () => {
    expect(fs.readFileSync('world/quests/torn-page.md', 'utf8')).not.toMatch(/Refused/);
  });
  it('The Yes Book follows Torn Page and ends three ways', () => {
    const { e } = case2('the-yes-book', { after: 'wren_two', sets: 'wren=cut', rooms: ['drownworks/pump-house-nine', 'drownworks/old-intake', 'karasu/the-tilt'] });
    const all = [...e.beats.values()].flat().flatMap((b) => b.choices.flatMap(tagSets));
    expect(all).toEqual(expect.arrayContaining(['wren=exposed', 'wren=owes', 'wren=cut', 'miners=burned', 'book=lost']));
    expect(rolledBeats(e).map((r) => r.id)).toEqual(['door', 'sale', 'dark', 'pipe', 'bay']);
    for (const c of cards(e, 'choice')) {
      expect(c.check).toBeFalsy();
      expect(e.outcomes.get(c.to)!.to).toBe('pipe');
    }
  });
  it('Wren is asked why only if she was not sold whole, and every ending settles Ember', () => {
    const e = read('the-yes-book').entry;
    for (const c of cards(e, 'home')) {
      const needs = tagNeeds(c);
      if (c.id.startsWith('why') || c.id.startsWith('pay')) expect(needs.some((n) => n === 'wren=cut' || n === 'wren=owes'), c.id).toBe(true);
      else expect(e.beats.get('home')!.find((b) => b.choices.includes(c))!.when, c.id).toEqual([{ kind: 'flag', name: 'wren', op: '=', value: 'exposed' }]);
      expect(tagSets(c)).toContain('wren_three=yes');
      expect(e.outcomes.get(c.to)!.effects.settles?.map((x) => x.who), c.id).toEqual(['ember']);
    }
    expect(cards(e, 'home').filter((c) => c.id.startsWith('why')).map(tagNeeds)).toEqual([['wren=cut'], ['wren=owes']]);
    expect(e.outcomes.get(cards(e, 'home').find((c) => c.id === 'why-cut')!.to)!.text).toMatch(/Asked: Hicks\. Refused\./);
    const text = fs.readFileSync('world/quests/the-yes-book.md', 'utf8');
    expect(text.slice(text.lastIndexOf('# home'), text.indexOf('# blown'))).toContain('[wren_job=free]');
  });
  it('a loose Dace gets his own ask', () => {
    const e = read('the-yes-book').entry;
    const asks = e.beats.get('ask')!;
    const loose = asks.find((b) => JSON.stringify(b.when).includes('dace'))!;
    expect(loose.when).toEqual([{ kind: 'flag', name: 'dace', op: '=', value: 'loose' }]);
    expect(loose.text).not.toMatch(/couch/);
  });
  it('a getaway out of The Yes Book loses the book, unless he already burned it (final review C1)', () => {
    const got = cards(read('the-yes-book').entry, 'getaway');
    for (const c of got) {
      expect(tagSets(c)).toContain('wren_three=yes');
      if (tagNeeds(c).includes('wren=owes')) expect(tagSets(c)).not.toContain('book=lost');
      else expect([tagNeeds(c), tagSets(c)]).toEqual([expect.arrayContaining(['wren!=owes']), expect.arrayContaining(['book=lost'])]);
    }
    expect(got.some((c) => tagNeeds(c).includes('wren=owes'))).toBe(true);
  });
  it('a blown Yes Book answers the choice already made (final review C1)', () => {
    const e = read('the-yes-book').entry;
    // Blown only follows the choice, so wren is always set: cut is the default version.
    const by = (v: string) => e.beats.get('blown')!.find((b) => JSON.stringify(b.when) === JSON.stringify(v === 'cut' ? null : [{ kind: 'flag', name: 'wren', op: '=', value: v }]))!;
    for (const c of by('owes').choices) expect(tagSets(c)).not.toContain('book=lost');
    for (const v of ['exposed', 'cut']) for (const c of by(v).choices) expect(tagSets(c)).toContain('book=lost');
    expect(by('owes').text).toMatch(/ash/);
    expect(by('exposed').text).toMatch(/Tamsin/);
    expect(by('cut').text).toMatch(/page/);
    for (const v of ['owes', 'exposed', 'cut']) expect(by(v).text).not.toMatch(/nothing changed/i);
  });
  it('getaways assume no place and nothing in hand (final review I2)', () => {
    const lc = read('last-call').entry.beats.get('getaway')![0]!;
    expect([lc.text, ...lc.choices.map((c) => c.line)].join(' ')).not.toMatch(/stub|pipe|intake/i);
    const tp = read('torn-page').entry.beats.get('getaway')![0]!;
    expect([tp.text, ...tp.choices.map((c) => c.line)].join(' ')).not.toMatch(/quay|boat|Dace/);
  });
  it('a player who never saw the page hears whose it is at the sale (final review I3)', () => {
    const sale = read('the-yes-book').entry.beats.get('sale')![0]!;
    const seg = sale.segments.find((x) => JSON.stringify(x.when) === JSON.stringify([{ kind: 'flag', name: 'page', op: '!=', value: 'read' }, { kind: 'flag', name: 'page', op: '!=', value: 'folded' }]));
    expect(seg?.text).toMatch(/Wren/);
  });
  it("the case's text never contradicts the run that led to it (final review, re-graded minors)", () => {
    expect(fs.readFileSync('world/quests/torn-page.md', 'utf8')).not.toMatch(/Noa|came up behind you/);
    const yb = fs.readFileSync('world/quests/the-yes-book.md', 'utf8');
    expect(yb).not.toMatch(/the way Dace came|lost her at the gate|followed a Strip-Miner/);
  });
  it('Ines is never named in her own pump house', () => {
    expect(fs.readFileSync('world/quests/the-yes-book.md', 'utf8')).not.toMatch(/Ines/);
  });
  it("Wren's first line reads Check-In, burned before sold", () => {
    const text = fs.readFileSync('world/quests/last-call.md', 'utf8');
    const tilt = text.slice(text.indexOf('# tilt'), text.indexOf('\n# ', text.indexOf('# tilt') + 1));
    expect(tilt).toContain('[switchboard=burned]');
    expect(tilt).toContain('[passenger=sold and switchboard!=burned]');
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

// Job texts (spec 2026-11-09 §6): Rue hands Soren Arrears by text; everyone with a home sleeps in it.
describe('job texts content', () => {
  it('Arrears is texted by Rue', () => {
    const r = parseQuestFile('arrears', fs.readFileSync('world/quests/arrears.md', 'utf8'), { roster: null, places: null });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.text).toMatch(/Soren/);
    expect(r.entry.with).toEqual(['rue']);
  });
  it('every contact with a home in their schedule sleeps there; Nix is asleep at 10:00 and up at 15:00', async () => {
    const { resolveSchedule } = await import('../src/character');
    const { awakeAt, DAY } = await import('../../shared/clock');
    const blocks = (id: string) => resolveSchedule(JSON.parse(fs.readFileSync(`characters/${id}/character.json`, 'utf8')).schedule, () => true, () => {});
    for (const id of ['nix-direct', 'cass', 'silas', 'ember', 'hicks', 'rue', 'soren']) expect(blocks(id).some((b) => b.sleeps), id).toBe(true);
    expect(awakeAt(blocks('nix-direct'), DAY + 600)).toBe(false);
    expect(awakeAt(blocks('nix-direct'), DAY + 900)).toBe(true);
  });
});
