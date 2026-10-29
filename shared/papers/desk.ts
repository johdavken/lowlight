/**
 * Papers' desk (spec §2.6–§2.7): the packet you're building, booth nine's mark, your notes on
 * the bulletin, and UNDO. Pure: every action returns a new desk, and an edit that would take
 * RISK past the cap comes back refused with the desk as it was.
 */
import type { PapersBoard } from './generate';
import { checkPacket, cost, outcome, photoOk, type Check, type Extra, type Field, type Identity } from './rules';

export type Note = '' | 'ok' | 'unsure';
export interface Desk {
  board: PapersBoard;
  packet: Identity;
  overlooked: number | null;
  notes: Note[];
  history: { packet: Identity; overlooked: number | null }[];
}
export type DeskAction =
  | { k: 'set'; f: Field; v: string }
  | { k: 'extra'; x: Extra; on: boolean }
  /** Toggles: the same rule clears him, another moves him (free). */
  | { k: 'overlook'; i: number }
  /** Cycles '' → 'ok' → 'unsure' → ''. */
  | { k: 'note'; i: number }
  | { k: 'undo' }
  | { k: 'reset' };

const NEXT_NOTE: Record<Note, Note> = { '': 'ok', ok: 'unsure', unsure: '' };

export function startDesk(board: PapersBoard): Desk {
  return { board, packet: { ...board.truth }, overlooked: null, notes: board.rules.map(() => ''), history: [] };
}

export const risk = (d: Desk): number => cost(d.packet, d.board.truth) + (d.overlooked !== null ? d.board.booth : 0);

export function act(d: Desk, a: DeskAction): { desk: Desk; refused: boolean } {
  const same = { desk: d, refused: false };
  switch (a.k) {
    case 'note': {
      if (a.i < 0 || a.i >= d.notes.length) return same;
      const notes = d.notes.slice();
      notes[a.i] = NEXT_NOTE[notes[a.i]];
      return { desk: { ...d, notes }, refused: false };
    }
    case 'undo': {
      const last = d.history.at(-1);
      return last ? { desk: { ...d, ...last, history: d.history.slice(0, -1) }, refused: false } : same;
    }
    case 'reset':
      return { desk: startDesk(d.board), refused: false };
    default: {
      let packet = d.packet;
      let overlooked = d.overlooked;
      if (a.k === 'set') packet = { ...packet, [a.f]: a.v };
      else if (a.k === 'extra') packet = { ...packet, [a.x]: a.on };
      else if (a.i >= 0 && a.i < d.board.rules.length) overlooked = overlooked === a.i ? null : a.i;
      // Picking the value a field already has isn't an edit: nothing to undo.
      if (JSON.stringify(packet) === JSON.stringify(d.packet) && overlooked === d.overlooked) return same;
      const next: Desk = { ...d, packet, overlooked, history: [...d.history, { packet: d.packet, overlooked: d.overlooked }] };
      return risk(next) > d.board.cap ? { desk: d, refused: true } : { desk: next, refused: false };
    }
  }
}

/** Easy only: the age on the card is one the photo can't pass for. */
export const photoWarning = (d: Desk): boolean => d.board.tier === 'easy' && !photoOk(d.packet, d.board.face.looks);

export function handOver(d: Desk): { checks: Check[]; result: 'clean' | 'close' | 'back'; risk: number } {
  const checks = checkPacket(d.packet, d.board.rules.map((r) => r.rule), d.board.face.looks, d.overlooked);
  const r = risk(d);
  return { checks, result: outcome(checks, r, d.board.clean), risk: r };
}
