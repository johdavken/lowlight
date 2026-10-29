import { isFlat, type FrameSize } from '../../../shared/frame';

/** Maximum camera travel at parallax 1, in render-texture pixels. Layers carry ceil(parallax*48) px of margin. */
export const CAMERA_MAX_X = 24;
export const CAMERA_MAX_Y = 6;

// Breathing drift + mouse share each axis budget: drift amplitudes sum to 14/3, mouse adds 10/3.
const MOUSE_X = 10;
const MOUSE_Y = 3;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Camera offset at parallax 1: a slow, aperiodic "breathing" drift (incommensurate sines)
 * plus mouse parallax. `mouse` is in -1..1 (clamped); moving right shifts the scene left.
 */
export function cameraOffset(tSec: number, mouse: { x: number; y: number }): { x: number; y: number } {
  const driftX = 10 * Math.sin(tSec * 0.21) + 4 * Math.sin(tSec * 0.53 + 1.3);
  const driftY = 2 * Math.sin(tSec * 0.31 + 0.7) + 1 * Math.sin(tSec * 0.77 + 2.1);
  return {
    x: driftX - clamp1(mouse.x) * MOUSE_X,
    y: driftY - clamp1(mouse.y) * MOUSE_Y,
  };
}

/** The camera for a room: a flat room has no depth to show, so it holds perfectly still. */
export function cameraFor(res: FrameSize, tSec: number, mouse: { x: number; y: number }): { x: number; y: number } {
  return isFlat(res) ? { x: 0, y: 0 } : cameraOffset(tSec, mouse);
}
