import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { PlaythroughInfo, RoomState } from '../../shared/types';
import { aroundContacts, contactsAndAround, knownContacts, placesOf } from '../src/contacts';
import { openDb, type Db } from '../src/db';
import { tempDir } from './fixtures/temp-dir';

const ROSTER = [
  { id: 'nix', name: 'Nix', pronoun: 'she' as const, accent: '#ff3366', startRoom: 'karasu/lowlight-intake' },
  { id: 'cass', name: 'Cass', pronoun: 'she' as const, accent: '#33ccff', startRoom: 'karasu/ribbon-rooftop' },
  { id: 'vee', name: 'Vee', pronoun: 'she' as const, accent: '#99ff33', startRoom: 'default/workspace' },
];

const PLACES: Record<string, string> = { 'karasu/lowlight-intake': 'Lowlight Intake', 'karasu/noodle-stall': 'Noodle Stall', 'karasu/ribbon-rooftop': 'The Roof' };
const names = { placeName: (s: string) => PLACES[s] ?? s, playerName: 'Hicks', residentNames: ['Hae'] };

function playthrough(startContact = 'nix'): PlaythroughInfo {
  return { id: 'pt-20261007-test', name: 'Hicks — Oct 7, 21:40', player: 'hicks', startContact, createdAt: 1, updatedAt: 1, forkedFrom: null, location: null };
}

/** `chars/<id>/room.db`, written by `fill` and closed. */
function withDb(chars: string, id: string, fill: (db: Db) => void): void {
  fs.mkdirSync(path.join(chars, id), { recursive: true });
  const db = openDb(path.join(chars, id, 'room.db'), { defaultPlayer: 'hicks' });
  try {
    fill(db);
  } finally {
    db.close();
  }
}

const room = (sceneId: string, timeOfDay: string) => ({ sceneId, lights: [], atmosphere: { timeOfDay } }) as unknown as RoomState;

describe('met after her greeting (Review Focus 3)', () => {
  const greet = (status: 'ok' | 'failed') => (db: Db) => {
    db.insertMessage('hicks', { id: 'g', role: 'user', text: '', toolLines: [], ts: 1, status: 'ok', mode: 'greet' });
    db.insertMessage('hicks', { id: 'r', role: 'agent', text: 'Who are you?', toolLines: [], ts: 2, status, mode: 'greet', replyTo: 'g' });
  };
  it('her finished greeting makes her met; a failed one does not', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', greet('ok'));
    withDb(chars, 'vee', greet('failed'));
    expect(knownContacts(chars, playthrough(), ROSTER, names).map((c) => [c.id, c.status])).toEqual([['nix', 'start'], ['cass', 'met']]);
  });
});

describe('met by any answer of hers, and an unreadable database (Task 3 review 3, 4)', () => {
  it('her finished reply to a move or a dice game makes her met too', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'r', role: 'agent', text: 'Here we are.', toolLines: [], ts: 2, status: 'ok', mode: 'travel' }));
    withDb(chars, 'vee', (db) => db.insertMessage('hicks', { id: 'd', role: 'agent', text: 'Liar.', toolLines: [], ts: 2, status: 'ok', mode: 'dice' }));
    expect(knownContacts(chars, playthrough(), ROSTER, names).map((c) => c.status)).toEqual(['start', 'met', 'met']);
  });

  it('one bad database is skipped, not the whole list', () => {
    const chars = tempDir('contacts-');
    fs.mkdirSync(path.join(chars, 'cass'), { recursive: true });
    fs.writeFileSync(path.join(chars, 'cass', 'room.db'), 'not a database');
    withDb(chars, 'vee', (db) => db.saveRoom({ sceneId: 'karasu/noodle-stall' } as unknown as RoomState));
    const roster = [...ROSTER, { id: 'hicks', name: 'Hicks', pronoun: 'she' as const, accent: '#3dff7a', startRoom: 'karasu/hicks-room' }];
    expect(aroundContacts(chars, playthrough(), roster, names).map((e) => e.contactId)).toEqual(['cass', 'vee']);
    expect(knownContacts(chars, playthrough(), ROSTER, names).map((c) => c.id)).toEqual(['nix']);
  });

  it('a database from before encounter cards (no encounter column) still reads', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'm', role: 'agent', text: 'Rain again.', toolLines: [], ts: 1, status: 'ok' }));
    const old = new DatabaseSync(path.join(chars, 'cass', 'room.db'));
    old.exec('ALTER TABLE messages DROP COLUMN encounter');
    old.close();
    const cass = knownContacts(chars, playthrough(), ROSTER, names).find((c) => c.id === 'cass');
    expect(cass?.status).toBe('met');
    expect(cass?.lastLine?.text).toBe('Rain again.');
  });
});

describe('where she is now, and one read for both lists (final review 2, 7)', () => {
  const roster = [...ROSTER, { id: 'hicks', name: 'Hicks', pronoun: 'she' as const, accent: '#3dff7a', startRoom: 'karasu/hicks-room' }];
  it("her open room's scene wins over the saved one, for contacts and strangers", () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.saveRoom(room('karasu/ribbon-rooftop', 'dusk')));
    const live = { ...names, liveScene: (id: string) => (id === 'cass' || id === 'nix' ? 'karasu/noodle-stall' : null) };
    expect(knownContacts(chars, playthrough(), roster, live)[0]).toMatchObject({ id: 'nix', sceneId: 'karasu/noodle-stall', placeName: 'Noodle Stall' });
    expect(aroundContacts(chars, playthrough(), roster, live)[0]).toMatchObject({ contactId: 'cass', sceneId: 'karasu/noodle-stall' });
  });
  it('a contact whose database still says ribbon/ is placed under karasu/', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.saveRoom(room('ribbon/noodle-stall', 'dusk')));
    expect(aroundContacts(chars, playthrough(), roster, names)[0]).toMatchObject({ contactId: 'cass', sceneId: 'karasu/noodle-stall' });
  });
  it('contactsAndAround gives both lists, as the two calls do', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));
    const both = contactsAndAround(chars, playthrough(), roster, names);
    expect(both.known).toEqual(knownContacts(chars, playthrough(), roster, names));
    expect(both.around).toEqual(aroundContacts(chars, playthrough(), roster, names));
  });
});

describe('aroundContacts', () => {
  const roster = [...ROSTER, { id: 'hicks', name: 'Hicks', pronoun: 'she' as const, accent: '#3dff7a', startRoom: 'karasu/hicks-room' }];
  it('the roster minus the known and the player, where each is now, in roster order', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'vee', (db) => db.saveRoom(room('karasu/noodle-stall', 'dusk')));
    expect(aroundContacts(chars, playthrough(), roster, names)).toEqual([
      { contactId: 'cass', sceneId: 'karasu/ribbon-rooftop', placeName: 'The Roof', timeOfDay: null },
      { contactId: 'vee', sceneId: 'karasu/noodle-stall', placeName: 'Noodle Stall', timeOfDay: 'dusk' },
    ]);
  });
  it('a tie or a greeting takes her out of it', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'r', role: 'agent', text: 'Hi.', toolLines: [], ts: 2, status: 'ok', mode: 'greet' }));
    expect(aroundContacts(chars, playthrough(), roster, { ...names, ties: { vee: 't' } })).toEqual([]);
  });
});

describe('portrait', () => {
  it("her sprite's face thumbnail when she has one, else her avatar, else none", () => {
    const chars = tempDir('contacts-');
    const roster = [{ ...ROSTER[0], thumb: true }, { ...ROSTER[1], avatar: false, thumb: true }, { ...ROSTER[2], avatar: false }];
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));
    withDb(chars, 'vee', (db) => db.insertMessage('hicks', { id: 'v1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));
    expect(knownContacts(chars, playthrough(), roster, names).map((c) => c.portrait)).toEqual(['/api/agents/nix/thumb', '/api/agents/cass/thumb', null]);
    expect(knownContacts(chars, playthrough(), ROSTER, names)[0]!.portrait).toBe('/api/agents/nix/avatar');
  });
});

describe('knownContacts ties', () => {
  it('a tied contact is known from before; met wins over the tie; the order is start, met, knows (Review Focus 1)', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));
    const list = knownContacts(chars, playthrough(), ROSTER, { ...names, ties: { cass: 't', vee: 't' } });
    expect(list.map((c) => [c.id, c.status])).toEqual([['nix', 'start'], ['cass', 'met'], ['vee', 'knows']]);
    expect(knownContacts(chars, playthrough(), ROSTER, names).map((c) => c.id)).toEqual(['nix', 'cass']);
  });
});

describe('knownContacts standing', () => {
  const stand = (contactId: string, stored: { trust: number; warmth: number; moves: { reason: string }[] } | null) => {
    const v = stored ?? (contactId === 'vee' ? { trust: 6, warmth: 6 } : { trust: 0, warmth: 0 });
    return { word: `${contactId}:${v.trust}/${v.warmth}`, trust: v.trust, warmth: v.warmth, last: stored?.moves.at(-1)?.reason ?? null };
  };
  it('a met contact carries her stored standing; one with no key gets the start', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
      db.setMeta('standing.hicks', JSON.stringify({ trust: 3, warmth: -1, moves: [{ trust: 3, warmth: -1, reason: 'paid on time', at: 1, messageId: 'm', take: 0 }] }));
    });
    const list = knownContacts(chars, playthrough(), ROSTER, { ...names, standing: stand });
    expect(list.find((c) => c.id === 'cass')!.standing).toEqual({ word: 'cass:3/-1', trust: 3, warmth: -1, last: 'paid on time' });
    expect(list.find((c) => c.id === 'nix')!.standing).toEqual({ word: 'nix:0/0', trust: 0, warmth: 0, last: null });
  });
  it('a contact known only from a tie, with no database, gets the start word (Review Focus 4)', () => {
    const chars = tempDir('contacts-');
    const vee = knownContacts(chars, playthrough(), ROSTER, { ...names, ties: { vee: 't' }, standing: stand }).find((c) => c.id === 'vee')!;
    expect(vee.status).toBe('knows');
    expect(vee.standing).toEqual({ word: 'vee:6/6', trust: 6, warmth: 6, last: null });
  });
  it('a contact only heard of carries none', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'nix', (db) => db.shareContact({ contactId: 'cass', player: 'hicks', messageId: 'm', how: null, at: 1 }));
    const cass = knownContacts(chars, playthrough(), ROSTER, { ...names, standing: stand }).find((c) => c.id === 'cass')!;
    expect(cass.status).toBe('shared');
    expect(cass.standing).toBeNull();
  });
  it('another player\'s key is not read', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
      db.setMeta('standing.someone', JSON.stringify({ trust: 9, warmth: 9, moves: [] }));
    });
    expect(knownContacts(chars, playthrough(), ROSTER, { ...names, standing: stand }).find((c) => c.id === 'cass')!.standing!.trust).toBe(0);
  });
  it('without a resolver, entries carry no standing key', () => {
    const chars = tempDir('contacts-');
    expect('standing' in knownContacts(chars, playthrough(), ROSTER, names)[0]!).toBe(false);
  });
});

describe('knownContacts', () => {
  it('start contact is known with no dbs', () => {
    const chars = tempDir('contacts-');
    expect(knownContacts(chars, playthrough(), ROSTER, names)).toEqual([
      {
        id: 'nix',
        name: 'Nix',
        accent: '#ff3366',
        portrait: '/api/agents/nix/avatar',
        status: 'start',
        sceneId: 'karasu/lowlight-intake',
        placeName: 'Lowlight Intake',
        timeOfDay: null,
        lastLine: null,
      },
    ]);
  });

  it('a contact with no avatar has no portrait', () => {
    const chars = tempDir('contacts-');
    const [nix] = knownContacts(chars, playthrough(), [{ ...ROSTER[0], avatar: false }, ...ROSTER.slice(1)], names);
    expect(nix.portrait).toBeNull();
  });

  it('a contact with an rp message is met', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.saveRoom(room('karasu/noodle-stall', 'dusk'));
      db.insertMessage('hicks', { id: 'm1', role: 'user', text: 'hey', toolLines: [], ts: 1, status: 'ok' });
      db.insertMessage('hicks', { id: 'm2', role: 'agent', text: 'Say it, then.', toolLines: [], ts: 2, status: 'ok', replyTo: 'm1' });
      db.insertMessage('hicks', { id: 'm3', role: 'user', text: 'out of character', toolLines: [], ts: 3, status: 'ok', mode: 'ooc' });
    });
    // Only OOC with vee: not met.
    withDb(chars, 'vee', (db) => db.insertMessage('hicks', { id: 'v1', role: 'user', text: 'ooc', toolLines: [], ts: 1, status: 'ok', mode: 'ooc' }));
    // Another persona's line doesn't count either.
    withDb(chars, 'nix', (db) => db.insertMessage('cass', { id: 'x1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));

    const list = knownContacts(chars, playthrough(), ROSTER, names);
    expect(list.map((c) => [c.id, c.status])).toEqual([
      ['nix', 'start'],
      ['cass', 'met'],
    ]);
    expect(list[1]).toMatchObject({ sceneId: 'karasu/noodle-stall', placeName: 'Noodle Stall', timeOfDay: 'dusk', lastLine: { speaker: 'Cass', text: 'Say it, then.' } });
  });

  it('a share row in nix\'s db makes cass shared by Nix', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'nix', (db) => {
      db.insertMessage('hicks', { id: 'r1', role: 'agent', text: 'Call her.', toolLines: [], ts: 1, status: 'ok' });
      db.shareContact({ contactId: 'cass', player: 'hicks', messageId: 'r1', how: 'gave you her number', at: 2 });
      // Shared with someone else: not ours.
      db.shareContact({ contactId: 'vee', player: 'cass', messageId: 'r1', how: null, at: 2 });
    });

    const list = knownContacts(chars, playthrough(), ROSTER, names);
    expect(list.map((c) => [c.id, c.status, c.sharedBy])).toEqual([
      ['nix', 'start', undefined],
      ['cass', 'shared', 'Nix'],
    ]);
    expect(list[1]).toMatchObject({ sceneId: 'karasu/ribbon-rooftop', placeName: 'The Roof', timeOfDay: null, lastLine: null });
  });

  it('a bare room id from before rooms is completed with her legacy district', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.saveRoom(room('noodle-stall', 'dusk'));
      db.insertMessage('hicks', { id: 'm1', role: 'user', text: 'hey', toolLines: [], ts: 1, status: 'ok' });
    });
    const roster = [ROSTER[0], { ...ROSTER[1], legacyDistrict: 'karasu' }, ROSTER[2]];
    const list = knownContacts(chars, playthrough(), roster, { ...names, hasScene: (s: string) => s in PLACES });
    expect(list[1]).toMatchObject({ id: 'cass', sceneId: 'karasu/noodle-stall', placeName: 'Noodle Stall' });
  });

  it('a contact removed from the roster is dropped', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'ghost', (db) => {
      db.insertMessage('hicks', { id: 'g1', role: 'user', text: 'boo', toolLines: [], ts: 1, status: 'ok' });
      db.shareContact({ contactId: 'cass', player: 'hicks', messageId: 'g1', how: null, at: 2 });
    });
    // The start contact gone too: nobody from the roster but the one she introduced.
    const list = knownContacts(chars, playthrough('ghost'), ROSTER, names);
    expect(list.map((c) => [c.id, c.status, c.sharedBy])).toEqual([['cass', 'shared', 'ghost']]);
  });

  it("an event and her reaction count: met, and her reaction (the courier's paragraph his) is the last line (minor M6)", () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.insertMessage('hicks', { id: 'e1', role: 'user', text: 'A courier.', toolLines: [], ts: 1, status: 'ok', mode: 'encounter', encounter: { title: 'T', stranger: { name: 'Courier', voice: 'v' } } });
      db.insertMessage('hicks', { id: 'a1', role: 'agent', text: 'Not my name.\n\nCourier: Print here.', toolLines: [], ts: 2, status: 'ok', mode: 'encounter', replyTo: 'e1' });
    });
    const list = knownContacts(chars, playthrough(), ROSTER, names);
    expect(list.map((c) => [c.id, c.status])).toEqual([
      ['nix', 'start'],
      ['cass', 'met'],
    ]);
    expect(list[1].lastLine).toEqual({ speaker: 'Courier', text: 'Print here.' });
  });
});


describe("placesOf (who's here reads only rooms)", () => {
  it('gives every roster contact the place the full lists give her, the player left out', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.saveRoom(room('karasu/noodle-stall', 'night')));
    const full = contactsAndAround(chars, playthrough(), ROSTER, names);
    const expected = new Map<string, string>([...full.known.map((c) => [c.id, c.sceneId] as [string, string]), ...full.around.map((a) => [a.contactId, a.sceneId] as [string, string])]);
    expect(placesOf(chars, playthrough(), ROSTER, names)).toEqual(expected);
    expect(placesOf(chars, playthrough(), ROSTER, names).get('cass')).toBe('karasu/noodle-stall');
  });
});

describe('knownContacts arrangement (spec 2026-10-20 §3)', () => {
  const stand = (contactId: string, stored: { trust: number; warmth: number; moves: { reason: string }[] } | null) => {
    const v = stored ?? { trust: 0, warmth: 0 };
    return { word: `${contactId}:${v.trust}`, trust: v.trust, warmth: v.warmth, last: null };
  };
  const dealDb = (trust: number | null) => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => {
      db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
      if (trust !== null) {
        db.setMeta('standing.hicks', JSON.stringify({ trust, warmth: 0, moves: [] }));
        db.setMeta('arrangement.hicks', JSON.stringify({ role: 'operator', retainer: 150, nights: 1, since: 0 }));
      }
    });
    return knownContacts(chars, playthrough(), ROSTER, { ...names, standing: stand }).find((c) => c.id === 'cass')!;
  };
  it('a deal at high trust is active; below, it stepped back; none, null', () => {
    expect(dealDb(5).arrangement).toEqual({ retainer: 150, nights: 1, active: true });
    expect(dealDb(4).arrangement).toEqual({ retainer: 150, nights: 1, active: false });
    expect(dealDb(null).arrangement ?? null).toBeNull();
  });
});

describe('her file (FILE on YOU, spec 2026-10-28 §2)', () => {
  it('each entry carries her roster file (bio and facts); a roster entry with neither carries no keys', () => {
    const chars = tempDir('contacts-');
    withDb(chars, 'cass', (db) => db.insertMessage('hicks', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' }));
    const roster = [{ ...ROSTER[0], bio: ['A.'], facts: [{ label: 'TELL', value: 'x' }] }, { ...ROSTER[1], bio: [], facts: [] }, ROSTER[2]];
    const [nix, cass] = knownContacts(chars, playthrough(), roster, names);
    expect(nix.bio).toEqual(['A.']);
    expect(nix.facts).toEqual([{ label: 'TELL', value: 'x' }]);
    expect('bio' in cass).toBe(false);
    expect('facts' in cass).toBe(false);
  });
});
