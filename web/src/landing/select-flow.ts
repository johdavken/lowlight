/** The character-select flow: pure state machine, no DOM. See spec §3, §4, §12. */

import type { Match } from '../room/identity';
import type { LinkState } from '../../../shared/types';
import type { PlaythroughPersona } from '../../../shared/persona';
import { layoutTiles, NEW_PERSON, orderTiles, personOf, personTile, stepVertical, YOURS, type Layout } from './district-groups';

/** `make`: the creator is open over 1P (character creator spec 2026-11-14). */
export type Phase = 'p1' | 'you' | 'make' | 'p2' | 'model' | 'ready';

/** A select step's grid: 1P (who you play) or 2P (your contact). */
export type Step = 'p1' | 'p2';

/** One step's tiles (1P: + first) and where each sits (district-groups). */
export interface Grid {
  tiles: string[];
  layout: Layout;
}

export { NEW_PERSON, personOf, personTile, YOURS };

/** A made person as the 1P grid lists them (newest first). */
export interface PersonEntry {
  id: string;
  name: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  connected: boolean;
  backend: 'direct' | 'none';
  link: LinkState;
  /** Her select-screen group (a district); absent or null: none. */
  group?: string | null;
  /** On the 1P grid (select leads spec §1); when no entry has it, everyone is. */
  playable?: boolean;
  /** Found in play: never on the 2P grid (select leads spec §1). */
  discover?: boolean;
  /** The made person's stand-in (character creator spec 2026-11-14): on neither grid. */
  standIn?: boolean;
}

export interface FlowState {
  phase: Phase;
  cursor: { p1: number; p2: number }; // tile indexes
  player: string | null; // a locked lead's id (null for a made person)
  ai: string | null;
  /** Who you are on the locked player (the YOU step); null: play as them. */
  persona: PlaythroughPersona | null;
  /** The made person locked at 1P (their library id); null for a lead. */
  person: string | null;
}

export type LockResult = 'ok' | 'refused' | 'noop' | 'dial';

export interface Flow {
  /** Each step's grid from the one roster (select leads spec §4): `cursor.p1` indexes the 1P grid, `cursor.p2` the 2P one. */
  readonly grids: Readonly<Record<Step, Grid>>;
  /** The grid that's up: 1P in `p1`, `you` and `make`, 2P in `p2`, `model` and `ready`. */
  shown(): Step;
  /** The shown grid's tiles. */
  readonly tiles: string[];
  /** Where each of the shown grid's tiles sits, and the group labels (district-groups). */
  readonly layout: Layout;
  /** Where each cursor sits on the shown grid: at 1P only the live one; at 2P the locked player's tile there (null: not on it) and the 2P cursor. */
  marks(): { p1: number | null; p2: number | null };
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
  /** The creator kept someone (already in setPeople): on to the AI pick with them. Only in `make`. */
  chooseMade(personId: string): void;
  /** Your people changed (made, kept, deleted): the 1P grid again, the cursor on the same tile if it's still there. */
  setPeople(people: PersonEntry[]): void;
  /** EDIT on a made person: the creator opens from their tile (Esc goes back to it). Only in `p1`. */
  openMake(): void;
  /** The tile id under the given cursor. */
  idAt(which: 'p1' | 'p2'): string;
  /** Refreshes connected/link for known ids from a fresh fetch. Never reorders tiles or moves cursors/locks. */
  updateLinks(entries: RosterEntry[]): void;
}

export const canBeAi = (e: RosterEntry): boolean => e.connected && e.backend !== 'none';

function buildTiles(entries: RosterEntry[]): string[] {
  return orderTiles(entries.map((e) => ({ id: e.id, name: e.name, connected: e.connected === true, group: e.group ?? null })));
}

/**
 * A step's grid (select leads spec §4): 1P + and your people, then the playable entries (all of them when none is);
 * 2P all but the discover ones. The stand-in is on neither.
 */
function gridFor(entries: RosterEntry[], step: Step, columns: number, people: PersonEntry[]): Grid {
  const listed = entries.filter((e) => e.standIn !== true);
  const anyPlayable = listed.some((e) => e.playable === true);
  const on = listed.filter((e) => (step === 'p1' ? !anyPlayable || e.playable === true : e.discover !== true));
  const yours = step === 'p1' ? people.map((p) => personTile(p.id)) : [];
  const tiles = [...(step === 'p1' ? [NEW_PERSON] : []), ...yours, ...buildTiles(on)];
  const groupById = new Map<string, string | null>([...on.map((e) => [e.id, e.group ?? null] as const), ...yours.map((t) => [t, YOURS] as const)]);
  return { tiles, layout: layoutTiles(tiles, (id) => groupById.get(id) ?? null, columns) };
}

export function createFlow(entries: RosterEntry[], opts: { columns: number; people?: PersonEntry[] }): Flow {
  const columns = opts.columns;
  let byId = new Map(entries.map((e) => [e.id, e]));

  /** Each step's grid (district-groups): ↑/↓ follow its layout, and the grid draws the shown one. */
  const grids: Record<Step, Grid> = { p1: gridFor(entries, 'p1', columns, opts.people ?? []), p2: gridFor(entries, 'p2', columns, []) };

  let state: FlowState = {
    phase: 'p1',
    cursor: { p1: 0, p2: 0 },
    player: null,
    ai: null,
    persona: null,
    person: null,
  };
  // Whether the p2 cursor should jump to wherever p1 locks (true when begin()
  // found no remembered AI, so p2 defaulted to the player's tile).
  let p2FollowsPlayerLock = true;

  /** An id's tile index on `step`'s grid (null: not on it). */
  function indexIn(step: Step, id: string | null | undefined): number | null {
    if (!id) return null;
    const idx = grids[step].tiles.indexOf(id);
    return idx >= 0 ? idx : null;
  }

  function shown(): Step {
    return state.phase === 'p1' || state.phase === 'you' || state.phase === 'make' ? 'p1' : 'p2';
  }

  function liveCursorKey(): 'p1' | 'p2' | null {
    if (state.phase === 'p1') return 'p1';
    if (state.phase === 'p2') return 'p2';
    return null;
  }

  function moveCursor(key: 'p1' | 'p2', dir: 'left' | 'right' | 'up' | 'down'): void {
    const t = grids[key].tiles;
    const current = state.cursor[key];
    if (dir === 'left' || dir === 'right') {
      const delta = dir === 'left' ? -1 : 1;
      const next = (current + delta + t.length) % t.length;
      state = { ...state, cursor: { ...state.cursor, [key]: next } };
    } else {
      const next = stepVertical(grids[key].layout, current, dir);
      if (next !== current) state = { ...state, cursor: { ...state.cursor, [key]: next } };
    }
  }

  function placeBegin(remembered: Match | null): void {
    const p1 = indexIn('p1', remembered?.player) ?? 0;
    const aiLoc = indexIn('p2', remembered?.ai);
    const p2 = aiLoc ?? indexIn('p2', remembered?.player) ?? 0;
    p2FollowsPlayerLock = aiLoc === null;
    state = {
      phase: 'p1',
      cursor: { p1, p2 },
      player: null,
      ai: null,
      persona: null,
      person: null,
    };
  }

  function lockP1(): LockResult {
    const idx = state.cursor.p1;
    const tileId = grids.p1.tiles[idx];
    if (tileId === undefined) return 'refused';
    // + opens the creator; a made person goes straight to 2P (who they are is settled).
    if (tileId === NEW_PERSON) {
      state = { ...state, phase: 'make', player: null, persona: null, person: null };
      return 'ok';
    }
    const person = personOf(tileId);
    if (person !== null) {
      state = { ...state, phase: 'p2', player: null, persona: null, person };
      return 'ok';
    }
    // p2's cursor moves to the locked player's tile only when begin() found
    // no remembered AI (see p2FollowsPlayerLock); otherwise it stays where the remembered AI
    // placed it.
    const p2 = p2FollowsPlayerLock ? (indexIn('p2', tileId) ?? 0) : state.cursor.p2;
    state = {
      ...state,
      phase: 'you',
      player: tileId,
      persona: null,
      person: null,
      cursor: { p1: idx, p2 },
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
    const tileId = grids.p2.tiles[idx];
    const entry = tileId === undefined ? undefined : byId.get(tileId);
    if (!entry || !canBeAi(entry)) return 'refused';
    state = { ...state, ai: entry.id };
    afterAiLocked(entry.id);
    return 'ok';
  }

  function chooseModel(): void {
    if (state.phase === 'model') state = { ...state, phase: 'ready' };
  }

  function chooseYou(persona: PlaythroughPersona | null): void {
    if (state.phase !== 'you') return;
    state = { ...state, phase: 'p2', persona };
  }

  function chooseMade(personId: string): void {
    if (state.phase !== 'make') return;
    const at = indexIn('p1', personTile(personId));
    if (at === null) return;
    state = { ...state, phase: 'p2', person: personId, cursor: { ...state.cursor, p1: at } };
  }

  function openMake(): void {
    if (state.phase === 'p1') state = { ...state, phase: 'make', player: null, persona: null, person: null };
  }

  function setPeople(people: PersonEntry[]): void {
    const was = grids.p1.tiles[state.cursor.p1];
    grids.p1 = gridFor(entries, 'p1', columns, people);
    const at = was === undefined ? null : indexIn('p1', was);
    state = { ...state, cursor: { ...state.cursor, p1: at ?? Math.min(state.cursor.p1, grids.p1.tiles.length - 1) } };
  }

  function begin(remembered: Match | null): void {
    placeBegin(remembered);
  }

  function resume(match: Match): void {
    const playerEntry = byId.get(match.player);
    // A made person's save plays on the stand-in, which isn't on the grid to lock: start over.
    if (!playerEntry || playerEntry.standIn === true) {
      placeBegin(null);
      return;
    }
    // The player is locked by id: an old save's player needn't be on the 1P grid (BACK to it lands on `?`).
    const playerLoc = indexIn('p1', match.player) ?? 0;
    const aiEntry = byId.get(match.ai);
    const aiOnGrid = indexIn('p2', match.ai);
    if (!aiEntry || !canBeAi(aiEntry) || aiOnGrid === null) {
      // p2 with the player locked. When the AI is on the 2P grid (just down), put the p2
      // cursor on her own tile, so the band shows her dimmed. Otherwise (gone, or found in
      // play) fall back to the player's tile there.
      state = {
        phase: 'p2',
        cursor: { p1: playerLoc, p2: aiOnGrid ?? indexIn('p2', match.player) ?? 0 },
        player: match.player,
        ai: null,
        persona: null,
        person: null,
      };
      return;
    }
    const cursor = { p1: playerLoc, p2: aiOnGrid };
    // Her model is a setting the server keeps: a linked direct contact is ready as she is.
    const phase: Phase = aiEntry.backend === 'direct' && aiEntry.link === 'no-link' ? 'model' : 'ready';
    state = { phase, cursor, player: match.player, ai: match.ai, persona: null, person: null };
  }

  function move(dir: 'left' | 'right' | 'up' | 'down'): void {
    // The YOU, creator and model steps' panels read their own keys.
    if (state.phase === 'you' || state.phase === 'make' || state.phase === 'model' || state.phase === 'ready') return;
    const key = liveCursorKey();
    if (!key) return;
    moveCursor(key, dir);
  }

  function hover(index: number): void {
    if (state.phase === 'you' || state.phase === 'make' || state.phase === 'model' || state.phase === 'ready') return;
    const key = liveCursorKey();
    if (!key) return;
    if (index < 0 || index >= grids[key].tiles.length) return;
    state = { ...state, cursor: { ...state.cursor, [key]: index } };
  }

  function lock(): LockResult {
    if (state.phase === 'p1') return lockP1();
    if (state.phase === 'p2') return lockP2();
    if (state.phase === 'you' || state.phase === 'make' || state.phase === 'model') return 'noop';
    return 'dial';
  }

  function back(): void {
    if (state.phase === 'you' || state.phase === 'make') {
      state = { ...state, phase: 'p1', player: null, persona: null, person: null };
    } else if (state.phase === 'p2' && state.person !== null) {
      // A made person had no YOU step: back to their tile.
      state = { ...state, phase: 'p1', ai: null, person: null };
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

  function idAt(which: Step): string {
    return grids[which].tiles[state.cursor[which]];
  }

  function marks(): { p1: number | null; p2: number | null } {
    if (shown() === 'p1') return { p1: state.cursor.p1, p2: null };
    return { p1: indexIn('p2', state.player), p2: state.cursor.p2 };
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
    grids,
    shown,
    get tiles() {
      return grids[shown()].tiles;
    },
    get layout() {
      return grids[shown()].layout;
    },
    marks,
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
    chooseMade,
    setPeople,
    openMake,
    idAt,
    updateLinks,
  };
}
