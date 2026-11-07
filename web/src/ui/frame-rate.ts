/** How often the room redraws (SYS → FRAME RATE). Kept per browser like TEXT SIZE. */
export const FRAME_RATES = ['30', '60', 'uncapped'] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
const RATE_KEY = 'lowlight.frameRate';

/** The saved rate; 60 when none is saved, it isn't one, or storage is off. */
export function loadFrameRate(): FrameRate {
  try {
    const v = localStorage.getItem(RATE_KEY);
    return (FRAME_RATES as readonly string[]).includes(v ?? '') ? (v as FrameRate) : '60';
  } catch {
    return '60';
  }
}

export function saveFrameRate(r: FrameRate): void {
  try {
    localStorage.setItem(RATE_KEY, r);
  } catch {
    // Storage off: the rate holds for this page only.
  }
}

/** What the renderer's cap takes: 0 draws every frame the monitor offers. */
export function maxFps(r: FrameRate): number {
  return r === 'uncapped' ? 0 : Number(r);
}
