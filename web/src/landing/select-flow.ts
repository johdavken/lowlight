/** The character-select flow: pure state machine, no DOM. See spec §3, §4, §12. */

import type { Match } from '../room/identity';
import type { LinkState } from '../../../shared/types';
import type { PlaythroughPersona } from '../../../shared/persona';
import { layoutTiles, orderTiles, RANDOM, stepVertical, type Layout } from './district-groups';

export type Phase = 'p1' | 'you' | 'p2' | 'model' | 'ready';

export { RANDOM };

export interface RosterEntry {
  id: string;
  name: string;
  connected: boolean;
  backend: 'direct' | 'none';
  link: LinkState;
  /** Her select-screen group (a district); absent or null: none. */
  group?: string | null;
}

export interface FlowState {
  phase: Phase;
  cursor: { p1: number; p2: number }; // tile indexes
  player: string | null; // locked ids (never RANDOM)
  ai: string | null;
  /** Who you are on the locked player (the YOU step); null: play as them. */
  persona: PlaythroughPersona | null;
}

export type LockResult = 'ok' | 'refused' | 'noop' | 'dial';

export interface Flow {
  /** The roster's tiles, `?` first. */
  readonly tiles: string[];
  /** Where each tile sits, and the group labels (district-groups). */
  readonly layout: Layout;
  readonly state: FlowState;
  begin(remembered: Match | null): void;
  /** Back from a room: a direct contact with no key linked opens on the model step (the link panel). */
  resume(match: Match): void;
  move(dir: 'left' | 'right' | 'up' | 'down'): void;
  hover(index: number): void;
  lock(): LockResult;
  back(): void;
  /** The model step's panel picked her model: on to READY. */
  chooseModel(): void;
  /** The YOU step's choice (null: play as them): on to the AI pick. Only in `you`. */
  chooseYou(persona: PlaythroughPersona | null): void;
  /** The tile id under the given cursor. */
  idAt(which: 'p1' | 'p2'): string;
  /** Refreshes connected/link for known ids from a fresh fetch. Never reorders tiles or moves cursors/locks. */
  updateLinks(entries: RosterEntry[]): void;
}

export const canBeAi = (e: RosterEntry): boolean => e.connected && e.backend !== 'none';

function buildTiles(entries: RosterEntry[]): string[] {
  return orderTiles(entries.map((e) => ({ id: e.id, name: e.name, connected: e.connected === true, group: e.group ?? null })));
}

export function createFlow(entries: RosterEntry[], opts: { columns: number; rng?: () => number }): Flow {
  const columns = opts.columns;
  const rng = opts.rng ?? Math.random;
  let byId = new Map(entries.map((e) => [e.id, e]));

  const tiles = buildTiles(entries);
  const groupById = new Map(entries.map((e) => [e.id, e.group ?? null]));
  /** Where each tile sits (district-groups): ↑/↓ follow it, and the grid draws it. */
  const layout: Layout = layoutTiles(tiles, (id) => groupById.get(id) ?? null, columns);

  let state: FlowState = {
    phase: 'p1',
    cursor: { p1: 0, p2: 0 },
    player: null,
    ai: null,
    persona: null,
  };
  // Whether the p2 cursor should jump to wherever p1 locks (true when begin()
  // found no remembered AI, so p2 defaulted to the player's tile).
  let p2FollowsPlayerLock = true;

  /** An id's tile index (null: not on the roster). */
  function tileIndexOf(id: string): number | null {
    const idx = tiles.indexOf(id);
    return idx >= 0 ? idx : null;
  }

  function resolveRandom(candidateIds: string[]): string | null {
    if (candidateIds.length === 0) return null;
    const i = Math.floor(rng() * candidateIds.length);
    return candidateIds[Math.min(i, candidateIds.length - 1)];
  }

  function liveCursorKey(): 'p1' | 'p2' | null {
    if (state.phase === 'p1') return 'p1';
    if (state.phase === 'p2') return 'p2';
    return null;
  }

  function moveCursor(key: 'p1' | 'p2', dir: 'left' | 'right' | 'up' | 'down'): void {
    const t = tiles;
    const current = state.cursor[key];
    if (dir === 'left' || dir === 'right') {
      const delta = dir === 'left' ? -1 : 1;
      const next = (current + delta + t.length) % t.length;
      state = { ...state, cursor: { ...state.cursor, [key]: next } };
    } else {
      const next = stepVertical(layout, current, dir);
      if (next !== current) state = { ...state, cursor: { ...state.cursor, [key]: next } };
    }
  }

  function placeBegin(remembered: Match | null): void {
    const p1 = (remembered ? tileIndexOf(remembered.player) : null) ?? 0;
    const aiLoc = remembered ? tileIndexOf(remembered.ai) : null;
    const p2 = aiLoc ?? p1;
    p2FollowsPlayerLock = aiLoc === null;
    state = {
      phase: 'p1',
      cursor: { p1, p2 },
      player: null,
      ai: null,
      persona: null,
    };
  }

  function lockP1(): LockResult {
    const idx = state.cursor.p1;
    const tileId = tiles[idx];
    let resolvedId: string;
    let resolvedIdx: number;
    if (tileId === RANDOM) {
      const candidates = tiles.filter((t) => t !== RANDOM);
      const picked = resolveRandom(candidates);
      if (picked === null) return 'refused';
      resolvedId = picked;
      resolvedIdx = tiles.indexOf(picked);
    } else {
      resolvedId = tileId;
      resolvedIdx = idx;
    }
    // p2's cursor moves to the locked player's tile only when begin() found
    // no remembered AI (see p2FollowsPlayerLock); otherwise it stays where the remembered AI
    // placed it.
    const p2 = p2FollowsPlayerLock ? resolvedIdx : state.cursor.p2;
    state = {
      ...state,
      phase: 'you',
      player: resolvedId,
      persona: null,
      cursor: { p1: resolvedIdx, p2 },
    };
    return 'ok';
  }

  function afterAiLocked(aiId: string): void {
    const entry = byId.get(aiId)!;
    if (entry.backend === 'direct') {
      state = { ...state, phase: 'model' };
    } else {
      state = { ...state, phase: 'ready' };
    }
  }

  function lockP2(): LockResult {
    const idx = state.cursor.p2;
    const tileId = tiles[idx];
    let resolvedId: string;
    let resolvedIdx: number;
    if (tileId === RANDOM) {
      const candidates = tiles.filter((t) => t !== RANDOM && canBeAi(byId.get(t)!));
      const picked = resolveRandom(candidates);
      if (picked === null) return 'refused';
      resolvedId = picked;
      resolvedIdx = tiles.indexOf(picked);
    } else {
      const entry = byId.get(tileId);
      if (!entry || !canBeAi(entry)) return 'refused';
      resolvedId = tileId;
      resolvedIdx = idx;
    }
    state = {
      ...state,
      ai: resolvedId,
      cursor: { ...state.cursor, p2: resolvedIdx },
    };
    afterAiLocked(resolvedId);
    return 'ok';
  }

  function chooseModel(): void {
    if (state.phase === 'model') state = { ...state, phase: 'ready' };
  }

  function chooseYou(persona: PlaythroughPersona | null): void {
    if (state.phase !== 'you') return;
    state = { ...state, phase: 'p2', persona };
  }

  function begin(remembered: Match | null): void {
    placeBegin(remembered);
  }

  function resume(match: Match): void {
    const playerEntry = byId.get(match.player);
    if (!playerEntry) {
      placeBegin(null);
      return;
    }
    const playerLoc = tileIndexOf(match.player)!;
    const aiEntry = byId.get(match.ai);
    if (!aiEntry || !canBeAi(aiEntry)) {
      // p2 with the player locked. When the AI id still exists (just down), put the p2
      // cursor on her own tile, so the band shows her dimmed. Only fall back to the
      // player's tile when the AI id is gone entirely.
      const aiLoc = aiEntry ? tileIndexOf(match.ai) : null;
      state = {
        phase: 'p2',
        cursor: { p1: playerLoc, p2: aiLoc ?? playerLoc },
        player: match.player,
        ai: null,
        persona: null,
      };
      return;
    }
    const aiLoc = tileIndexOf(match.ai)!;
    const cursor = { p1: playerLoc, p2: aiLoc };
    // Her model is a setting the server keeps: a linked direct contact is ready as she is.
    const phase: Phase = aiEntry.backend === 'direct' && aiEntry.link === 'no-link' ? 'model' : 'ready';
    state = { phase, cursor, player: match.player, ai: match.ai, persona: null };
  }

  function move(dir: 'left' | 'right' | 'up' | 'down'): void {
    // The YOU and model steps' panels read their own keys.
    if (state.phase === 'you' || state.phase === 'model' || state.phase === 'ready') return;
    const key = liveCursorKey();
    if (!key) return;
    moveCursor(key, dir);
  }

  function hover(index: number): void {
    if (state.phase === 'you' || state.phase === 'model' || state.phase === 'ready') return;
    const key = liveCursorKey();
    if (!key) return;
    if (index < 0 || index >= tiles.length) return;
    state = { ...state, cursor: { ...state.cursor, [key]: index } };
  }

  function lock(): LockResult {
    if (state.phase === 'p1') return lockP1();
    if (state.phase === 'p2') return lockP2();
    if (state.phase === 'you' || state.phase === 'model') return 'noop';
    return 'dial';
  }

  function back(): void {
    if (state.phase === 'you') {
      state = { ...state, phase: 'p1', player: null, persona: null };
    } else if (state.phase === 'p2') {
      state = { ...state, phase: 'you', ai: null };
    } else if (state.phase === 'model') {
      state = { ...state, phase: 'p2', ai: null };
    } else if (state.phase === 'ready') {
      const aiEntry = state.ai ? byId.get(state.ai) : undefined;
      if (aiEntry && aiEntry.backend === 'direct') {
        state = { ...state, phase: 'model' };
      } else {
        state = { ...state, phase: 'p2', ai: null };
      }
    }
    // p1: nothing
  }

  function idAt(which: 'p1' | 'p2'): string {
    return tiles[state.cursor[which]];
  }

  function updateLinks(newEntries: RosterEntry[]): void {
    const updated = new Map(byId);
    for (const e of newEntries) {
      const existing = updated.get(e.id);
      if (!existing) continue;
      updated.set(e.id, { ...existing, connected: e.connected, link: e.link });
    }
    byId = updated;
  }

  return {
    tiles,
    layout,
    get state() {
      return state;
    },
    begin,
    resume,
    move,
    hover,
    lock,
    back,
    chooseModel,
    chooseYou,
    idAt,
    updateLinks,
  };
}
