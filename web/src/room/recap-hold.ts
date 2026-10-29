/**
 * The recap card behind the district load screen (spec 2026-10-11): a recap that arrives while the
 * screen is up waits and shows when it closes; the greeting follows the card either way.
 */
export interface RecapHold {
  /** A recap event's text (null: none, or already seen). False when the screen is closed: the room shows it as usual. */
  recap(text: string | null, introOpen: boolean): boolean;
  /** The screen closed: show what's held, and let the greeting go. */
  introClosed(): void;
}

export function createRecapHold(o: {
  show: (text: string) => void;
  greet: { onRecap(cardShown: boolean): void; onRecapSeen(): void; onIntroClosed(): void };
}): RecapHold {
  let held: string | null = null;
  return {
    recap(text, introOpen) {
      if (!introOpen) return false;
      // A held card counts as up, so the greeting still waits for it; a later null (a reconnect
      // after another tab read it) drops it.
      held = text;
      o.greet.onRecap(text !== null);
      return true;
    },
    introClosed() {
      if (held !== null) o.show(held);
      else o.greet.onRecapSeen();
      held = null;
      o.greet.onIntroClosed();
    },
  };
}
