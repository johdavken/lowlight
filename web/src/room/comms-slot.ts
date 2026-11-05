/**
 * The comms speaker slot (spec 2026-11-01): on comms with a stranger present, one face by the subtitles, the
 * speaker's: her monitor (drawn at the bust's size) on her pages, the stranger's bust on theirs. Your own
 * lines don't move it. The who's-here window lists both, so the one not speaking isn't drawn. With only one
 * of them up, each shows as before (her small monitor, or the bust).
 */
import type { CommsInset } from './comms-inset';
import type { SpeakerPortrait } from './speaker-portrait';

type Speaker = 'user' | 'contact' | 'other' | 'stranger';
export type Slot = 'comms' | 'stranger' | null;

/** Who holds the slot: `prev` is who held it last while both were up ('stranger' when they've just come in). */
export function slotFor(prev: Slot, comms: boolean, stranger: boolean, speaker: Speaker | null): Slot {
  if (!comms) return stranger ? 'stranger' : null;
  if (!stranger) return 'comms';
  if (speaker === 'contact') return 'comms';
  if (speaker === 'stranger') return 'stranger';
  return prev ?? 'stranger';
}

type Her = Parameters<CommsInset['show']>[0];
type Them = Parameters<SpeakerPortrait['show']>[0];

export interface CommsSlot {
  setComms(s: Her): void;
  setStranger(s: Them): void;
  /** The line in the box: `key` names it (its id and page's speaker), so the same line seen again changes nothing. */
  setLine(key: string, speaker: Speaker | null): void;
}

export function mountCommsSlot(inset: CommsInset, portrait: SpeakerPortrait): CommsSlot {
  let her: Her = null;
  let them: Them = null;
  let speaker: Speaker | null = null;
  let line = '';
  /** A stranger just came in on a line already showing (a quest beat isn't a line): the speaker waits for the next. */
  let fresh = false;
  let slot: Slot = null;
  let shownHer = '';
  let shownThem = '';

  const apply = () => {
    slot = slotFor(slot, her !== null, them !== null, fresh ? null : speaker);
    const both = her !== null && them !== null;
    const h = slot === 'comms' && her ? { ...her, bust: both } : null;
    const t = slot === 'stranger' ? them : null;
    // Only on a change: each show() rebuilds its face (and plays its entrance).
    const hk = h ? JSON.stringify(h) : '';
    const tk = t ? JSON.stringify(t) : '';
    if (hk !== shownHer) inset.show(h);
    if (tk !== shownThem) portrait.show(t);
    shownHer = hk;
    shownThem = tk;
  };

  return {
    setComms(s) {
      her = s;
      apply();
    },
    setStranger(s) {
      // A stranger who's just come in takes the slot: the beat brought them.
      if (s && s.name !== them?.name) {
        slot = 'stranger';
        fresh = true;
      }
      them = s;
      apply();
    },
    setLine(key, s) {
      if (key !== line) fresh = false;
      line = key;
      speaker = s;
      apply();
    },
  };
}
