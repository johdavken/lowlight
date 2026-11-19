/**
 * The comms strip's line (the board, crew rules): her words, *actions* in italics, typed in at the box settings' TEXT
 * speed in its TEXT EFFECT by the same typing as the board's page (ui/type-in.ts), so the two read as one voice. TEXT
 * SIZE and FONT reach it as they reach the page, through the stage's --text-scale and --chat-font (board.css). AUTO PAGE
 * has nothing to turn here: the line scrolls in place.
 */
import type { TextEffect } from '../../ui/box-prefs';
import { typeIn } from '../../ui/type-in';
import { proseNodes } from '../table/el';

export interface SayLine {
  /** Her line (null: none). The same line again keeps its place; a line that grows (streaming) types on from where it is. */
  say(text: string | null): void;
  /** Empties the strip; the next line stands whole (the board coming back up: an old line isn't typed again). */
  reset(): void;
  /** Shows the rest of a line typing now; true when one was. */
  finish(): boolean;
  setTextSpeed(scale: number): void;
  setTextEffect(e: TextEffect): void;
  typing(): boolean;
}

export function mountSayLine(node: HTMLElement, o: { reduced(): boolean }): SayLine {
  let text: string | null = null;
  const typer = typeIn(node, { reduced: o.reduced });
  return {
    say(next) {
      const t = next ?? '';
      if (t === text) return;
      // A new line starts at its top, not where the last one was scrolled to.
      if (text === null || !t.startsWith(text)) node.scrollTop = 0;
      text = t;
      node.replaceChildren(...proseNodes(t));
      typer.changed();
    },
    reset() {
      text = null;
      node.replaceChildren();
      typer.reset();
    },
    finish: () => typer.finish(),
    setTextSpeed: (scale) => typer.setTextSpeed(scale),
    setTextEffect: (e) => typer.setTextEffect(e),
    typing: () => typer.typing(),
  };
}
