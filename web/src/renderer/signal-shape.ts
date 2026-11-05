/** How far through a signal drop the picture has become a line; the rest shrinks the line to nothing. */
const LINE_AT = 0.75;
/** The line's height, as a share of the picture. */
const LINE_HEIGHT = 0.006;

/** A CRT losing signal at `amount` (0..1): the picture's height and width as shares of the frame, and how far it has burnt to white. */
export function signalShape(amount: number): { height: number; width: number; flash: number } {
  const a = Math.max(0, Math.min(1, amount));
  const k = Math.min(1, a / LINE_AT);
  const tail = Math.max(0, (a - LINE_AT) / (1 - LINE_AT));
  return { height: 1 + (LINE_HEIGHT - 1) * k, width: a >= 1 ? 0 : 1 - tail * tail, flash: k * k * k };
}
