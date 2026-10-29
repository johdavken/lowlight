/**
 * The crack terminal's looks (deck skins spec §1): one per deck, plus ICE for a corporate terminal. A skin
 * is words and a few extra pieces; the dump, the moves and the cues are the same in all of them.
 */
import type { TerminalSetup, TerminalSkin } from '../../../../shared/crack';

/** Extra bits of a skin's window: a maker's plate, a row of keys, the deck's name, signal bars, a stencilled
 *  header, a manifest tag, one scrolling column, ICE's alarm segments and linked line, the holo's corners. */
export type Piece = 'plate' | 'keys' | 'name' | 'signal' | 'stencil' | 'manifest' | 'column' | 'alarm' | 'linked' | 'corners';

export interface Skin {
  /** The tries row's label. */
  tries: string;
  /** A wrong word's log line: `k` letters right of `of`. */
  likeness(k: number, of: number): string;
  dud: string;
  reset: string;
  nothing: string;
  leave: string;
  pieces: Piece[];
  /** Text for the pieces that carry some. */
  text?: Partial<Record<Piece, string>>;
}

const meridian: Skin = {
  tries: 'ATTEMPTS',
  likeness: (k, of) => `Denied · ${k}/${of}`,
  dud: 'Entry removed',
  reset: 'Attempts restored',
  nothing: 'No effect',
  leave: 'END SESSION',
  pieces: ['signal'],
  text: { signal: 'UPLINK OK' },
};

export const SKINS: Record<TerminalSkin, Skin> = {
  green: { tries: 'TRIES', likeness: (k, of) => `LIKENESS ${k}/${of}`, dud: 'DUD REMOVED', reset: 'TRIES RESET', nothing: 'NOTHING', leave: 'LEAVE', pieces: [] },
  amber: {
    tries: 'ATTEMPTS REMAINING',
    likeness: (k) => `ENTRY DENIED · LIKENESS=${k}`,
    dud: 'DUD REMOVED',
    reset: 'ATTEMPTS RESET',
    nothing: 'NO EFFECT',
    leave: 'ESC · WALK AWAY',
    pieces: ['plate'],
    text: { plate: 'KASUGA · SYS-7' },
  },
  slab: { tries: 'TRIES', likeness: (k, of) => `${k} OF ${of}`, dud: 'DUD STRUCK', reset: 'TRIES BACK', nothing: 'NOTHING', leave: 'ESC', pieces: ['keys', 'name'] },
  holo: { tries: 'TRIES', likeness: (k, of) => `${k} of ${of}`, dud: 'dud gone', reset: 'tries back', nothing: 'nothing', leave: 'LEAVE', pieces: ['corners'] },
  meridian,
  'meridian-deaf': { ...meridian, text: { signal: 'NO UPLINK · LOCAL ONLY' } },
  sentinel: {
    tries: 'TRY',
    likeness: (k, of) => `NEG ${k}/${of}`,
    dud: 'DUD X',
    reset: 'TRY RESET',
    nothing: 'NIL',
    leave: 'ESC',
    pieces: ['stencil'],
    text: { stencil: 'SENTINEL FD-9' },
  },
  dock: {
    tries: 'SCANS LEFT',
    likeness: (k, of) => `NO MATCH ${k}/${of}`,
    dud: 'VOID LINE',
    reset: 'SCANS RESET',
    nothing: 'NO LINE',
    leave: 'LEAVE',
    pieces: ['manifest'],
    text: { manifest: 'MANIFEST' },
  },
  pocket: { tries: '', likeness: (k, of) => `${k}/${of}`, dud: 'dud gone', reset: 'tries back', nothing: '—', leave: 'ESC', pieces: ['column'] },
  ice: { tries: 'LOCKOUT FUSES', likeness: (k, of) => `REJECT · ${k}/${of}`, dud: 'DUD PURGED', reset: 'FUSES RESET', nothing: 'NULL', leave: 'DISCONNECT', pieces: ['alarm', 'linked'] },
};

/** The setup's skin; none, or one this build doesn't know, is `green`. */
export function skinOf(s: Pick<TerminalSetup, 'skin'>): TerminalSkin {
  return s.skin && Object.hasOwn(SKINS, s.skin) ? s.skin : 'green';
}
