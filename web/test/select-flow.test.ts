import { describe, expect, it } from 'vitest';
import { createFlow, canBeAi, NEW_PERSON, personTile, YOURS, type RosterEntry } from '../src/landing/select-flow';
import type { Match } from '../src/room/identity';

// 7-entry roster of direct characters: 5 connected, 2 offline.
// Names chosen so alpha order within "connected" and within "the rest" is clear and distinct from
// id order (to exercise the tie-break rule too).
const roster: RosterEntry[] = [
  { id: 'dixie', name: 'Dixie', connected: true, backend: 'direct', link: 'ok' },
  { id: 'echo', name: 'Echo', connected: true, backend: 'direct', link: 'ok' },
  { id: 'bray', name: 'Bray', connected: true, backend: 'direct', link: 'ok' },
  { id: 'nix', name: 'Nix', connected: true, backend: 'direct', link: 'ok' },
  { id: 'ash', name: 'Ash', connected: true, backend: 'direct', link: 'ok' },
  { id: 'ghost', name: 'Ghost', connected: false, backend: 'direct', link: 'unknown' }, // offline
  { id: 'hicks', name: 'Hicks', connected: false, backend: 'direct', link: 'unknown' }, // offline
];

// Expected tile order on 1P: + (make someone), then connected sorted by name: Ash, Bray, Dixie, Echo, Nix
// then the rest sorted by name: Ghost, Hicks. 2P has the same without the +.
const expectedTiles = [NEW_PERSON, 'ash', 'bray', 'dixie', 'echo', 'nix', 'ghost', 'hicks'];
const expectedP2 = expectedTiles.slice(1);

function makeFlow() {
  return createFlow(roster, { columns: 6 });
}

// Direct characters (two of them offline) and a mindless one.
const mixed: RosterEntry[] = [
  { id: 'cass', name: 'Cass', connected: true, backend: 'direct', link: 'ok' },
  { id: 'hicks', name: 'Hicks', connected: false, backend: 'none', link: 'unknown' },
  { id: 'nix', name: 'Nix', connected: true, backend: 'direct', link: 'ok' },
  { id: 'dixie', name: 'Dixie', connected: true, backend: 'direct', link: 'ok' },
  { id: 'wint', name: 'Wintermute', connected: false, backend: 'direct', link: 'unreachable' },
  { id: 'case', name: 'Case', connected: false, backend: 'direct', link: 'unknown' },
];
// 1P tiles: [+, 'cass', 'dixie', 'nix', 'case', 'hicks', 'wint']; 2P without the +.

function makeMixedFlow() {
  return createFlow(mixed, { columns: 6 });
}

describe('tile order', () => {
  it('orders tiles +, connected by name, then the rest by name', () => {
    const flow = makeFlow();
    expect(flow.tiles).toEqual(expectedTiles);
  });
});

describe('movement', () => {
  it('left/right wrap across rows and from last to first', () => {
    const flow = makeFlow();
    // 8 tiles, 6 columns -> row0: [0..5], row1: [6,7]
    expect(flow.state.cursor.p1).toBe(0);
    flow.move('left'); // wraps to last tile (index 7)
    expect(flow.state.cursor.p1).toBe(7);
    flow.move('right'); // back to 0
    expect(flow.state.cursor.p1).toBe(0);
    // move right across the whole row and into the next
    for (let i = 0; i < 7; i++) flow.move('right');
    expect(flow.state.cursor.p1).toBe(7);
    flow.move('right'); // wraps to 0
    expect(flow.state.cursor.p1).toBe(0);
  });

  it('up/down move a row and stay put past the ends', () => {
    const flow = makeFlow();
    flow.hover(0); // row0, col0
    flow.move('down');
    expect(flow.state.cursor.p1).toBe(6); // row1, col0 exists
    flow.move('down'); // row2 col0 (idx 12) doesn't exist -> stays put
    expect(flow.state.cursor.p1).toBe(6);
    flow.move('up');
    expect(flow.state.cursor.p1).toBe(0);
    flow.move('up'); // above row0 -> stays put
    expect(flow.state.cursor.p1).toBe(0);

    flow.hover(2); // row0 col2
    flow.move('down'); // row1 has cols 0-1 only: the nearest column, col1 (idx 7)
    expect(flow.state.cursor.p1).toBe(7);
  });
});

describe('p1 lock', () => {
  it('p1 lock on any character (offline or mindless too) -> p2 with p2 cursor on the player tile', () => {
    const flow = makeFlow();
    flow.begin(null);
    const ghostIdx = flow.tiles.indexOf('ghost');
    flow.hover(ghostIdx);
    const result = flow.lock();
    flow.chooseYou(null);
    expect(result).toBe('ok');
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.player).toBe('ghost');
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('ghost'));

    // a mindless entry (backend 'none'), from the mixed fixture
    const flow2 = makeMixedFlow();
    flow2.begin(null);
    const hicksIdx = flow2.tiles.indexOf('hicks');
    flow2.hover(hicksIdx);
    const result2 = flow2.lock();
    flow2.chooseYou(null);
    expect(result2).toBe('ok');
    expect(flow2.state.phase).toBe('p2');
    expect(flow2.state.player).toBe('hicks');
    expect(flow2.state.cursor.p2).toBe(flow2.grids.p2.tiles.indexOf('hicks'));
  });

});

describe('you phase', () => {
  const vee = { name: 'Vee', background: 'Ex-courier.' };

  it('locking 1P goes to you, with no persona yet', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('nix'));
    expect(flow.lock()).toBe('ok');
    expect(flow.state.phase).toBe('you');
    expect(flow.state.player).toBe('nix');
    expect(flow.state.persona).toBeNull();
  });

  it('chooseYou stores the persona and goes to p2, the p2 cursor on the player tile', () => {
    const flow = makeFlow();
    flow.begin(null);
    const nixIdx = flow.tiles.indexOf('nix');
    flow.hover(nixIdx);
    flow.lock();
    flow.chooseYou(vee);
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.persona).toEqual(vee);
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('nix'));
  });

  it('chooseYou(null) plays as them', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('ash'));
    flow.lock();
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.persona).toBeNull();
  });

  it('chooseYou outside you does nothing', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.chooseYou(vee);
    expect(flow.state.phase).toBe('p1');
    expect(flow.state.persona).toBeNull();
  });

  it('back from p2 returns to you keeping the persona; back from you returns to p1 clearing player and persona', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('nix'));
    flow.lock();
    flow.chooseYou(vee);
    flow.back();
    expect(flow.state.phase).toBe('you');
    expect(flow.state.player).toBe('nix');
    expect(flow.state.persona).toEqual(vee);
    flow.back();
    expect(flow.state.phase).toBe('p1');
    expect(flow.state.player).toBeNull();
    expect(flow.state.persona).toBeNull();
  });

  it('lock and move are no-ops in you', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('nix'));
    flow.lock();
    const before = JSON.stringify(flow.state);
    expect(flow.lock()).toBe('noop');
    flow.move('right');
    flow.hover(1);
    expect(JSON.stringify(flow.state)).toBe(before);
  });

  it('resume never enters you', () => {
    const flow = makeFlow();
    flow.resume({ player: 'nix', ai: 'dixie' } as Match);
    expect(flow.state.phase).toBe('ready');
    expect(flow.state.persona).toBeNull();
  });
});

describe('p2 lock', () => {
  it('p2 lock refuses offline and mindless', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('ash'));
    flow.lock(); // p1 locked -> now in p2
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('p2');

    // offline refused
    flow.hover(flow.tiles.indexOf('ghost'));
    expect(flow.lock()).toBe('refused');
    expect(flow.state.phase).toBe('p2');

    // another offline entry refused too
    flow.hover(flow.tiles.indexOf('hicks'));
    expect(flow.lock()).toBe('refused');
    expect(flow.state.phase).toBe('p2');
  });

  it('p2 lock refuses a mindless entry (backend none)', () => {
    const flow = makeMixedFlow();
    flow.hover(flow.tiles.indexOf('cass'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('hicks'));
    expect(flow.lock()).toBe('refused');
    expect(flow.state.phase).toBe('p2');
  });

  it('p2 lock: a direct contact -> model', () => {
    const flow1 = makeMixedFlow();
    flow1.hover(flow1.tiles.indexOf('hicks'));
    flow1.lock();
    flow1.chooseYou(null);
    flow1.hover(flow1.tiles.indexOf('cass')); // direct
    expect(flow1.lock()).toBe('ok');
    expect(flow1.state.phase).toBe('model');
  });
});

describe('model phase', () => {
  it('locking a direct contact enters model; chooseModel enters ready; back from ready returns to model', () => {
    const flow = makeMixedFlow();
    flow.hover(flow.tiles.indexOf('hicks'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('cass')); // direct
    flow.lock();
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('model');
    // The panel owns the model step's keys: Enter and arrows do nothing to the flow.
    expect(flow.lock()).toBe('noop');
    const before = { ...flow.state.cursor };
    flow.move('down');
    flow.move('left');
    expect(flow.state.cursor).toEqual(before);
    expect(flow.state.phase).toBe('model');
    flow.chooseModel();
    expect(flow.state.phase).toBe('ready');
    flow.back();
    expect(flow.state.phase).toBe('model');
  });

  it('chooseModel outside the model phase does nothing', () => {
    const flow = makeMixedFlow();
    flow.chooseModel();
    expect(flow.state.phase).toBe('p1');
  });

  it('a no-link direct contact is pickable', () => {
    const entries: RosterEntry[] = mixed.map((e) => (e.id === 'cass' ? { ...e, link: 'no-link' } : e));
    expect(canBeAi(entries.find((e) => e.id === 'cass')!)).toBe(true);
    const flow = createFlow(entries, { columns: 6 });
    flow.hover(flow.tiles.indexOf('hicks'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('cass'));
    expect(flow.lock()).toBe('ok');
    expect(flow.state.phase).toBe('model');
  });
});

describe('ready phase', () => {
  it('ready: lock -> dial; moves do nothing', () => {
    const flow = makeFlow();
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('ash'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('bray')); // direct -> model
    flow.lock();
    flow.chooseModel();
    expect(flow.state.phase).toBe('ready');
    const before = { ...flow.state.cursor };
    flow.move('left');
    flow.move('right');
    flow.move('up');
    flow.move('down');
    expect(flow.state.cursor).toEqual(before);
    expect(flow.lock()).toBe('dial');
  });
});

describe('back', () => {
  it('back from each phase, and nothing from p1', () => {
    const flow = makeMixedFlow();
    // nothing from p1
    flow.back();
    expect(flow.state.phase).toBe('p1');

    flow.hover(flow.tiles.indexOf('hicks'));
    flow.lock(); // -> p2
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('p2');
    flow.back();
    expect(flow.state.phase).toBe('you');
    flow.back();
    expect(flow.state.phase).toBe('p1');
    expect(flow.state.player).toBeNull();

    // p2 -> model -> back -> p2 (ai unlocked)
    flow.hover(flow.tiles.indexOf('hicks'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('cass')); // direct
    flow.lock();
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('model');
    flow.back();
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.ai).toBeNull();

    // direct: p2 -> model -> ready -> back -> model
    flow.hover(flow.tiles.indexOf('cass'));
    flow.lock();
    flow.chooseYou(null);
    flow.chooseModel();
    expect(flow.state.phase).toBe('ready');
    flow.back();
    expect(flow.state.phase).toBe('model');
  });
});

describe('begin', () => {
  it('begin(remembered) places both cursors; unknown ids fall back to 0 / the player tile', () => {
    const flow = makeFlow();
    const match: Match = { player: 'bray', ai: 'dixie', };
    flow.begin(match);
    expect(flow.state.phase).toBe('p1');
    expect(flow.state.cursor.p1).toBe(flow.tiles.indexOf('bray'));
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('dixie'));

    const flow2 = makeFlow();
    flow2.begin(null);
    expect(flow2.state.cursor.p1).toBe(0);
    expect(flow2.state.cursor.p2).toBe(0); // the first contact, since no remembered ai

    const flow3 = makeFlow();
    const unknownMatch: Match = { player: 'nope', ai: 'alsonope', };
    flow3.begin(unknownMatch);
    expect(flow3.state.cursor.p1).toBe(0); // fallback to 0
    expect(flow3.state.cursor.p2).toBe(0); // falls back to player's tile (0)
  });

  it('p1 lock leaves p2 cursor where begin placed it when a remembered AI was found', () => {
    const flow = makeFlow();
    const match: Match = { player: 'bray', ai: 'dixie', };
    flow.begin(match);
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('dixie'));
    // lock p1 on a different tile than the remembered player
    flow.hover(flow.tiles.indexOf('ash'));
    flow.lock();
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('p2');
    // p2 cursor stays on the remembered AI's tile, not the locked player's tile
    expect(flow.state.cursor.p2).toBe(flow.tiles.indexOf('dixie'));
  });
});

describe('resume', () => {
  const valid: Match = { player: 'ash', ai: 'bray' };

  it.each([
    ['valid match', valid, 'ready'],
    ['player gone', { player: 'nope', ai: 'bray' } as Match, 'p1'],
    ['ai gone', { player: 'ash', ai: 'nope' } as Match, 'p2'],
    ['ai now offline', { player: 'ash', ai: 'ghost' } as Match, 'p2'],
  ])('%s -> %s', (_label, match, expectedPhase) => {
    const flow = makeFlow();
    flow.resume(match);
    expect(flow.state.phase).toBe(expectedPhase);
  });

  it.each([
    ['a linked direct contact', 'ok', 'ready'],
    ['a direct contact with no key', 'no-link', 'model'],
  ] as const)('%s -> %s', (_label, link, expectedPhase) => {
    const flow = createFlow(
      mixed.map((e) => (e.id === 'cass' ? { ...e, link } : e)),
      { columns: 6 },
    );
    flow.resume({ player: 'hicks', ai: 'cass' });
    expect(flow.state.phase).toBe(expectedPhase);
    expect(flow.state.ai).toBe('cass');
  });

  it('ai now mindless -> p2', () => {
    const flow = makeMixedFlow();
    flow.resume({ player: 'cass', ai: 'hicks' });
    expect(flow.state.phase).toBe('p2');
  });

  it('a remembered match from before (with a model) still resumes', () => {
    const flow = makeMixedFlow();
    flow.resume({ player: 'hicks', ai: 'cass', model: 'm1' });
    expect(flow.state.phase).toBe('ready');
  });

  it('valid resume sets player/ai and cursors', () => {
    const flow = makeFlow();
    flow.resume(valid);
    expect(flow.state.phase).toBe('ready');
    expect(flow.state.player).toBe('ash');
    expect(flow.state.ai).toBe('bray');
    expect(flow.state.cursor.p1).toBe(flow.grids.p1.tiles.indexOf('ash'));
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('bray'));
  });

  it('resume: ai connected but backend "none" -> p2', () => {
    const rosterWithConnectedMindless: RosterEntry[] = [
      ...mixed,
      { id: 'drone', name: 'Drone', connected: true, backend: 'none', link: 'unknown' },
    ];
    const flow = createFlow(rosterWithConnectedMindless, { columns: 6 });
    flow.resume({ player: 'cass', ai: 'drone' });
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.player).toBe('cass');
    expect(flow.state.ai).toBeNull();
  });

  it('resume: ai down lands the p2 cursor on her own tile, not the player\'s', () => {
    const flow = makeMixedFlow();
    flow.resume({ player: 'cass', ai: 'wint' });
    expect(flow.state.phase).toBe('p2');
    expect(flow.idAt('p2')).toBe('wint');
    expect(flow.idAt('p1')).toBe('cass');
  });
});

describe('one roster', () => {
  it('every character on one band, led by +, connected-then-rest by name', () => {
    const flow = makeMixedFlow();
    expect(flow.tiles).toEqual([NEW_PERSON, 'cass', 'dixie', 'nix', 'case', 'hicks', 'wint']);
  });

  it('begin places each cursor on its remembered tile', () => {
    const flow = makeMixedFlow();
    flow.begin({ player: 'cass', ai: 'dixie' });
    expect(flow.idAt('p1')).toBe('cass');
    expect(flow.idAt('p2')).toBe('dixie');

    flow.lock();
    flow.chooseYou(null);
    expect(flow.idAt('p2')).toBe('dixie');
  });

  it('updateLinks changes who can be the AI without moving anything', () => {
    const flow = makeMixedFlow();
    const tilesBefore = flow.tiles;
    const stateBefore = flow.state;
    flow.updateLinks(mixed.map((e) => (e.id === 'wint' ? { ...e, connected: true, link: 'ok' } : e)));
    expect(flow.tiles).toEqual(tilesBefore);
    expect(flow.state).toEqual(stateBefore);

    flow.hover(flow.tiles.indexOf('cass'));
    flow.lock();
    flow.chooseYou(null);
    flow.hover(flow.tiles.indexOf('wint'));
    expect(flow.lock()).toBe('ok');
    expect(flow.state.ai).toBe('wint');
  });
});

describe('canBeAi', () => {
  it('is true only for connected non-mindless entries', () => {
    expect(canBeAi({ id: 'x', name: 'X', connected: true, backend: 'direct', link: 'ok' })).toBe(true);
    expect(canBeAi({ id: 'x', name: 'X', connected: false, backend: 'direct', link: 'unknown' })).toBe(false);
    expect(canBeAi({ id: 'x', name: 'X', connected: true, backend: 'none', link: 'unknown' })).toBe(false);
  });

  it('a broken link never refuses a connected direct contact (her model step says what to fix)', () => {
    for (const link of ['unreachable', 'key-rejected', 'no-link', 'no-credit', 'room-error'] as const) {
      expect(canBeAi({ id: 'x', name: 'X', connected: true, backend: 'direct', link })).toBe(true);
    }
  });
});

describe('grouped by district (spec 2026-10-25)', () => {
  const cast: RosterEntry[] = [
    ...['hicks', 'cass', 'ember', 'nix', 'silas'].map((id) => ({ id, name: id, connected: true, backend: 'direct' as const, link: 'ok' as const, group: 'karasu' })),
    ...['soren', 'rue', 'adebayo'].map((id) => ({ id, name: id, connected: true, backend: 'direct' as const, link: 'ok' as const, group: 'spine' })),
    { id: 'rot', name: 'rot', connected: true, backend: 'direct', link: 'ok', group: 'marsh' },
  ];
  const at = (f: ReturnType<typeof createFlow>) => f.tiles[f.state.cursor.p1];

  it('orders tiles by group, largest first, and lays them out in rows', () => {
    const f = createFlow(cast, { columns: 6 });
    expect(f.tiles).toEqual([NEW_PERSON, 'cass', 'ember', 'hicks', 'nix', 'silas', 'adebayo', 'rue', 'soren', 'rot']);
    expect(f.layout.labels.map((l) => `${l.group}@${l.row}:${l.col}+${l.span}`)).toEqual(['karasu@0:1+5', 'spine@1:0+3', 'marsh@1:3+1']);
  });

  it('↑/↓ go to the nearest column in the next row; ←/→ walk the order', () => {
    const f = createFlow(cast, { columns: 6 });
    f.begin(null);
    for (let i = 0; i < 3; i++) f.move('right'); // + → cass → ember → hicks (c3)
    expect(at(f)).toBe('hicks');
    f.move('down');
    expect(at(f)).toBe('rot'); // row 1, c3
    f.move('down');
    expect(at(f)).toBe('rot'); // no row 2: stays
    f.move('left');
    expect(at(f)).toBe('soren');
    f.move('up');
    expect(at(f)).toBe('ember'); // c2 → c2
  });
});

// Select leads spec §4: a grid per step. a and b are leads (playable), c a plain contact, d found in
// play (discover); e, f and g plain too, so the 2P grid has more tiles than the 1P one.
describe('a grid per step', () => {
  const entry = (id: string, more: Partial<RosterEntry> = {}): RosterEntry => ({ id, name: id.toUpperCase(), connected: true, backend: 'direct', link: 'ok', ...more });
  const cast: RosterEntry[] = [
    entry('a', { playable: true }),
    entry('b', { playable: true }),
    entry('c'),
    entry('d', { discover: true }),
    entry('e'),
    entry('f'),
    entry('g'),
  ];
  const make = () => createFlow(cast, { columns: 6 });
  const toP2 = (flow: ReturnType<typeof make>, player: 'a' | 'b' = 'a') => {
    flow.hover(flow.grids.p1.tiles.indexOf(player));
    flow.lock();
    flow.chooseYou(null);
  };

  it('1P holds + and the playable ones; 2P everyone but the discover one', () => {
    const flow = make();
    expect(flow.grids.p1.tiles).toEqual([NEW_PERSON, 'a', 'b']);
    expect(flow.grids.p2.tiles).toEqual(['a', 'b', 'c', 'e', 'f', 'g']);
  });

  it('the stand-in is on neither grid, with or without playable entries', () => {
    const withStandIn = createFlow([...cast, entry('s', { standIn: true, connected: false, backend: 'none' })], { columns: 6 });
    expect(withStandIn.grids.p1.tiles).not.toContain('s');
    expect(withStandIn.grids.p2.tiles).not.toContain('s');
    const noLeads = createFlow([entry('c'), entry('s', { standIn: true, playable: true })], { columns: 6 });
    expect(noLeads.grids.p1.tiles).not.toContain('s');
    expect(noLeads.grids.p2.tiles).not.toContain('s');
  });

  it('with no playable anywhere, both grids are the whole roster', () => {
    const flow = makeFlow();
    expect(flow.grids.p1.tiles).toEqual(expectedTiles);
    expect(flow.grids.p2.tiles).toEqual(expectedP2);
  });

  it('shown(): 1P through p1 and you, 2P from p2 on; back from p2 shows 1P again', () => {
    const flow = make();
    expect(flow.shown()).toBe('p1');
    flow.hover(1);
    flow.lock();
    expect(flow.state.phase).toBe('you');
    expect(flow.shown()).toBe('p1');
    expect(flow.tiles).toEqual(flow.grids.p1.tiles);
    flow.chooseYou(null);
    expect(flow.shown()).toBe('p2');
    expect(flow.tiles).toEqual(flow.grids.p2.tiles);
    flow.hover(flow.grids.p2.tiles.indexOf('c'));
    flow.lock();
    expect(flow.state.phase).toBe('model');
    expect(flow.shown()).toBe('p2');
    flow.chooseModel();
    expect(flow.shown()).toBe('p2');
    flow.back();
    flow.back();
    expect(flow.state.phase).toBe('p2');
    flow.back();
    expect(flow.state.phase).toBe('you');
    expect(flow.shown()).toBe('p1');
  });

  it('locking a player with no remembered match puts the 2P cursor on her 2P tile', () => {
    const flow = make();
    toP2(flow, 'b');
    expect(flow.state.cursor.p2).toBe(flow.grids.p2.tiles.indexOf('b'));
    expect(flow.idAt('p2')).toBe('b');
  });

  it('hover beyond the shown grid is ignored at 1P and picks the 2P tile at 2P (Review Focus 2)', () => {
    const flow = make();
    flow.hover(5);
    expect(flow.state.cursor.p1).toBe(0);
    toP2(flow);
    flow.hover(5);
    expect(flow.state.cursor.p2).toBe(5);
    expect(flow.idAt('p2')).toBe('g');
  });

  it('moving at 1P wraps within the 1P grid', () => {
    const flow = make();
    flow.move('left');
    expect(flow.state.cursor.p1).toBe(2);
    expect(flow.idAt('p1')).toBe('b');
  });

  it('marks(): the live cursor at 1P; at 2P the locked player on her 2P tile and the 2P cursor', () => {
    const flow = make();
    flow.hover(2);
    expect(flow.marks()).toEqual({ p1: 2, p2: null });
    toP2(flow, 'a');
    flow.hover(4);
    expect(flow.marks()).toEqual({ p1: flow.grids.p2.tiles.indexOf('a'), p2: 4 });
  });

  it('begin: a remembered player not on 1P starts on ?; a remembered contact not on 2P follows the lock', () => {
    const flow = make();
    flow.begin({ player: 'c', ai: 'd' });
    expect(flow.state.cursor.p1).toBe(0);
    toP2(flow, 'b');
    expect(flow.idAt('p2')).toBe('b');
  });

  it('begin: a remembered lead and contact start on their own tiles', () => {
    const flow = make();
    flow.begin({ player: 'b', ai: 'e' });
    expect(flow.idAt('p1')).toBe('b');
    flow.lock();
    flow.chooseYou(null);
    expect(flow.idAt('p2')).toBe('e');
  });

  it('resume an old save played as a non-lead: locked by id, marked on 2P, back to 1P lands on ? (Review Focus 4)', () => {
    const flow = make();
    flow.resume({ player: 'c', ai: 'a' });
    expect(flow.state.phase).toBe('ready');
    expect(flow.state.player).toBe('c');
    expect(flow.marks().p1).toBe(flow.grids.p2.tiles.indexOf('c'));
    flow.back(); // ready → model (direct)
    flow.back(); // model → p2
    flow.back(); // p2 → you
    flow.back(); // you → p1
    expect(flow.state.phase).toBe('p1');
    expect(flow.state.cursor.p1).toBe(0);
    expect(flow.idAt('p1')).toBe(NEW_PERSON);
  });

  it('resume with a contact not on 2P opens on 2P, the player locked, the cursor on her tile', () => {
    const flow = make();
    flow.resume({ player: 'a', ai: 'd' });
    expect(flow.state.phase).toBe('p2');
    expect(flow.state.player).toBe('a');
    expect(flow.idAt('p2')).toBe('a');
  });
});

// Character creator spec 2026-11-14: no RANDOM; 1P leads with + (make someone), then YOURS (made people), then the leads.
describe('your people at 1P', () => {
  const entry = (id: string, more: Partial<RosterEntry> = {}): RosterEntry => ({ id, name: id.toUpperCase(), connected: true, backend: 'direct', link: 'ok', ...more });
  const cast: RosterEntry[] = [entry('a', { playable: true }), entry('b', { playable: true }), entry('c'), entry('s', { standIn: true, backend: 'none', connected: false })];
  const people = [
    { id: 'p-1794679903080-aaaaaa', name: 'Vee' },
    { id: 'p-1794679903079-bbbbbb', name: 'Ash' },
  ];
  const make = (ps = people) => createFlow(cast, { columns: 6, people: ps });
  const VEE = personTile(people[0].id);
  const ASH = personTile(people[1].id);

  it('neither grid has RANDOM; 1P is +, then your people newest first, then the leads; 2P starts with a contact', () => {
    const flow = make();
    expect(flow.grids.p1.tiles).toEqual([NEW_PERSON, VEE, ASH, 'a', 'b']);
    expect(flow.grids.p2.tiles).toEqual(['a', 'b', 'c']);
    expect(flow.grids.p1.layout.labels.map((l) => l.group)).toContain(YOURS);
  });

  it('Enter on + opens the creator (make), shown on 1P; Esc goes back to the grid on +', () => {
    const flow = make();
    flow.hover(0);
    expect(flow.lock()).toBe('ok');
    expect(flow.state.phase).toBe('make');
    expect(flow.shown()).toBe('p1');
    flow.move('right');
    expect(flow.state.cursor.p1).toBe(0);
    flow.back();
    expect(flow.state.phase).toBe('p1');
    expect(flow.idAt('p1')).toBe(NEW_PERSON);
  });

  it('Enter on a person goes straight to 2P with them, no YOU step; Esc there goes back to their tile', () => {
    const flow = make();
    flow.hover(flow.grids.p1.tiles.indexOf(ASH));
    flow.lock();
    expect(flow.state).toMatchObject({ phase: 'p2', person: people[1].id, player: null, persona: null });
    expect(flow.shown()).toBe('p2');
    flow.back();
    expect(flow.state).toMatchObject({ phase: 'p1', person: null });
    expect(flow.idAt('p1')).toBe(ASH);
  });

  it('a person kept in the creator joins the grid and goes on to 2P with them', () => {
    const flow = make([]);
    flow.hover(0);
    flow.lock();
    const kept = { id: 'p-1794679903090-cccccc', name: 'Kit' };
    flow.setPeople([kept]);
    flow.chooseMade(kept.id);
    expect(flow.state).toMatchObject({ phase: 'p2', person: kept.id });
    expect(flow.grids.p1.tiles).toEqual([NEW_PERSON, personTile(kept.id), 'a', 'b']);
    flow.back();
    expect(flow.idAt('p1')).toBe(personTile(kept.id));
  });

  it('a person deleted from the grid keeps the cursor on a tile that is there', () => {
    const flow = make();
    flow.hover(flow.grids.p1.tiles.indexOf(ASH));
    flow.setPeople([people[0]]);
    expect(flow.grids.p1.tiles).toEqual([NEW_PERSON, VEE, 'a', 'b']);
    expect(flow.state.cursor.p1).toBeLessThan(flow.grids.p1.tiles.length);
  });

  it('a remembered person starts the cursor on them; one since deleted starts it on +; a lead on the lead', () => {
    const flow = make();
    flow.begin({ player: ASH, ai: 'c' });
    expect(flow.idAt('p1')).toBe(ASH);
    flow.begin({ player: personTile('p-1794679903000-dddddd'), ai: 'c' });
    expect(flow.idAt('p1')).toBe(NEW_PERSON);
    flow.begin({ player: 'b', ai: 'c' });
    expect(flow.idAt('p1')).toBe('b');
    expect(flow.idAt('p2')).toBe('c');
  });

  it('EDIT on a person (openMake) opens the creator from their tile; Esc goes back to it', () => {
    const flow = make();
    flow.hover(flow.grids.p1.tiles.indexOf(ASH));
    flow.openMake();
    expect(flow.state.phase).toBe('make');
    flow.back();
    expect(flow.state.phase).toBe('p1');
    expect(flow.idAt('p1')).toBe(ASH);
  });

  it('a lead still goes through YOU', () => {
    const flow = make();
    flow.hover(flow.grids.p1.tiles.indexOf('a'));
    flow.lock();
    expect(flow.state).toMatchObject({ phase: 'you', player: 'a', person: null });
  });

  it('resume on a made person\'s save (the stand-in) starts over at 1P', () => {
    const flow = make();
    flow.resume({ player: 's', ai: 'c' });
    expect(flow.state).toMatchObject({ phase: 'p1', player: null, person: null });
  });
});
