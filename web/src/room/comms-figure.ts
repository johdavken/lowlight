/**
 * Her comms figure (2026-11-08): a pose of her own for being on the line (`commsFigure` in character.json), standing
 * where she does while she's on comms, on a job beat's other room, or on a `comms:` beat. Without one she's hidden on
 * comms as before (and stays as she is on a `comms:` beat). A beat's brought guest keeps the slot.
 */
export interface LineState {
  /** A real call (the map's ON COMMS). */
  comms: boolean;
  /** A job beat is set in another room (`room:`). */
  beatRoom: boolean;
  /** That beat brought a guest, who stands in the slot. */
  beatGuest: boolean;
  /** A `comms: yes` beat: she's on the line, the room is yours. */
  beatComms: boolean;
  /** A `here: yes` beat (House Glass spec): she's in the beat's room with you, as herself. */
  beatHere: boolean;
}

/** What her side of the stage shows: her comms figure, nothing (on the line without one), or her as she is. */
export function herSide(s: LineState, hasCommsFigure: boolean): 'comms' | 'hidden' | 'her' {
  if (s.beatRoom && s.beatGuest) return 'her';
  if (s.beatHere && !s.comms) return 'her';
  const away = s.comms || (s.beatRoom && !s.beatHere);
  if (hasCommsFigure && (away || s.beatComms)) return 'comms';
  return away ? 'hidden' : 'her';
}

/**
 * The room to dress her for. During a beat room she keeps the outfit she arrived in, the real room's (playtest call,
 * 2026-11-08: Lark's finale is in her walk-up, whose outfit is her sleepwear); else the scene given.
 */
export function dressSceneFor(sceneId: string | null, s: { beatRoom: string | null; realRoom: string | null }): string | null {
  return s.beatRoom !== null && s.realRoom !== null ? s.realRoom : sceneId;
}

/** Whether her face follows her actions: in the room, or on a here beat while her own figure stands (not on the line). */
export function faceShows(s: { beatRoom: string | null; beatHere: boolean; rightShows: 'her' | 'comms' | 'other' }): boolean {
  return s.beatRoom === null || (s.beatHere && s.rightShows === 'her');
}
