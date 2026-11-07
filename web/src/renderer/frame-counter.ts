/**
 * The rate the room is really drawn at. Pixi's `ticker.FPS` is 1000 / the ms since the last drawn frame, written on
 * every monitor tick, also the ones the frame-rate cap skips, so at 60 on a 240 Hz screen it read 60, 80, 120 or 240
 * depending on which tick it was sampled on. This counts the frames that were drawn instead.
 */
export class FrameCounter {
  private stamps: number[] = [];
  private first = -1;

  /** A frame was drawn at `now` (ms). */
  drew(now: number): void {
    if (this.first < 0) this.first = now;
    this.stamps.push(now);
    const from = now - 1000;
    let drop = 0;
    while (drop < this.stamps.length && this.stamps[drop] < from) drop++;
    if (drop) this.stamps.splice(0, drop);
  }

  /** Frames a second over the last second; over the time so far in the first one. */
  rate(now: number): number {
    if (this.first < 0) return 0;
    const span = Math.min(1000, now - this.first);
    if (span <= 0) return 0;
    const from = now - 1000;
    const n = this.stamps.filter((t) => t >= from && t <= now).length;
    return (n * 1000) / span;
  }
}
