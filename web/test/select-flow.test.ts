import { describe, expect, it } from 'vitest';
import { createFlow, canBeAi, RANDOM, type RosterEntry } from '../src/landing/select-flow';
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

// Expected tile order: RANDOM, then connected sorted by name: Ash, Bray, Dixie, Echo, Nix
// then the rest sorted by name: Ghost, Hicks
const expectedTiles = [RANDOM, 'ash', 'bray', 'dixie', 'echo', 'nix', 'ghost', 'hicks'];

function makeFlow(rng?: () => number) {
  return createFlow(roster, { columns: 6, rng });
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
// tiles: [RANDOM, 'cass', 'dixie', 'nix', 'case', 'hicks', 'wint']

function makeMixedFlow(rng?: () => number) {
  return createFlow(mixed, { columns: 6, rng });
}

describe('tile order', () => {
  it('orders tiles RANDOM, connected by name, then the rest by name', () => {
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
    expect(flow.state.cursor.p2).toBe(ghostIdx);

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
    expect(flow2.state.cursor.p2).toBe(hicksIdx);
  });

  it('p1 lock on RANDOM resolves with rng and moves the cursor to the resolved tile', () => {
    // rng always returns a value that picks the 3rd candidate (index 2) among all 7 non-random tiles
    const candidates = expectedTiles.slice(1); // all 7 non-random tiles are candidates for p1
    const targetIdx = 2;
    const rng = () => targetIdx / candidates.length;
    const flow = makeFlow(rng);
    flow.begin(null);
    flow.hover(0); // RANDOM tile
    const result = flow.lock();
    flow.chooseYou(null);
    expect(result).toBe('ok');
    const resolvedId = candidates[targetIdx];
    const resolvedTileIdx = flow.tiles.indexOf(resolvedId);
    expect(flow.state.player).toBe(resolvedId);
    expect(flow.state.cursor.p1).toBe(resolvedTileIdx);
    expect(flow.state.phase).toBe('p2');
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

  it('RANDOM on 1P resolves, then you', () => {
    const flow = makeFlow(() => 0);
    flow.begin(null);
    flow.hover(0);
    flow.lock();
    expect(flow.state.phase).toBe('you');
    expect(flow.state.player).toBe('ash');
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
    expect(flow.state.cursor.p2).toBe(nixIdx);
  });

  it('chooseYou(null) plays as them', () => {
    const flow = makeFlow();
    flow.begin(null);
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
  it('p2 lock refuses offline and mindless; RANDOM never resolves to them (rng sweep 0..0.99)', () => {
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

    // RANDOM sweep across the rng range never resolves to ghost or hicks
    for (let i = 0; i < 100; i++) {
      const rngVal = i / 100;
      const sweepFlow = makeFlow(() => rngVal);
      sweepFlow.begin(null);
      sweepFlow.hover(sweepFlow.tiles.indexOf('ash'));
      sweepFlow.lock();
      sweepFlow.chooseYou(null);
      sweepFlow.hover(0); // RANDOM
      const result = sweepFlow.lock();
      sweepFlow.chooseYou(null);
      expect(result).toBe('ok');
      expect(sweepFlow.state.ai).not.toBe('ghost');
      expect(sweepFlow.state.ai).not.toBe('hicks');
    }
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

  it('p2 RANDOM with no connected characters -> refused', () => {
    const noConnected: RosterEntry[] = [
      { id: 'a', name: 'A', connected: false, backend: 'direct', link: 'unknown' },
      { id: 'b', name: 'B', connected: false, backend: 'direct', link: 'unknown' },
    ];
    const flow = createFlow(noConnected, { columns: 6 });
    flow.begin(null);
    flow.hover(flow.tiles.indexOf('a'));
    flow.lock(); // p1 locked -> p2
    flow.chooseYou(null);
    expect(flow.state.phase).toBe('p2');
    flow.hover(0); // RANDOM
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
    expect(flow.state.cursor.p2).toBe(flow.tiles.indexOf('dixie'));

    const flow2 = makeFlow();
    flow2.begin(null);
    expect(flow2.state.cursor.p1).toBe(0);
    expect(flow2.state.cursor.p2).toBe(0); // player's tile (index 0, RANDOM) since no remembered ai

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
    expect(flow.state.cursor.p2).toBe(flow.tiles.indexOf('dixie'));
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
    expect(flow.state.cursor.p1).toBe(flow.tiles.indexOf('ash'));
    expect(flow.state.cursor.p2).toBe(flow.tiles.indexOf('bray'));
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
  it('every character on one band, led by RANDOM, connected-then-rest by name', () => {
    const flow = makeMixedFlow();
    expect(flow.tiles).toEqual([RANDOM, 'cass', 'dixie', 'nix', 'case', 'hicks', 'wint']);
  });

  it('RANDOM for the CPU picks only who can be the AI', () => {
    const flow = createFlow(mixed, { columns: 6, rng: () => 0.99 });
    flow.hover(0); // RANDOM for 1P: anyone, the mindless and the offline too
    const result = flow.lock();
    flow.chooseYou(null);
    expect(result).toBe('ok');
    expect(flow.state.player).toBe('wint');

    for (let i = 0; i < 100; i++) {
      const rngVal = i / 100;
      const sweepFlow = createFlow(mixed, { columns: 6, rng: () => rngVal });
      sweepFlow.hover(sweepFlow.tiles.indexOf('cass'));
      sweepFlow.lock();
      sweepFlow.chooseYou(null);
      sweepFlow.hover(0); // RANDOM
      const result2 = sweepFlow.lock();
      expect(result2).toBe('ok');
      expect(['cass', 'dixie', 'nix']).toContain(sweepFlow.state.ai);
    }
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
    expect(f.tiles).toEqual([RANDOM, 'cass', 'ember', 'hicks', 'nix', 'silas', 'adebayo', 'rue', 'soren', 'rot']);
    expect(f.layout.labels.map((l) => `${l.group}@${l.row}:${l.col}+${l.span}`)).toEqual(['karasu@0:1+5', 'spine@1:0+3', 'marsh@1:3+1']);
  });

  it('↑/↓ go to the nearest column in the next row; ←/→ walk the order', () => {
    const f = createFlow(cast, { columns: 6 });
    f.begin(null);
    for (let i = 0; i < 3; i++) f.move('right'); // RANDOM → cass → ember → hicks (c3)
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
