/**
 * The HUD's place name. A job beat's `room:` holds the picture while the contact stays in her own room,
 * so her room's updates (a light, the clock) keep coming: the name follows the beat's room until the beat moves on.
 */
export interface PlaceHeader {
  /** Her real room, from a room update. */
  room(sceneId: string): void;
  /** The beat's room (`room:`), or null when the run leaves it. */
  beat(sceneId: string | null): void;
}

export function placeHeader(show: (name: string) => void, nameOf: (sceneId: string) => string | undefined): PlaceHeader {
  let real: string | null = null;
  let beat: string | null = null;
  const apply = () => {
    const id = beat ?? real;
    if (id !== null) show(nameOf(id) ?? id);
  };
  return {
    room(sceneId) {
      real = sceneId;
      apply();
    },
    beat(sceneId) {
      beat = sceneId;
      apply();
    },
  };
}
